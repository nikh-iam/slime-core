use crate::error::Result;
use serde::Serialize;
use std::path::PathBuf;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::WindowsPlatform as NativePlatform;

#[cfg(not(target_os = "windows"))]
compile_error!(
    "Only Windows is supported in Phase 0. Add a platform adapter before enabling another target."
);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    pub name: &'static str,
    pub scale_factor: f64,
}

pub trait WindowService {
    fn show(&self) -> Result<()>;
    fn hide(&self) -> Result<()>;
    fn start_dragging(&self) -> Result<()>;
    fn set_always_on_top(&self, enabled: bool) -> Result<()>;
}
// Phase 0 only needs the app-owned data directory, never arbitrary file automation.
pub trait FileSystemService {
    fn app_data_dir(&self) -> Result<PathBuf>;
}
pub trait ClipboardService {
    fn read_text(&self) -> Result<String>;
    fn write_text(&self, text: &str) -> Result<()>;
}
pub trait ScreenService {
    fn scale_factor(&self) -> Result<f64>;
}
pub trait ApplicationService {
    fn quit(&self);
}
pub trait NotificationService {
    fn notify(&self, title: &str, body: &str) -> Result<()>;
}
pub trait SecureStorageService {
    fn get_secret(&self, key: &str) -> Result<Option<String>>;
    fn set_secret(&self, key: &str, value: &str) -> Result<()>;
}
pub trait PlatformService:
    WindowService
    + FileSystemService
    + ClipboardService
    + ScreenService
    + ApplicationService
    + NotificationService
    + SecureStorageService
    + Send
    + Sync
{
    fn info(&self) -> Result<PlatformInfo>;
}
