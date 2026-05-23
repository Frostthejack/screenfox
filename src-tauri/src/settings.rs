use tauri::{AppHandle, Manager};
use tauri::webview::WebviewWindowBuilder;

/// Create the settings panel window
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
