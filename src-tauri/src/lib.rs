mod tray;
mod window;

use tauri::Manager;
use tauri::image::Image;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Create the tray icon
            let tray_icon = tray::create_tray_icon(app)?;

            // Build the tray menu
            let menu = tray::build_tray_menu(app)?;

            // Create the tray
            tauri::tray::TrayIconBuilder::with_id("main")
                .icon(tray_icon)
                .tooltip("ScreenFox")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    tray::handle_tray_event(app, &event.id.0);
                })
                .build(app)?;

            // Create the pet window
            window::create_pet_window(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ScreenFox");
}
