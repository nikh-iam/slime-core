use crate::{
    error::{AppError, CommandError},
    platform::{PlatformInfo, PlatformService},
    storage::{Settings, Storage},
};
use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub platform: Box<dyn PlatformService>,
    pub storage: Mutex<Storage>,
}
#[derive(Serialize)]
pub struct CoreStatus {
    platform: PlatformInfo,
    settings: Settings,
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
pub fn start_dragging(state: State<'_, AppState>) -> Result<(), CommandError> {
    Ok(state.platform.start_dragging()?)
}
#[tauri::command]
pub fn hide_window(state: State<'_, AppState>) -> Result<(), CommandError> {
    Ok(state.platform.hide()?)
}
#[tauri::command]
pub fn quit_application(state: State<'_, AppState>) {
    state.platform.quit();
}
#[tauri::command]
pub fn set_always_on_top(
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<Settings, CommandError> {
    let storage = state.storage.lock().map_err(|_| AppError::State)?;
    let previous = storage.settings()?;
    state.platform.set_always_on_top(enabled)?;
    match storage.set_always_on_top(enabled) {
        Ok(settings) => Ok(settings),
        Err(error) => {
            if let Err(rollback) = state.platform.set_always_on_top(previous.always_on_top) {
                log::error!("Could not restore window setting: {rollback}");
            }
            Err(error.into())
        }
    }
}
