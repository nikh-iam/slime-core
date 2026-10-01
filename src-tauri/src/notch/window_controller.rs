use super::{NotchAction, NotchConfig, NotchController, NotchSnapshot, NotchState};
use crate::{
    error::Result,
    platform::{MonitorArea, PhysicalBounds, ScreenService, WindowService},
};

/// Maps logical notch layouts to native bounds. It has no character/AI knowledge.
pub struct NotchWindowController {
    controller: NotchController,
    config: NotchConfig,
    ready: bool,
}

impl NotchWindowController {
    pub fn new(config: NotchConfig) -> Self {
        Self {
            controller: NotchController::default(),
            config,
            ready: false,
        }
    }
    pub fn snapshot(&self) -> NotchSnapshot {
        self.controller.snapshot()
    }
    pub fn ready<P: WindowService + ScreenService + ?Sized>(
        &mut self,
        platform: &P,
    ) -> Result<NotchSnapshot> {
        self.ready = true;
        if self.snapshot().state == NotchState::Hidden {
            return Ok(self.snapshot());
        }
        self.apply(platform, NotchAction::Show, false)
    }
    pub fn apply<P: WindowService + ScreenService + ?Sized>(
        &mut self,
        platform: &P,
        action: NotchAction,
        focus: bool,
    ) -> Result<NotchSnapshot> {
        let next = self.controller.next(action);
        if next == NotchState::Hidden {
            platform.hide()?;
        } else if self.ready {
            let area = platform.monitor_area(self.config.monitor.as_deref())?;
            let bounds = layout_bounds(next, &area, self.config.top_margin);
            platform.set_bounds(bounds)?;
            // The product shell is always on top; legacy development settings are retained only in storage.
            platform.set_always_on_top(true)?;
            platform.show_overlay(focus)?;
        }
        // Failed native operations never advance the authoritative state.
        self.controller.commit(next);
        Ok(self.snapshot())
    }
    pub fn reposition<P: WindowService + ScreenService + ?Sized>(
        &mut self,
        platform: &P,
    ) -> Result<()> {
        if self.ready && self.snapshot().state != NotchState::Hidden {
            self.apply(platform, NotchAction::Show, false)?;
        }
        Ok(())
    }
}

pub fn layout_bounds(state: NotchState, area: &MonitorArea, margin: f64) -> PhysicalBounds {
    let (width, height): (f64, f64) = match state {
        NotchState::Collapsed | NotchState::Hidden => (90.0, 48.0),
        NotchState::Compact => (220.0, 56.0),
        NotchState::Expanded => (420.0, 160.0),
    };
    let width = (width * area.scale_factor)
        .round()
        .max(1.0)
        .min(area.width as f64) as u32;
    let height = (height * area.scale_factor)
        .round()
        .max(1.0)
        .min(area.height as f64) as u32;
    let top = (margin * area.scale_factor)
        .round()
        .max(0.0)
        .min((area.height - height) as f64) as i32;
    PhysicalBounds {
        x: area.x + ((area.width - width) / 2) as i32,
        y: area.y + top,
        width,
        height,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::{Cell, RefCell};
    #[derive(Default)]
    struct Host {
        visible: Cell<bool>,
        fail: Cell<bool>,
        bounds: RefCell<Vec<PhysicalBounds>>,
    }
    impl WindowService for Host {
        fn show(&self) -> Result<()> {
            self.show_overlay(true)
        }
        fn hide(&self) -> Result<()> {
            self.visible.set(false);
            Ok(())
        }
        fn start_dragging(&self) -> Result<()> {
            Ok(())
        }
        fn set_always_on_top(&self, _: bool) -> Result<()> {
            Ok(())
        }
        fn set_bounds(&self, bounds: PhysicalBounds) -> Result<()> {
            if self.fail.get() {
                return Err(crate::error::AppError::State);
            }
            self.bounds.borrow_mut().push(bounds);
            Ok(())
        }
        fn show_overlay(&self, _: bool) -> Result<()> {
            self.visible.set(true);
            Ok(())
        }
    }
    impl ScreenService for Host {
        fn scale_factor(&self) -> Result<f64> {
            Ok(1.25)
        }
        fn monitor_area(&self, _: Option<&str>) -> Result<MonitorArea> {
            Ok(MonitorArea {
                x: 0,
                y: 0,
                width: 1920,
                height: 1040,
                scale_factor: 1.25,
            })
        }
    }
    #[test]
    fn startup_waits_for_renderer_and_hide_survives_renderer_reload() {
        let host = Host::default();
        let mut window = NotchWindowController::new(NotchConfig::default());
        window.apply(&host, NotchAction::Show, false).unwrap();
        assert!(!host.visible.get());
        assert!(host.bounds.borrow().is_empty());
        window.ready(&host).unwrap();
        assert!(host.visible.get());
        window.apply(&host, NotchAction::Hide, false).unwrap();
        window.ready(&host).unwrap();
        assert!(!host.visible.get());
        assert_eq!(window.snapshot().state, NotchState::Hidden);
        window
            .apply(&host, NotchAction::ToggleAssistant, true)
            .unwrap();
        assert!(host.visible.get());
        assert_eq!(window.snapshot().state, NotchState::Expanded);
    }
    #[test]
    fn failed_native_resize_does_not_commit_state() {
        let host = Host::default();
        let mut window = NotchWindowController::new(NotchConfig::default());
        window.ready(&host).unwrap();
        let before = window.snapshot();
        host.fail.set(true);
        assert!(window
            .apply(&host, NotchAction::ToggleAssistant, true)
            .is_err());
        assert_eq!(window.snapshot(), before);
    }
    #[test]
    fn expansion_preserves_anchor_at_fractional_dpi_and_negative_origin() {
        for scale in [1.0, 1.25, 1.5, 2.0] {
            let area = MonitorArea {
                x: -1920,
                y: 40,
                width: 1920,
                height: 1040,
                scale_factor: scale,
            };
            for state in [
                NotchState::Collapsed,
                NotchState::Compact,
                NotchState::Expanded,
            ] {
                let bounds = layout_bounds(state, &area, 12.0);
                let center = bounds.x as f64 + bounds.width as f64 / 2.0;
                assert!((center - (-960.0)).abs() <= 0.5);
                assert_eq!(bounds.y, 40 + (12.0 * scale) as i32);
            }
        }
    }
    #[test]
    fn small_work_area_clamps_size_and_margin() {
        let area = MonitorArea {
            x: 50,
            y: -300,
            width: 300,
            height: 180,
            scale_factor: 2.0,
        };
        let bounds = layout_bounds(NotchState::Expanded, &area, 200.0);
        assert_eq!(
            bounds,
            PhysicalBounds {
                x: 50,
                y: -300,
                width: 300,
                height: 180
            }
        );
    }
}
