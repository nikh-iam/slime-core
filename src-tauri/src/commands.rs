use crate::{
    error::{AppError, CommandError},
    notch::{HostSize, MotionBounds, NotchAction, NotchRuntime, NotchSnapshot},
    platform::{PlatformInfo, PlatformService},
    storage::{Settings, Storage},
};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};

pub struct AppState {
    pub platform: Box<dyn PlatformService>,
    pub storage: Mutex<Storage>,
    pub notch: Mutex<NotchRuntime>,
}
#[tauri::command]
pub async fn ai_initialize(model: State<'_, crate::ai::LocalModel>) -> Result<(), String> {
    model.initialize().await
}
#[tauri::command]
pub async fn ai_generate(
    app: tauri::AppHandle,
    model: State<'_, crate::ai::LocalModel>,
    messages: Vec<crate::ai::Message>,
    on_event: tauri::ipc::Channel<crate::ai::AIEvent>,
) -> Result<String, String> {
    dispatch_logged(&app, NotchAction::BeginGeneration, false);
    let result = model.generate(messages, on_event).await;
    if !model.busy() {
        dispatch_logged(&app, NotchAction::EndGeneration, false);
    }
    result
}
#[tauri::command]
pub fn ai_cancel(model: State<'_, crate::ai::LocalModel>) {
    model.cancel();
}
#[tauri::command]
pub fn ai_shutdown(model: State<'_, crate::ai::LocalModel>) {
    model.unload();
}
#[derive(Serialize)]
pub struct CoreStatus {
    platform: PlatformInfo,
    settings: Settings,
}

pub fn dispatch(
    app: &tauri::AppHandle,
    action: NotchAction,
    focus: bool,
) -> crate::error::Result<NotchSnapshot> {
    let state = app.state::<AppState>();
    let snapshot = state.notch.lock().map_err(|_| AppError::State)?.apply(
        state.platform.as_ref(),
        action,
        focus,
    )?;
    app.emit_to("notch", "notch-state", snapshot)?;
    Ok(snapshot)
}
pub fn dispatch_logged(app: &tauri::AppHandle, action: NotchAction, focus: bool) {
    if let Err(error) = dispatch(app, action, focus) {
        log::error!("Notch transition failed: {error}");
    }
}
#[tauri::command]
pub fn notch_motion(
    state: State<'_, AppState>,
    bounds: MotionBounds,
) -> Result<HostSize, CommandError> {
    Ok(state
        .notch
        .lock()
        .map_err(|_| AppError::State)?
        .motion(state.platform.as_ref(), bounds)?)
}
#[tauri::command]
pub fn notch_snapshot(state: State<'_, AppState>) -> Result<NotchSnapshot, CommandError> {
    Ok(state.notch.lock().map_err(|_| AppError::State)?.snapshot())
}
#[tauri::command]
pub fn notch_ready(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<NotchSnapshot, CommandError> {
    let snapshot = state
        .notch
        .lock()
        .map_err(|_| AppError::State)?
        .ready(state.platform.as_ref())?;
    app.emit_to("notch", "notch-state", snapshot)
        .map_err(AppError::from)?;
    Ok(snapshot)
}
#[tauri::command]
pub fn notch_action(
    app: tauri::AppHandle,
    action: NotchAction,
) -> Result<NotchSnapshot, CommandError> {
    Ok(dispatch(&app, action, false)?)
}
#[tauri::command]
pub fn core_status(state: State<'_, AppState>) -> Result<CoreStatus, CommandError> {
    let settings = state
        .storage
        .lock()
        .map_err(|_| AppError::State)?
        .settings()?;
    Ok(CoreStatus {
        platform: state.platform.info()?,
        settings,
    })
}
#[tauri::command]
pub fn platform_info(state: State<'_, AppState>) -> Result<PlatformInfo, CommandError> {
    Ok(state.platform.info()?)
}
#[tauri::command]
pub fn screen_scale_factor(state: State<'_, AppState>) -> Result<f64, CommandError> {
    Ok(state.platform.scale_factor()?)
}
#[tauri::command]
pub fn hide_window(app: tauri::AppHandle) -> Result<(), CommandError> {
    dispatch(&app, NotchAction::Hide, false)?;
    Ok(())
}
#[tauri::command]
pub fn quit_application(state: State<'_, AppState>) {
    state.platform.quit();
}
