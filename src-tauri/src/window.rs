use tauri::{App, Manager, PhysicalPosition, PhysicalSize};
use tauri::webview::WebviewWindowBuilder;

/// Create the main pet window — a transparent, undecorated, always-on-top overlay
pub fn create_pet_window(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let window = WebviewWindowBuilder::new(app, "pet", tauri::WebviewUrl::App("index.html".into()))
        .title("ScreenFox")
        .inner_size(200.0, 200.0)
        .position(100.0, 100.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true)
        .resizable(false)
        .fullscreen(false)
        .shadow(false)
        .focused(false)
        .minimizable(false)
        .maximizable(false)
        .closable(false)
        .build()?;

    // Make the window click-through by default
    // This is platform-specific and may need adjustment
    #[cfg(target_os = "windows")]
    {
        // On Windows, we'll handle click-through via the frontend
        // using CSS pointer-events and Rust window flags
    }

    Ok(())
}
