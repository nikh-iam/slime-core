mod ai;
mod commands;
pub mod error;
pub mod notch;
pub mod platform;
mod storage;

use commands::{dispatch_logged, AppState};
use notch::{NotchAction, NotchConfig, NotchRuntime};
use platform::FileSystemService;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

fn restore(app: &tauri::AppHandle) {
    if app.try_state::<AppState>().is_some() {
        dispatch_logged(app, NotchAction::Show, true);
    }
}
pub fn run() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| restore(app)))
        .plugin(tauri_plugin_log::Builder::new().level(log::LevelFilter::Info).max_file_size(2_000_000).build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, _, event| {
            if event.state == ShortcutState::Pressed {
                let handle = app.clone();
                if let Err(error) = app.run_on_main_thread(move || dispatch_logged(&handle, NotchAction::ToggleAssistant, true)) {
                    log::error!("Shortcut dispatch failed: {error}");
                }
            }
        }).build())
        .invoke_handler(tauri::generate_handler![commands::core_status, commands::platform_info,
            commands::screen_scale_factor, commands::hide_window, commands::quit_application,
            commands::notch_snapshot, commands::notch_action, commands::notch_ready, commands::notch_motion,
            commands::ai_initialize, commands::ai_generate, commands::ai_cancel, commands::ai_shutdown])
        .setup(|app| {
            app.manage(ai::LocalModel::default());
            let config = NotchConfig::from_environment()?;
            let platform = platform::NativePlatform::new(app.handle().clone());
            let storage = storage::Storage::open(&platform.app_data_dir()?)?;
            app.manage(AppState { platform: Box::new(platform), storage: Mutex::new(storage), notch: Mutex::new(NotchRuntime::new(config.clone())) });
            match config.shortcut.parse::<Shortcut>() {
                Ok(shortcut) => if let Err(error) = app.global_shortcut().register(shortcut) {
                    log::error!("Cannot register TOGGLE_ASSISTANT ({}): {error}. Tray remains available.", config.shortcut);
                },
                Err(error) => log::error!("Invalid TOGGLE_ASSISTANT shortcut: {error}. Tray remains available."),
            }
            let show = MenuItem::with_id(app, "show", "Show Slime", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Hide Slime", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &quit])?;
            let icon = app.default_window_icon().ok_or("Application icon missing")?.clone();
            TrayIconBuilder::new().icon(icon).tooltip("Slime Core").menu(&menu).show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => restore(app),
                    "hide" => dispatch_logged(app, NotchAction::Hide, false),
                    "quit" => app.state::<AppState>().platform.quit(),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(event, TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. }) { restore(tray.app_handle()); }
                }).build(app)?;
            log::info!("Notch host ready; SQLite initialized; TOGGLE_ASSISTANT={}", config.shortcut);
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                    let app = handle.clone();
                    if handle.run_on_main_thread(move || {
                        let state = app.state::<AppState>();
                        if let Ok(mut notch) = state.notch.lock() {
                            match notch.tick(state.platform.as_ref(), std::time::Instant::now()) {
                                Ok(Some(snapshot)) => { let _ = app.emit_to("notch", "notch-state", snapshot); },
                                Err(error) => log::error!("Idle lifecycle: {error}"), _ => {}
                            }
                        };
                    }).is_err() { break; }
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                dispatch_logged(window.app_handle(), NotchAction::Hide, false);
            }
            tauri::WindowEvent::ScaleFactorChanged { scale_factor, .. } => {
                log::info!("Notch DPI scale changed: {scale_factor}");
                let app = window.app_handle().clone();
                let handle = app.clone();
                if let Err(error) = app.run_on_main_thread(move || {
                    if let Some(state) = handle.try_state::<AppState>() {
                        match state.notch.try_lock() {
                            Ok(mut notch) => if let Err(error) = notch.reposition(state.platform.as_ref()) { log::error!("Notch placement failed: {error}"); },
                            Err(_) => log::debug!("DPI change handled by active notch layout transaction"),
                        }
                    }
                }) { log::error!("DPI dispatch failed: {error}"); }
            }
            _ => {}
        })
        .build(tauri::generate_context!());
    match result {
        Ok(app) => app.run(|handle, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                handle.state::<ai::LocalModel>().shutdown();
            }
        }),
        Err(error) => {
            log::error!("Application startup failed: {error}");
            eprintln!("Application startup failed: {error}");
            std::process::exit(1);
        }
    }
}
