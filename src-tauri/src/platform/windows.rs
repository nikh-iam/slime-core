use super::*;
use crate::error::AppError;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, WebviewWindow};

pub struct WindowsPlatform {
    app: AppHandle,
}
impl WindowsPlatform {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
    fn window(&self) -> Result<WebviewWindow> {
        self.app.get_webview_window("notch").ok_or(AppError::State)
    }
}
impl WindowService for WindowsPlatform {
    fn set_bounds(&self, bounds: PhysicalBounds) -> Result<()> {
        use ::windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
        };
        let window = self.window()?;
        let hwnd = window.hwnd()?;
        // One native transaction preserves the anchor during resize. No hide/show or opaque resize frame.
        unsafe {
            SetWindowPos(
                hwnd,
                None,
                bounds.x,
                bounds.y,
                bounds.width as i32,
                bounds.height as i32,
                SWP_NOACTIVATE | SWP_NOZORDER,
            )
        }
        .map_err(|error| AppError::Configuration(error.to_string()))?;
        Ok(())
    }
    fn show_overlay(&self, focus: bool) -> Result<()> {
        let window = self.window()?;
        if !window.is_visible()? {
            window.show()?;
        }
        if focus {
            window.set_focus()?;
        }
        Ok(())
    }
    fn show(&self) -> Result<()> {
        let window = self.window()?;
        window.unminimize()?;
        window.show()?;
        window.set_focus()?;
        Ok(())
    }
    fn hide(&self) -> Result<()> {
        self.window()?.hide()?;
        Ok(())
    }
    fn start_dragging(&self) -> Result<()> {
        self.window()?.start_dragging()?;
        Ok(())
    }
    fn set_always_on_top(&self, enabled: bool) -> Result<()> {
        self.window()?.set_always_on_top(enabled)?;
        Ok(())
    }
}
impl FileSystemService for WindowsPlatform {
    fn app_data_dir(&self) -> Result<PathBuf> {
        Ok(self.app.path().app_data_dir()?)
    }
}
impl ScreenService for WindowsPlatform {
    fn monitor_area(&self, name: Option<&str>) -> Result<MonitorArea> {
        let window = self.window()?;
        let selected = if let Some(name) = name {
            window
                .available_monitors()?
                .into_iter()
                .find(|monitor| monitor.name().is_some_and(|candidate| candidate == name))
        } else {
            None
        };
        // Missing/disconnected named monitors fall back to the current primary work area.
        let monitor = selected
            .or(window.primary_monitor()?)
            .ok_or(AppError::State)?;
        let area = monitor.work_area();
        Ok(MonitorArea {
            x: area.position.x,
            y: area.position.y,
            width: area.size.width,
            height: area.size.height,
            scale_factor: monitor.scale_factor(),
        })
    }
    fn scale_factor(&self) -> Result<f64> {
        Ok(self.window()?.scale_factor()?)
    }
}
impl ApplicationService for WindowsPlatform {
    fn quit(&self) {
        self.app.exit(0);
    }
}
impl PlatformService for WindowsPlatform {
    fn info(&self) -> Result<PlatformInfo> {
        Ok(PlatformInfo {
            name: "Windows",
            scale_factor: self.scale_factor()?,
        })
    }
}
impl ClipboardService for WindowsPlatform {
    fn read_text(&self) -> Result<String> {
        Err(AppError::Unavailable("Clipboard"))
    }
    fn write_text(&self, _text: &str) -> Result<()> {
        Err(AppError::Unavailable("Clipboard"))
    }
}
impl NotificationService for WindowsPlatform {
    fn notify(&self, _title: &str, _body: &str) -> Result<()> {
        Err(AppError::Unavailable("Notifications"))
    }
}
impl SecureStorageService for WindowsPlatform {
    fn get_secret(&self, _key: &str) -> Result<Option<String>> {
        Err(AppError::Unavailable("Secure storage"))
    }
    fn set_secret(&self, _key: &str, _value: &str) -> Result<()> {
        Err(AppError::Unavailable("Secure storage"))
    }
}
