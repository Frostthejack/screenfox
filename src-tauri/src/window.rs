use tauri::{App, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use tauri::webview::WebviewWindowBuilder;

#[cfg(target_os = "windows")]
use windows::{
    Win32::Foundation::HWND,
    Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_TRANSPARENT, WS_EX_LAYERED,
    },
};

/// Global state for click-through tracking
use std::sync::atomic::{AtomicBool, Ordering};
static CLICK_THROUGH_ENABLED: AtomicBool = AtomicBool::new(true);

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
    set_click_through_internal(&window, true)?;

    Ok(())
}

/// Set click-through state for the pet window
/// When enabled=true, mouse events pass through to windows below
/// When enabled=false, the window captures mouse events (for dragging)
pub fn set_click_through(window: &WebviewWindow, enabled: bool) -> Result<(), String> {
    set_click_through_internal(window, enabled)
}

#[cfg(target_os = "windows")]
fn set_click_through_internal(window: &WebviewWindow, enabled: bool) -> Result<(), String> {
    // Get the HWND from the window
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    
    // Get current extended window style
    let ex_style = unsafe { GetWindowLongPtrW(hwnd.0, GWL_EXSTYLE) };
    
    let new_ex_style = if enabled {
        // Add WS_EX_TRANSPARENT to make window click-through
        ex_style | WS_EX_TRANSPARENT.0 as isize
    } else {
        // Remove WS_EX_TRANSPARENT to capture mouse events
        ex_style & !(WS_EX_TRANSPARENT.0 as isize)
    };
    
    unsafe {
        SetWindowLongPtrW(hwnd.0, GWL_EXSTYLE, new_ex_style);
    }
    
    CLICK_THROUGH_ENABLED.store(enabled, Ordering::SeqCst);
    
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn set_click_through_internal(_window: &WebviewWindow, enabled: bool) -> Result<(), String> {
    // On non-Windows platforms, just track the state
    // Actual implementation would use platform-specific APIs
    CLICK_THROUGH_ENABLED.store(enabled, Ordering::SeqCst);
    #[cfg(target_os = "macos")]
    {
        // macOS would use NSWindow setIgnoresMouseEvents
    }
    #[cfg(target_os = "linux")]
    {
        // Linux would use X11 or Wayland APIs
    }
    Ok(())
}

/// Check if click-through is currently enabled
pub fn is_click_through_enabled() -> bool {
    CLICK_THROUGH_ENABLED.load(Ordering::SeqCst)
}