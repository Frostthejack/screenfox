mod tray;
mod window;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Arc::new(Mutex::new(WatchdogState::new())))
        .invoke_handler(tauri::generate_handler![set_click_through, enable_click_through, disable_click_through, get_mouse_pos])
        .setup(|app| {
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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ScreenFox");
}
