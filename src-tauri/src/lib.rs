mod commands;
pub mod error;
pub mod platform;
mod storage;

use commands::AppState;
use platform::{FileSystemService, WindowService};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

fn restore(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Err(error) = state.platform.show() {
            log::error!("Restore failed: {error}");
        }
    }
}

pub fn run() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| restore(app)))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .max_file_size(2_000_000)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::core_status,
            commands::platform_info,
            commands::screen_scale_factor,
            commands::start_dragging,
            commands::hide_window,
            commands::quit_application,
            commands::set_always_on_top
        ])
        .setup(|app| {
            let platform = platform::NativePlatform::new(app.handle().clone());
            let storage = storage::Storage::open(&platform.app_data_dir()?)?;
            platform.set_always_on_top(storage.settings()?.always_on_top)?;
            app.manage(AppState {
                platform: Box::new(platform),
                storage: Mutex::new(storage),
            });
            let show = MenuItem::with_id(app, "show", "Show Slime", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let icon = app
                .default_window_icon()
                .ok_or("Application icon missing")?
                .clone();
            TrayIconBuilder::new()
                .icon(icon)
                .tooltip("Slime Core")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => restore(app),
                    "quit" => app.state::<AppState>().platform.quit(),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        restore(tray.app_handle());
                    }
                })
                .build(app)?;
            app.state::<AppState>().platform.show()?;
            log::info!("Core ready; SQLite initialized");
            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                if let Err(error) = window.app_handle().state::<AppState>().platform.hide() {
                    log::error!("Hide failed: {error}");
                }
            }
            tauri::WindowEvent::ScaleFactorChanged { scale_factor, .. } => {
                log::info!("Window DPI scale changed: {scale_factor}");
            }
            _ => {}
        })
        .run(tauri::generate_context!());
    if let Err(error) = result {
        log::error!("Application startup failed: {error}");
        eprintln!("Application startup failed: {error}");
        std::process::exit(1);
    }
}
