use super::{NotchAction, NotchConfig, NotchController, NotchSnapshot, NotchState};
use crate::{
    error::{AppError, Result},
    platform::{MonitorArea, PhysicalBounds, ScreenService, WindowService},
};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionBounds {
    pub revision: u64,
    pub width: f64,
    pub height: f64,
    pub settled: bool,
}
#[derive(Serialize)]
pub struct HostSize {
    pub width: f64,
    pub height: f64,
}

/// Native geometry only. Semantic state and the continuous motion engine live separately.
pub struct NotchWindowController {
    config: NotchConfig,
    last: (f64, f64),
    visible: bool,
}
impl NotchWindowController {
    fn new(config: NotchConfig) -> Self {
        Self {
            config,
            last: (36.0, 1.0),
            visible: false,
        }
    }
    fn resize<P: WindowService + ScreenService + ?Sized>(
        &mut self,
        platform: &P,
        width: f64,
        height: f64,
    ) -> Result<HostSize> {
        if !width.is_finite()
            || !height.is_finite()
            || !(1.0..=540.0).contains(&width)
            || !(1.0..=420.0).contains(&height)
        {
            return Err(AppError::Configuration(
                "Invalid notch motion envelope".into(),
            ));
        }
        let area = platform.monitor_area(self.config.monitor.as_deref())?;
        let bounds = continuous_bounds(width, height, &area, self.config.top_margin);
        platform.set_bounds(bounds)?;
        self.last = (width, height);
        Ok(HostSize {
            width: bounds.width as f64 / area.scale_factor,
            height: bounds.height as f64 / area.scale_factor,
        })
    }
    fn show<P: WindowService + ScreenService + ?Sized>(
        &mut self,
        platform: &P,
        focus: bool,
    ) -> Result<()> {
        if !self.visible {
            self.resize(platform, self.last.0, self.last.1)?;
        }
        platform.set_always_on_top(true)?;
        platform.show_overlay(focus)?;
        self.visible = true;
        Ok(())
    }
}

/// Composition of semantic policy and host lifecycle. The web motion engine submits bounded envelopes.
pub struct NotchRuntime {
    controller: NotchController,
    window: NotchWindowController,
    ready: bool,
    activity_at: Instant,
    busy: bool,
    auto_restore: Option<NotchState>,
}
impl NotchRuntime {
    pub fn new(config: NotchConfig) -> Self {
        Self {
            controller: NotchController::default(),
            window: NotchWindowController::new(config),
            ready: false,
            activity_at: Instant::now(),
            busy: false,
            auto_restore: None,
        }
    }
    pub fn snapshot(&self) -> NotchSnapshot {
        self.controller.snapshot()
    }
    pub fn ready<P: WindowService + ScreenService + ?Sized>(
        &mut self,
        platform: &P,
    ) -> Result<NotchSnapshot> {
        // Renderer reload starts from pre-entry geometry, never a stale full-size surface.
        platform.hide()?;
        self.window.visible = false;
        self.window.resize(platform, 36.0, 1.0)?;
        // Invalidate all in-flight submissions from the previous renderer epoch.
        self.controller.revision += 1;
        self.ready = true;
        if self.snapshot().state != NotchState::Hidden {
            self.window.show(platform, false)?;
        }
        Ok(self.snapshot())
    }
    pub fn apply<P: WindowService + ScreenService + ?Sized>(
        &mut self,
        platform: &P,
        action: NotchAction,
        focus: bool,
    ) -> Result<NotchSnapshot> {
        let next = if matches!(action, NotchAction::Activity) {
            self.auto_restore
                .take()
                .unwrap_or(self.controller.next(action))
        } else {
            self.controller.next(action)
        };
        self.activity_at = Instant::now();
        if matches!(action, NotchAction::BeginGeneration) {
            self.busy = true;
        }
        if matches!(action, NotchAction::EndGeneration) {
            self.busy = false;
        }
        if !matches!(action, NotchAction::Activity) {
            self.auto_restore = None;
        }
        if self.ready && next != NotchState::Hidden {
            self.window.show(platform, focus)?;
        }
        self.controller.commit(next);
        Ok(self.snapshot())
    }
    pub fn tick<P: WindowService + ScreenService + ?Sized>(
        &mut self,
        platform: &P,
        now: Instant,
    ) -> Result<Option<NotchSnapshot>> {
        if self.busy || !self.ready {
            return Ok(None);
        }
        let state = self.snapshot().state;
        let (delay, action) = match state {
            NotchState::Compact | NotchState::Expanded => {
                (self.window.config.active_idle_ms, NotchAction::Collapse)
            }
            NotchState::Collapsed => (self.window.config.character_idle_ms, NotchAction::Hide),
            NotchState::Hidden => return Ok(None),
        };
        if now.saturating_duration_since(self.activity_at) < Duration::from_millis(delay) {
            return Ok(None);
        }
        let snapshot = self.apply(platform, action, false)?;
        self.activity_at = now;
        self.auto_restore = Some(state);
        Ok(Some(snapshot))
    }
    pub fn motion<P: WindowService + ScreenService + ?Sized>(
        &mut self,
        platform: &P,
        bounds: MotionBounds,
    ) -> Result<HostSize> {
        if bounds.revision != self.snapshot().revision || !self.ready {
            return Ok(HostSize {
                width: self.window.last.0,
                height: self.window.last.1,
            });
        }
        let size = self.window.resize(platform, bounds.width, bounds.height)?;
        if bounds.settled {
            self.auto_restore = None;
        }
        if bounds.settled && self.snapshot().state == NotchState::Hidden {
            platform.hide()?;
            self.window.visible = false;
        }
        Ok(size)
    }
    pub fn reposition<P: WindowService + ScreenService + ?Sized>(
        &mut self,
        platform: &P,
    ) -> Result<()> {
        if self.ready {
            self.window
                .resize(platform, self.window.last.0, self.window.last.1)?;
        }
        Ok(())
    }
}
pub fn continuous_bounds(
    width: f64,
    height: f64,
    area: &MonitorArea,
    margin: f64,
) -> PhysicalBounds {
    let mut width = (width * area.scale_factor)
        .ceil()
        .max(1.0)
        .min(area.width as f64) as u32;
    // Match monitor parity so host center never alternates by half a physical pixel.
    if width < area.width && width % 2 != area.width % 2 {
        width += 1;
    }
    let height = (height * area.scale_factor)
        .ceil()
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
        let mut window = NotchRuntime::new(NotchConfig::default());
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
        assert_eq!(window.snapshot().state, NotchState::Compact);
    }
    #[test]
    fn failed_native_resize_does_not_modify_semantic_state() {
        let host = Host::default();
        let mut window = NotchRuntime::new(NotchConfig::default());
        window.ready(&host).unwrap();
        let before = window.snapshot();
        host.fail.set(true);
        assert!(window
            .motion(
                &host,
                MotionBounds {
                    revision: before.revision,
                    width: 150.0,
                    height: 54.0,
                    settled: false
                }
            )
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
                let bounds = continuous_bounds(
                    match state {
                        NotchState::Collapsed => 90.0,
                        NotchState::Compact => 220.0,
                        _ => 420.0,
                    },
                    match state {
                        NotchState::Collapsed => 48.0,
                        NotchState::Compact => 56.0,
                        _ => 160.0,
                    },
                    &area,
                    12.0,
                );
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
        let bounds = continuous_bounds(420.0, 160.0, &area, 200.0);
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

    #[test]
    fn hide_waits_for_matching_completion_and_show_prepares_small_host() {
        let host = Host::default();
        let mut runtime = NotchRuntime::new(NotchConfig::default());
        runtime.apply(&host, NotchAction::Show, false).unwrap();
        runtime.ready(&host).unwrap();
        let old = runtime.snapshot().revision;
        runtime.apply(&host, NotchAction::Hide, false).unwrap();
        assert!(host.visible.get());
        runtime
            .motion(
                &host,
                MotionBounds {
                    revision: old,
                    width: 36.0,
                    height: 1.0,
                    settled: true,
                },
            )
            .unwrap();
        assert!(host.visible.get());
        runtime
            .motion(
                &host,
                MotionBounds {
                    revision: runtime.snapshot().revision,
                    width: 36.0,
                    height: 1.0,
                    settled: true,
                },
            )
            .unwrap();
        assert!(!host.visible.get());
        runtime.apply(&host, NotchAction::Show, false).unwrap();
        assert!(host.visible.get());
        let bounds = *host.bounds.borrow().last().unwrap();
        assert_eq!((bounds.width, bounds.height), (46, 2));
    }

    #[test]
    fn stale_resize_and_stale_hide_cannot_change_restored_geometry() {
        let host = Host::default();
        let mut runtime = NotchRuntime::new(NotchConfig::default());
        runtime.ready(&host).unwrap();
        runtime.apply(&host, NotchAction::Hide, false).unwrap();
        let stale = runtime.snapshot().revision;
        runtime.apply(&host, NotchAction::Expand, true).unwrap();
        let count = host.bounds.borrow().len();
        runtime
            .motion(
                &host,
                MotionBounds {
                    revision: stale,
                    width: 36.0,
                    height: 1.0,
                    settled: true,
                },
            )
            .unwrap();
        assert_eq!(host.bounds.borrow().len(), count);
        assert!(host.visible.get());
        for width in [f64::NAN, f64::INFINITY, 0.0, 541.0] {
            assert!(runtime
                .motion(
                    &host,
                    MotionBounds {
                        revision: runtime.snapshot().revision,
                        width,
                        height: 48.0,
                        settled: false
                    }
                )
                .is_err());
        }
    }
    #[test]
    fn idle_lifecycle_waits_for_generation_and_activity_reverses_contraction() {
        let host = Host::default();
        let mut runtime = NotchRuntime::new(NotchConfig {
            active_idle_ms: 1000,
            character_idle_ms: 500,
            ..NotchConfig::default()
        });
        runtime.ready(&host).unwrap();
        assert!(!host.visible.get());
        runtime.apply(&host, NotchAction::Expand, true).unwrap();
        let now = Instant::now();
        runtime.activity_at = now;
        assert!(runtime
            .tick(&host, now + Duration::from_millis(999))
            .unwrap()
            .is_none());
        runtime.busy = true;
        assert!(runtime
            .tick(&host, now + Duration::from_secs(20))
            .unwrap()
            .is_none());
        runtime.busy = false;
        runtime.tick(&host, now + Duration::from_secs(1)).unwrap();
        assert_eq!(runtime.snapshot().state, NotchState::Collapsed);
        runtime.apply(&host, NotchAction::Activity, false).unwrap();
        assert_eq!(runtime.snapshot().state, NotchState::Expanded);
        runtime.activity_at = now;
        runtime.tick(&host, now + Duration::from_secs(1)).unwrap();
        runtime
            .motion(
                &host,
                MotionBounds {
                    revision: runtime.snapshot().revision,
                    width: 90.0,
                    height: 48.0,
                    settled: true,
                },
            )
            .unwrap();
        runtime
            .tick(&host, now + Duration::from_millis(1500))
            .unwrap();
        assert_eq!(runtime.snapshot().state, NotchState::Hidden);
        assert!(host.visible.get());
        runtime
            .motion(
                &host,
                MotionBounds {
                    revision: runtime.snapshot().revision,
                    width: 36.0,
                    height: 1.0,
                    settled: true,
                },
            )
            .unwrap();
        assert!(!host.visible.get());
    }
}
