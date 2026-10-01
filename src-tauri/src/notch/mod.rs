mod window_controller;
pub use window_controller::{HostSize, MotionBounds, NotchRuntime};

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum NotchState {
    Collapsed,
    Compact,
    Expanded,
    #[default]
    Hidden,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum NotchAction {
    ToggleCompact,
    Compact,
    Expand,
    ToggleAssistant,
    Show,
    Hide,
    Collapse,
    Activity,
    BeginGeneration,
    EndGeneration,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
pub struct NotchSnapshot {
    pub state: NotchState,
    pub presentation: Presentation,
    pub revision: u64,
}
#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Presentation {
    Hidden,
    Character,
    Prompt,
    Chat,
}
impl From<NotchState> for Presentation {
    fn from(state: NotchState) -> Self {
        match state {
            NotchState::Hidden => Self::Hidden,
            NotchState::Collapsed => Self::Character,
            NotchState::Compact => Self::Prompt,
            NotchState::Expanded => Self::Chat,
        }
    }
}

/// Pure state policy. Future integrations request transitions here, not windows.
#[derive(Default)]
pub struct NotchController {
    state: NotchState,
    revision: u64,
}

impl NotchController {
    pub fn snapshot(&self) -> NotchSnapshot {
        NotchSnapshot {
            state: self.state,
            presentation: self.state.into(),
            revision: self.revision,
        }
    }
    pub fn next(&self, action: NotchAction) -> NotchState {
        use NotchAction::{Collapse, Expand, Hide, Show, ToggleAssistant, ToggleCompact};
        use NotchState::*;
        match action {
            NotchAction::Activity | NotchAction::BeginGeneration | NotchAction::EndGeneration => {
                self.state
            }
            NotchAction::Compact => NotchState::Compact,
            Expand => Expanded,
            Hide => Hidden,
            Collapse => Collapsed,
            Show => Compact,
            ToggleCompact => {
                if self.state == Collapsed || self.state == Hidden {
                    Compact
                } else {
                    Collapsed
                }
            }
            ToggleAssistant => {
                if self.state == Expanded || self.state == Compact {
                    Collapsed
                } else {
                    Compact
                }
            }
        }
    }
    fn commit(&mut self, state: NotchState) {
        if self.state != state {
            self.state = state;
            self.revision += 1;
        }
    }
}

#[derive(Clone, Debug)]
pub struct NotchConfig {
    pub top_margin: f64,
    /// None means primary monitor. A named target can be selected without changing policy.
    pub monitor: Option<String>,
    pub shortcut: String,
    pub active_idle_ms: u64,
    pub character_idle_ms: u64,
}

impl Default for NotchConfig {
    fn default() -> Self {
        Self {
            top_margin: 12.0,
            monitor: None,
            shortcut: "Alt+S".into(),
            active_idle_ms: 120_000,
            character_idle_ms: 30_000,
        }
    }
}

impl NotchConfig {
    pub fn from_environment() -> crate::error::Result<Self> {
        let mut config = Self::default();
        for (key, value) in [
            ("SLIME_ACTIVE_IDLE_MS", &mut config.active_idle_ms),
            ("SLIME_CHARACTER_IDLE_MS", &mut config.character_idle_ms),
        ] {
            if let Ok(raw) = std::env::var(key) {
                *value = raw
                    .parse()
                    .map_err(|_| crate::error::AppError::Configuration(format!("Invalid {key}")))?;
                if !(500..=3_600_000).contains(value) {
                    return Err(crate::error::AppError::Configuration(format!(
                        "{key} must be 500..3600000"
                    )));
                }
            }
        }
        if let Ok(value) = std::env::var("SLIME_NOTCH_TOP_MARGIN") {
            config.top_margin = value.parse().map_err(|_| {
                crate::error::AppError::Configuration("Invalid notch top margin".into())
            })?;
            if !config.top_margin.is_finite() || !(0.0..=200.0).contains(&config.top_margin) {
                return Err(crate::error::AppError::Configuration(
                    "Notch top margin must be between 0 and 200 logical pixels".into(),
                ));
            }
        }
        config.monitor = std::env::var("SLIME_NOTCH_MONITOR")
            .ok()
            .filter(|value| !value.is_empty());
        if let Ok(shortcut) = std::env::var("SLIME_ASSISTANT_SHORTCUT") {
            config.shortcut = shortcut;
        }
        Ok(config)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shortcut_and_escape_have_explicit_presentation_policy() {
        let mut controller = NotchController::default();
        assert_eq!(controller.snapshot().state, NotchState::Hidden);
        for (state, target) in [
            (NotchState::Hidden, NotchState::Compact),
            (NotchState::Collapsed, NotchState::Compact),
            (NotchState::Compact, NotchState::Collapsed),
            (NotchState::Expanded, NotchState::Collapsed),
        ] {
            controller.commit(state);
            assert_eq!(controller.next(NotchAction::ToggleAssistant), target);
            assert_eq!(controller.next(NotchAction::Show), NotchState::Compact);
        }
        controller.commit(NotchState::Expanded);
        assert_eq!(
            controller.next(NotchAction::Collapse),
            NotchState::Collapsed
        );
        let revision = controller.snapshot().revision;
        controller.commit(NotchState::Expanded);
        assert_eq!(controller.snapshot().revision, revision);
    }
    #[test]
    fn presentations_are_not_geometry_names() {
        assert_eq!(Presentation::from(NotchState::Hidden), Presentation::Hidden);
        assert_eq!(
            Presentation::from(NotchState::Collapsed),
            Presentation::Character
        );
        assert_eq!(
            Presentation::from(NotchState::Compact),
            Presentation::Prompt
        );
        assert_eq!(Presentation::from(NotchState::Expanded), Presentation::Chat);
    }
}
