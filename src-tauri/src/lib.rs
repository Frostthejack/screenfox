mod settings;
mod tray;
mod window;

use settings::{get_settings, update_settings};
use tauri::Manager;
use tokio::time::{sleep, Duration};
use std::sync::{Arc, Mutex};

/// Watchdog state: holds the inner state of the auto-re-enable timer
struct WatchdogState {
    /// Incremented each time a new watchdog is spawned — old ones abort
    generation: u64,
}

impl WatchdogState {
    fn new() -> Self {
        Self { generation: 0 }
    }
}

/// Tauri command: enable or disable click-through for the pet window
/// When click-through is disabled, the window captures mouse events.
/// A 250ms watchdog auto-re-enables click-through as a safety net.
#[tauri::command]
async fn set_click_through(
    window: tauri::WebviewWindow,
    enabled: bool,
    state: tauri::State<'_, Arc<Mutex<WatchdogState>>>,
) -> Result<(), String> {
    window::set_click_through(&window, enabled)?;

    if !enabled {
        // Start a 250ms watchdog to auto-re-enable click-through
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        guard.generation += 1;
        let gen = guard.generation;
        drop(guard);

        let state_clone = Arc::clone(&state);
        let window_clone = window.clone();

        tokio::spawn(async move {
            sleep(Duration::from_millis(250)).await;

            // Only auto-re-enable if this is still the latest generation
            // and click-through is still disabled
            let state = state_clone.lock().unwrap();
            if state.generation == gen && !window::is_click_through_enabled() {
                drop(state);
                let _ = window::set_click_through(&window_clone, true);
            }
        });
    }

    Ok(())
}

/// Tauri command: enable click-through (exposed for frontend drag-and-drop)
#[tauri::command]
async fn enable_click_through(window: tauri::WebviewWindow) -> Result<(), String> {
    window::set_click_through(&window, true)
}

/// Tauri command: disable click-through (exposed for frontend drag-and-drop)
#[tauri::command]
async fn disable_click_through(window: tauri::WebviewWindow) -> Result<(), String> {
    window::set_click_through(&window, false)
}

/// Tauri command: get the current mouse position
#[tauri::command]
async fn get_mouse_pos() -> Result<(i32, i32), String> {
    window::get_mouse_pos()
}

/// Tauri command: get whether the pet is currently visible
#[tauri::command]
async fn is_pet_visible() -> Result<bool, String> {
    use std::sync::atomic::Ordering;
    Ok(tray::PET_VISIBLE.load(Ordering::Relaxed))
}

/// Tauri command: get whether follow-mouse mode is enabled
#[tauri::command]
async fn is_follow_mode() -> Result<bool, String> {
    use std::sync::atomic::Ordering;
    Ok(tray::FOLLOW_MOUSE.load(Ordering::Relaxed))
}

/// Monitor info for multi-monitor support
#[derive(Debug, serde::Serialize, Clone)]
pub struct MonitorInfo {
    pub name: String,
    pub position_x: i32,
    pub position_y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

/// Tauri command: list all available monitors with DPI scale factors
#[tauri::command]
async fn list_monitors(app: tauri::AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    Ok(monitors.into_iter().map(|m| MonitorInfo {
        name: m.name().cloned().unwrap_or_else(|| "Unknown".to_string()),
        position_x: m.position().x,
        position_y: m.position().y,
        width: m.size().width,
        height: m.size().height,
        scale_factor: m.scale_factor(),
    }).collect())
}

/// Tauri command: get the monitor that contains the given position
#[tauri::command]
async fn get_monitor_at(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
) -> Result<Option<MonitorInfo>, String> {
    if let Some(m) = app.monitor_from_point(x, y).map_err(|e| e.to_string())? {
        Ok(Some(MonitorInfo {
            name: m.name().cloned().unwrap_or_else(|| "Unknown".to_string()),
            position_x: m.position().x,
            position_y: m.position().y,
            width: m.size().width,
            height: m.size().height,
            scale_factor: m.scale_factor(),
        }))
    } else {
        Ok(None)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Arc::new(Mutex::new(WatchdogState::new())))
        .invoke_handler(tauri::generate_handler![
            set_click_through,
            enable_click_through,
            disable_click_through,
            get_mouse_pos,
            is_pet_visible,
            is_follow_mode,
            list_monitors,
            get_monitor_at,
            get_settings,
            update_settings,
        ])
        .setup(|app| {
            // Initialize settings state — load from (or create) app data dir
            let app_data_dir = app.path().app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            std::fs::create_dir_all(&app_data_dir).ok();
            let settings_state = settings::SettingsState::load(
                app_data_dir.join("settings.json"),
            );
            app.manage(settings_state);

            // Create the tray icon
            let tray_icon = tray::create_tray_icon(app.handle())?;

            // Build the tray menu
            let menu = tray::build_tray_menu(app.handle())?;

            // Create the tray
            tauri::tray::TrayIconBuilder::with_id("main")
                .icon(tray_icon)
                .tooltip("ScreenFox")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    tray::handle_tray_event(app.app_handle(), &event.id.0);
                })
                .build(app)?;

            // Create the pet window
            window::create_pet_window(app)?;

            // Create the settings window (hidden by default)
            settings::create_settings_window(app.handle())?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ScreenFox");
}
