use tauri::{App, Manager, Wry};
use tauri::menu::{Menu, MenuItem, CheckMenuItem, Submenu};
use tauri::image::Image;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

static PET_VISIBLE: AtomicBool = AtomicBool::new(true);
static FOLLOW_MOUSE: AtomicBool = AtomicBool::new(false);

pub fn create_tray_icon(app: &App) -> Result<Image<'_>, Box<dyn std::error::Error>> {
    // Create a simple 32x32 orange fox icon from RGBA pixels
    let size: u32 = 64;
    let mut rgba: Vec<u8> = Vec::with_capacity((size * size * 4) as usize);
    
    for y in 0..size {
        for x in 0..size {
            // Simple orange circle as placeholder
            let cx = size as f32 / 2.0;
            let cy = size as f32 / 2.0;
            let r = size as f32 / 2.0 - 2.0;
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let dist = (dx * dx + dy * dy).sqrt();
            
            if dist <= r {
                // Orange fox color
                rgba.extend_from_slice(&[255, 140, 0, 255]);
            } else {
                rgba.extend_from_slice(&[0, 0, 0, 0]);
            }
        }
    }
    
    Ok(Image::new(&rgba, size, size))
}

pub fn build_tray_menu(app: &App) -> Result<Menu<Wry>, Box<dyn std::error::Error>> {
    let visible_toggle = CheckMenuItem::with_id(app, "toggle_visible", "Show Pet", true, PET_VISIBLE.load(Ordering::Relaxed))?;
    let follow_toggle = CheckMenuItem::with_id(app, "toggle_follow", "Follow Mouse", true, FOLLOW_MOUSE.load(Ordering::Relaxed))?;
    let settings = MenuItem::with_id(app, "settings", "Settings...", true, None::<&str>)?;
    let about = MenuItem::with_id(app, "about", "About", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let file_menu = Menu::with_items(app, &[
        &visible_toggle,
        &follow_toggle,
        &settings,
    ])?;

    let menu = Menu::with_items(app, &[
        &file_menu.title("ScreenFox")?,
        &about,
        &quit,
    ])?;

    Ok(menu)
}

pub fn handle_tray_event(app: &App, event_id: &str) {
    match event_id {
        "toggle_visible" => {
            let current = PET_VISIBLE.load(Ordering::Relaxed);
            PET_VISIBLE.store(!current, Ordering::Relaxed);
            if let Some(window) = app.get_webview_window("pet") {
                if current {
                    let _ = window.hide();
                } else {
                    let _ = window.show();
                }
            }
        }
        "toggle_follow" => {
            let current = FOLLOW_MOUSE.load(Ordering::Relaxed);
            FOLLOW_MOUSE.store(!current, Ordering::Relaxed);
        }
        "settings" => {
            // TODO: Open settings window
        }
        "about" => {
            let _ = tauri::process::restart(&app.env());
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
}
