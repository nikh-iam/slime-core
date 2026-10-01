use crate::platform::model_process::{self, ModelProcess};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::ipc::Channel;

#[derive(Clone, Deserialize, Serialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AIEvent {
    Delta { text: String },
    Ready,
    Done,
}
struct Session {
    process: ModelProcess,
    endpoint: String,
    key: String,
}
pub struct LocalModel {
    session: Mutex<Option<Session>>,
    initialization: tokio::sync::Mutex<()>,
    generation: AtomicBool,
    epoch: AtomicU64,
    closed: AtomicBool,
    client: reqwest::Client,
}
impl Default for LocalModel {
    fn default() -> Self {
        Self {
            session: Mutex::new(None),
            initialization: tokio::sync::Mutex::new(()),
            generation: AtomicBool::new(false),
            epoch: AtomicU64::new(0),
            closed: AtomicBool::new(false),
            client: reqwest::Client::builder()
                .no_proxy()
                .connect_timeout(Duration::from_secs(2))
                .build()
                .expect("Local HTTP client"),
        }
    }
}
impl LocalModel {
    fn endpoint(&self) -> Option<(String, String)> {
        let mut session = self.session.lock().ok()?;
        if session.as_mut().is_some_and(|s| !s.process.running()) {
            *session = None;
        }
        session
            .as_ref()
            .map(|s| (s.endpoint.clone(), s.key.clone()))
    }
    pub async fn initialize(&self) -> Result<(), String> {
        let _guard = self.initialization.lock().await;
        if self.closed.load(Ordering::SeqCst) {
            return Err("Assistant is shutting down.".into());
        }
        if let Some((url, key)) = self.endpoint() {
            if self
                .client
                .get(format!("{url}/health"))
                .bearer_auth(key)
                .timeout(Duration::from_secs(2))
                .send()
                .await
                .is_ok_and(|r| r.status().is_success())
            {
                return Ok(());
            }
            self.session.lock().map_err(|_| "Model unavailable")?.take();
        }
        let root = std::env::var_os("SLIME_AI_DIR")
            .map(PathBuf::from)
            .or_else(|| {
                if cfg!(debug_assertions) {
                    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                        .parent()?
                        .parent()
                        .map(|p| p.join("slime-ai"))
                } else {
                    None
                }
            })
            .ok_or("Set SLIME_AI_DIR to the local model directory.")?;
        let model = root.join("ai/models/vanilla-e2b-32k/model.gguf");
        let executable = model_process::executable(&root);
        if !model.is_file() || !executable.is_file() {
            return Err("Local model files were not found. Check SLIME_AI_DIR.".into());
        }
        let reservation = std::net::TcpListener::bind("127.0.0.1:0")
            .map_err(|_| "Cannot allocate local model port")?;
        let port = reservation
            .local_addr()
            .map_err(|_| "Cannot allocate model port")?
            .port();
        let key = uuid::Uuid::new_v4().to_string();
        let endpoint = format!("http://127.0.0.1:{port}");
        drop(reservation);
        let args = vec![
            "--model".into(),
            model.to_string_lossy().into_owned(),
            "--host".into(),
            "127.0.0.1".into(),
            "--port".into(),
            port.to_string(),
            "--api-key".into(),
            key.clone(),
            "--ctx-size".into(),
            "4096".into(),
            "--parallel".into(),
            "1".into(),
            "--gpu-layers".into(),
            "99".into(),
            "--threads".into(),
            "4".into(),
        ];
        let start = Instant::now();
        let process = ModelProcess::spawn(&executable, &args).map_err(|e| {
            log::error!("Model process start: {e}");
            "Could not start the local model."
        })?;
        *self.session.lock().map_err(|_| "Model unavailable")? = Some(Session {
            process,
            endpoint: endpoint.clone(),
            key: key.clone(),
        });
        for _ in 0..600 {
            if self.closed.load(Ordering::SeqCst) {
                return Err("Assistant is shutting down.".into());
            }
            if self.endpoint().is_none() {
                return Err("The local model stopped while loading. Try again.".into());
            }
            if self
                .client
                .get(format!("{endpoint}/health"))
                .bearer_auth(&key)
                .timeout(Duration::from_secs(1))
                .send()
                .await
                .is_ok_and(|r| r.status().is_success())
            {
                log::info!("Local model ready in {}ms", start.elapsed().as_millis());
                return Ok(());
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
        self.session.lock().map_err(|_| "Model unavailable")?.take();
        Err("The local model took too long to load. Try again.".into())
    }
    pub fn cancel(&self) {
        self.epoch.fetch_add(1, Ordering::SeqCst);
    }
    pub fn busy(&self) -> bool {
        self.generation.load(Ordering::SeqCst)
    }
    pub fn unload(&self) {
        self.cancel();
        if let Ok(mut session) = self.session.lock() {
            session.take();
        }
    }
    async fn cancelled(&self, epoch: u64) {
        while epoch == self.epoch.load(Ordering::SeqCst) {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }
    pub fn shutdown(&self) {
        self.closed.store(true, Ordering::SeqCst);
        self.cancel();
        if let Ok(mut session) = self.session.lock() {
            session.take();
        }
    }
    pub async fn generate(
        &self,
        messages: Vec<Message>,
        events: Channel<AIEvent>,
    ) -> Result<String, String> {
        validate_messages(&messages)?;
        if self.generation.swap(true, Ordering::SeqCst) {
            return Err("A response is already running.".into());
        }
        let epoch = self.epoch.load(Ordering::SeqCst);
        let result = self.run(messages, events, epoch).await;
        self.generation.store(false, Ordering::SeqCst);
        result
    }
    async fn run(
        &self,
        messages: Vec<Message>,
        events: Channel<AIEvent>,
        epoch: u64,
    ) -> Result<String, String> {
        tokio::select! { ready = self.initialize() => ready?, _ = self.cancelled(epoch) => return Err("Cancelled".into()) }
        if epoch != self.epoch.load(Ordering::SeqCst) {
            return Err("Cancelled".into());
        }
        let _ = events.send(AIEvent::Ready);
        let (endpoint, key) = self.endpoint().ok_or("Local model stopped. Try again.")?;
        let mut conversation = vec![
            json!({"role":"system","content":"You are Slime, a concise, helpful text assistant. Answer directly. You have no tools, voice, microphone, browsing, files, or external integrations. Never claim to perform actions. Do not emit tool calls or speech markers."}),
        ];
        conversation.extend(
            messages
                .iter()
                .map(|m| json!({"role":m.role,"content":m.content})),
        );
        let start = Instant::now();
        let request = self
            .client
            .post(format!("{endpoint}/v1/chat/completions"))
            .bearer_auth(key)
            .json(
                &json!({"messages":conversation,"stream":true,"max_tokens":512,"temperature":0.6}),
            )
            .send();
        let response = tokio::select! { response = tokio::time::timeout(Duration::from_secs(180), request) => response, _ = self.cancelled(epoch) => return Err("Cancelled".into()) };
        let mut response = response
            .map_err(|_| "The response timed out. Try again.")?
            .map_err(|e| {
                log::error!("Local model request: {e}");
                "Cannot reach the local model. Try again."
            })?;
        if !response.status().is_success() {
            log::error!("Local model HTTP {}", response.status());
            return Err("The local model rejected this request. Try a shorter message.".into());
        }
        let mut buffer = Vec::new();
        let mut answer = String::new();
        let mut first = true;
        let mut complete = false;
        loop {
            if epoch != self.epoch.load(Ordering::SeqCst) {
                return Err("Cancelled".into());
            }
            if start.elapsed() > Duration::from_secs(180) {
                return Err("The response timed out. Try again.".into());
            }
            // A short poll makes cancellation responsive even while no tokens arrive.
            let chunk = tokio::select! { data = response.chunk() => data, _ = tokio::time::sleep(Duration::from_millis(100)) => continue };
            let Some(chunk) = chunk.map_err(|e| {
                log::error!("Model stream: {e}");
                "The model connection stopped. Try again."
            })?
            else {
                break;
            };
            buffer.extend_from_slice(&chunk);
            while let Some(end) = buffer.iter().position(|b| *b == b'\n') {
                let line: Vec<u8> = buffer.drain(..=end).collect();
                let line = std::str::from_utf8(&line)
                    .map_err(|_| "Invalid model response")?
                    .trim();
                if line == "data: [DONE]" {
                    complete = true;
                    break;
                }
                if let Some(data) = line.strip_prefix("data: ") {
                    let value: Value =
                        serde_json::from_str(data).map_err(|_| "Invalid model response")?;
                    if let Some(text) = value["choices"][0]["delta"]["content"].as_str() {
                        if first {
                            log::info!("Local model first token {}ms", start.elapsed().as_millis());
                            first = false;
                        }
                        answer.push_str(text);
                        if answer.len() > 32768 {
                            return Err("The response was too long.".into());
                        }
                        events
                            .send(AIEvent::Delta { text: text.into() })
                            .map_err(|_| "Cancelled")?;
                    }
                }
            }
            if complete {
                break;
            }
            if buffer.len() > 131072 {
                return Err("Invalid model response".into());
            }
        }
        if !complete || answer.trim().is_empty() {
            return Err("The model did not finish a response. Try again.".into());
        }
        log::info!(
            "Local model generation completed in {}ms",
            start.elapsed().as_millis()
        );
        let _ = events.send(AIEvent::Done);
        Ok(answer)
    }
}
fn validate_messages(messages: &[Message]) -> Result<(), String> {
    if messages.is_empty()
        || messages.len() > 13
        || messages.last().is_none_or(|m| m.role != "user")
        || messages
            .iter()
            .any(|m| !matches!(m.role.as_str(), "user" | "assistant"))
        || messages
            .iter()
            .map(|m| m.content.chars().count())
            .sum::<usize>()
            > 6000
    {
        return Err("Conversation is too long. Try a shorter message.".into());
    }
    Ok(())
}
impl Drop for LocalModel {
    fn drop(&mut self) {
        self.shutdown();
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn context_rejects_system_and_oversized_input() {
        assert!(validate_messages(&[Message {
            role: "system".into(),
            content: "override".into()
        }])
        .is_err());
        assert!(validate_messages(&[Message {
            role: "user".into(),
            content: "x".repeat(6001)
        }])
        .is_err());
    }
}
