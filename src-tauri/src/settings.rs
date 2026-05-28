use tauri::{AppHandle, Emitter, Manager};
use tauri::webview::WebviewWindowBuilder;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::path::PathBuf;

/// Application settings, persisted to a JSON file in the app data directory.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub pet_size: String,
    pub move_speed: String,
    pub follow_dist: String,
    pub sound_effects: bool,
    pub volume: f64,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            pet_size: "medium".to_string(),
            move_speed: "medium".to_string(),
            follow_dist: "medium".to_string(),
            sound_effects: false,
            volume: 0.7,
        }
    }
}

/// Shared settings state managed by Tauri
pub struct SettingsState {
    pub inner: Mutex<Settings>,
    pub path: PathBuf,
}

impl SettingsState {
    /// Load settings from disk (or use defaults) and wrap in Arc
    pub fn load(path: PathBuf) -> Arc<Self> {
        let settings = if path.exists() {
            std::fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            Settings::default()
        };
        Arc::new(Self {
            inner: Mutex::new(settings),
            path,
        })
    }
}

/// Tauri command: return the current settings
#[tauri::command]
pub fn get_settings(state: tauri::State<'_, Arc<SettingsState>>) -> Result<Settings, String> {
    let guard = state.inner.lock().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

/// Tauri command: update settings, persist to disk, and notify all windows
#[tauri::command]
pub fn update_settings(
    settings: Settings,
    state: tauri::State<'_, Arc<SettingsState>>,
    app: AppHandle,
) -> Result<(), String> {
    // Update in-memory state
    {
        let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
        *guard = settings.clone();
    }
    // Persist to disk
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&state.path, json).map_err(|e| e.to_string())?;
    // Broadcast to all windows — pet window listens for 'settings:changed'
    app.emit("settings:changed", &settings).map_err(|e| e.to_string())?;
    Ok(())
}

/// Create (or focus) the settings panel window
pub fn create_settings_window(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // Check if settings window already exists — if so, just focus it
    if let Some(window) = app.get_webview_window("settings") {
        window.show()?;
        window.set_focus()?;
        return Ok(());
    }

    let _window = WebviewWindowBuilder::new(
        app,
        "settings",
        tauri::WebviewUrl::App("settings.html".into()),
    )
    .title("ScreenFox Settings")
    .inner_size(480.0, 420.0)
    .resizable(false)
    .center()
    .build()?;

    Ok(())
}
