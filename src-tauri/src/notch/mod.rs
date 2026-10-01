mod window_controller;
pub use window_controller::{HostSize, MotionBounds, NotchRuntime};

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum NotchState {
    #[default]
    Collapsed,
    Compact,
    Expanded,
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
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
pub struct NotchSnapshot {
    pub state: NotchState,
    pub revision: u64,
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
            revision: self.revision,
        }
    }
    pub fn next(&self, action: NotchAction) -> NotchState {
        use NotchAction::{Collapse, Expand, Hide, Show, ToggleAssistant, ToggleCompact};
        use NotchState::*;
        match action {
            NotchAction::Compact => NotchState::Compact,
            Expand => Expanded,
            Hide => Hidden,
            Collapse => Collapsed,
            Show => {
                if self.state == Hidden {
                    Collapsed
                } else {
                    self.state
                }
            }
            ToggleCompact => {
                if self.state == Collapsed {
                    Compact
                } else {
                    Collapsed
                }
            }
            ToggleAssistant => {
                if self.state == Expanded {
                    Collapsed
                } else {
                    Expanded
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
}

impl Default for NotchConfig {
    fn default() -> Self {
        Self {
            top_margin: 12.0,
            monitor: None,
            shortcut: "Alt+S".into(),
        }
    }
}

impl NotchConfig {
    pub fn from_environment() -> crate::error::Result<Self> {
        let mut config = Self::default();
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
    fn semantic_toggle_summons_from_hidden_and_collapsed() {
        let mut controller = NotchController::default();
        assert_eq!(
            controller.next(NotchAction::ToggleAssistant),
            NotchState::Expanded
        );
        controller.commit(NotchState::Hidden);
        assert_eq!(
            controller.next(NotchAction::ToggleAssistant),
            NotchState::Expanded
        );
        controller.commit(NotchState::Expanded);
        assert_eq!(
            controller.next(NotchAction::ToggleAssistant),
            NotchState::Collapsed
        );
    }
    #[test]
    fn compact_toggle_and_tray_restore_have_explicit_policy() {
        let mut controller = NotchController::default();
        controller.commit(controller.next(NotchAction::ToggleCompact));
        assert_eq!(controller.snapshot().state, NotchState::Compact);
        assert_eq!(
            controller.next(NotchAction::ToggleCompact),
            NotchState::Collapsed
        );
        assert_eq!(controller.next(NotchAction::Show), NotchState::Compact);
        controller.commit(NotchState::Hidden);
        assert_eq!(controller.next(NotchAction::Show), NotchState::Collapsed);
        let revision = controller.snapshot().revision;
        controller.commit(NotchState::Hidden);
        assert_eq!(controller.snapshot().revision, revision);
    }
}
