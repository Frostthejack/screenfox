use tauri::{AppHandle, Manager};
use tauri::menu::{Menu, MenuItem, CheckMenuItem};
use tauri::image::Image;
use std::sync::atomic::{AtomicBool, Ordering};

pub static PET_VISIBLE: AtomicBool = AtomicBool::new(true);
pub static FOLLOW_MOUSE: AtomicBool = AtomicBool::new(false);

pub fn create_tray_icon(_app: &AppHandle) -> Result<Image<'static>, Box<dyn std::error::Error>> {
    // Create a simple 64x64 orange fox icon from RGBA pixels
    let size: u32 = 64;
    let mut pixels: Vec<u8> = Vec::new();

    for y in 0..size {
        for x in 0..size {
            let cx = size as f32 / 2.0;
            let cy = size as f32 / 2.0;
            let r = size as f32 / 2.0 - 2.0;
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let dist = (dx * dx + dy * dy).sqrt();

            if dist <= r {
                pixels.push(255);
                pixels.push(140);
                pixels.push(0);
                pixels.push(255);
            } else {
                pixels.push(0);
                pixels.push(0);
                pixels.push(0);
                pixels.push(0);
            }
        }
    }

    Ok(Image::new_owned(pixels, size, size))
}

pub fn build_tray_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let visible_toggle = CheckMenuItem::with_id(
        app,
        "toggle_visible",
        "Show Pet",
        true,
        PET_VISIBLE.load(Ordering::Relaxed),
        None::<&str>,
    )?;
    let follow_toggle = CheckMenuItem::with_id(
        app,
        "toggle_follow",
        "Follow Mouse",
        true,
        FOLLOW_MOUSE.load(Ordering::Relaxed),
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(app, "settings", "Settings...", true, None::<&str>)?;
    let about = MenuItem::with_id(app, "about", "About", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&visible_toggle, &follow_toggle, &settings, &about, &quit])?;

    Ok(menu)
}

pub fn handle_tray_event(app: &AppHandle, event_id: &str) {
    match event_id {
        "toggle_visible" => {
            let current = PET_VISIBLE.load(Ordering::Relaxed);
            let new = !current;
            PET_VISIBLE.store(new, Ordering::Relaxed);
            if let Some(window) = app.get_webview_window("pet") {
                if current {
                    let _ = window.hide();
                } else {
                    let _ = window.show();
                }
            }
            let _ = app.emit("tray:toggle-visible", new);
        }
        "toggle_follow" => {
            let current = FOLLOW_MOUSE.load(Ordering::Relaxed);
            let new = !current;
            FOLLOW_MOUSE.store(new, Ordering::Relaxed);
            let _ = app.emit("tray:toggle-follow", new);
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
