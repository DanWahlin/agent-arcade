use tauri::{
    AppHandle, Manager,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

static VISIBLE: AtomicBool = AtomicBool::new(false);
static PAUSED: AtomicBool = AtomicBool::new(false);
static UPDATE_CHECK_DONE: AtomicBool = AtomicBool::new(false);

/// The current toggle shortcut string (e.g. "Ctrl+Alt+M").
/// Updated by the `set_toggle_shortcut` command from JS.
static TOGGLE_SHORTCUT: Mutex<String> = Mutex::new(String::new());

/// The current pause/unpause shortcut string (default "Escape").
/// Updated by the `set_pause_shortcut` command from JS.
static PAUSE_SHORTCUT: Mutex<String> = Mutex::new(String::new());

/// The current unpause shortcut string (default "Ctrl+Escape").
/// Updated by the `set_unpause_shortcut` command from JS.
static UNPAUSE_SHORTCUT: Mutex<String> = Mutex::new(String::new());

// ── Tauri commands (called from JS via invoke()) ──────────────────────

/// Enable/disable click-through so clicks pass to apps below the overlay.
#[tauri::command]
fn set_click_through(app: AppHandle, enabled: bool) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_ignore_cursor_events(enabled);
    }
}

/// Get cursor position relative to the window. Returns (x, y) or null.
#[tauri::command]
fn get_cursor_in_window(app: AppHandle) -> Option<(f64, f64)> {
    if let Some(win) = app.get_webview_window("main") {
        if let (Ok(pos), Ok(win_pos)) = (win.cursor_position(), win.outer_position()) {
            let scale = win.scale_factor().unwrap_or(1.0);
            let x = (pos.x - win_pos.x as f64) / scale;
            let y = (pos.y - win_pos.y as f64) / scale;
            return Some((x, y));
        }
    }
    None
}

/// Track the paused state from the renderer.
/// When paused, shrink window to just the HUD bar so apps behind are usable.
/// When resumed, expand back to full screen with click-through enabled.
#[tauri::command]
fn set_paused(app: AppHandle, paused: bool) {
    PAUSED.store(paused, Ordering::SeqCst);
    if let Some(win) = app.get_webview_window("main") {
        if paused {
            // Trigger paused state via named JS function
            let _ = win.eval("window.__agentArcadeOnPause && window.__agentArcadeOnPause()");
            // Unregister Escape so it passes through to other apps while paused
            unregister_pause_shortcut(&app);
            // Shrink to HUD bar size so apps behind are fully usable
            let _ = win.set_ignore_cursor_events(false);
            if let Ok(Some(monitor)) = win.primary_monitor() {
                let scale = monitor.scale_factor();
                let hud_width = (1200.0 * scale) as u32;
                let hud_height = (152.0 * scale) as u32;
                let screen_w = monitor.size().width;
                let x = ((screen_w - hud_width) / 2) as i32;
                let y = monitor.position().y;
                let _ = win.set_size(tauri::PhysicalSize::new(hud_width, hud_height));
                let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
            }
        } else {
            // Re-register Escape shortcut for pausing
            register_pause_shortcut(&app);
            // Expand back to full screen and reset position FIRST
            if let Ok(Some(monitor)) = win.primary_monitor() {
                let size = monitor.size();
                let pos = monitor.position();
                let scale = monitor.scale_factor();
                let bottom_trim = (5.0 * scale) as u32;
                let _ = win.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
                let _ = win.set_size(tauri::PhysicalSize::new(size.width, size.height - bottom_trim));
            }
            // Remove paused class and restore overlays via named JS function
            let _ = win.eval("window.__agentArcadeOnResume && window.__agentArcadeOnResume()");
            let _ = win.set_ignore_cursor_events(true);
        }
    }
}

/// Quit the application.
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Hide the application window (minimize to tray).
#[tauri::command]
fn hide_app(app: AppHandle) {
    hide_window(&app);
}

/// Return the app version from Cargo.toml (set at compile time).
#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Download and install an available update, then restart the app.
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<String, String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater_builder().build().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => {
            // Notify JS that download is starting
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.eval("if(window.__agentArcadeUpdateStatus)window.__agentArcadeUpdateStatus('downloading')");
            }
            update.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
            // Notify JS that install is complete, then restart
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.eval("if(window.__agentArcadeUpdateStatus)window.__agentArcadeUpdateStatus('restarting')");
            }
            app.restart();
        }
        Ok(None) => Err("No update available".to_string()),
        Err(e) => Err(format!("Update check failed: {}", e)),
    }
}

/// Shared helper: swap a global shortcut registration, updating the stored Mutex.
fn swap_shortcut(
    app: &AppHandle,
    storage: &Mutex<String>,
    combo: &str,
) -> Result<String, String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    let new_sc = parse_shortcut(combo).ok_or_else(|| format!("Invalid shortcut: {}", combo))?;

    // Unregister old shortcut (ignore errors — it may already be gone)
    {
        let old = storage.lock().unwrap();
        if !old.is_empty() {
            if let Some(old_sc) = parse_shortcut(&old) {
                let _ = app.global_shortcut().unregister(old_sc);
            }
        }
    }

    // Try to register the new one
    app.global_shortcut()
        .register(new_sc)
        .map_err(|e| format!("Could not register {}: {}", combo, e))?;

    // Store the new combo string
    {
        let mut stored = storage.lock().unwrap();
        *stored = combo.to_string();
    }

    Ok(combo.to_string())
}

/// Change the toggle shortcut at runtime.
/// `combo` is a string like "Ctrl+Alt+M" or "Ctrl+Shift+G".
/// Returns Ok(combo) on success or an error string if the shortcut can't be registered.
#[tauri::command]
fn set_toggle_shortcut(app: AppHandle, combo: String) -> Result<String, String> {
    let result = swap_shortcut(&app, &TOGGLE_SHORTCUT, &combo)?;
    update_tray_label(&app, &combo);
    Ok(result)
}

/// Get the current toggle shortcut string.
#[tauri::command]
fn get_toggle_shortcut() -> String {
    TOGGLE_SHORTCUT.lock().unwrap().clone()
}

/// Change the pause/unpause shortcut at runtime.
/// `combo` can be a single key like "Escape" or a combo like "Ctrl+P".
/// Returns Ok(combo) on success or an error string if the shortcut can't be registered.
#[tauri::command]
fn set_pause_shortcut(app: AppHandle, combo: String) -> Result<String, String> {
    swap_shortcut(&app, &PAUSE_SHORTCUT, &combo)
}

/// Get the current pause shortcut string.
#[tauri::command]
fn get_pause_shortcut() -> String {
    PAUSE_SHORTCUT.lock().unwrap().clone()
}

/// Change the unpause shortcut at runtime.
/// `combo` can be a combo like "Ctrl+Escape" or "Ctrl+P".
/// Returns Ok(combo) on success or an error string if the shortcut can't be registered.
#[tauri::command]
fn set_unpause_shortcut(app: AppHandle, combo: String) -> Result<String, String> {
    swap_shortcut(&app, &UNPAUSE_SHORTCUT, &combo)
}

/// Get the current unpause shortcut string.
#[tauri::command]
fn get_unpause_shortcut() -> String {
    UNPAUSE_SHORTCUT.lock().unwrap().clone()
}

/// Parse a shortcut string like "Ctrl+Alt+M" into a Shortcut struct.
fn parse_shortcut(s: &str) -> Option<tauri_plugin_global_shortcut::Shortcut> {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

    let parts: Vec<&str> = s.split('+').map(|p| p.trim()).collect();
    if parts.is_empty() {
        return None;
    }

    let mut mods = Modifiers::empty();
    let key_str = parts.last()?;

    for &part in &parts[..parts.len() - 1] {
        match part.to_lowercase().as_str() {
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "alt" | "option" => mods |= Modifiers::ALT,
            "shift" => mods |= Modifiers::SHIFT,
            "super" | "meta" | "cmd" | "command" => mods |= Modifiers::SUPER,
            _ => return None,
        }
    }

    let code = match key_str.to_uppercase().as_str() {
        "A" => Code::KeyA, "B" => Code::KeyB, "C" => Code::KeyC, "D" => Code::KeyD,
        "E" => Code::KeyE, "F" => Code::KeyF, "G" => Code::KeyG, "H" => Code::KeyH,
        "I" => Code::KeyI, "J" => Code::KeyJ, "K" => Code::KeyK, "L" => Code::KeyL,
        "M" => Code::KeyM, "N" => Code::KeyN, "O" => Code::KeyO, "P" => Code::KeyP,
        "Q" => Code::KeyQ, "R" => Code::KeyR, "S" => Code::KeyS, "T" => Code::KeyT,
        "U" => Code::KeyU, "V" => Code::KeyV, "W" => Code::KeyW, "X" => Code::KeyX,
        "Y" => Code::KeyY, "Z" => Code::KeyZ,
        "0" => Code::Digit0, "1" => Code::Digit1, "2" => Code::Digit2, "3" => Code::Digit3,
        "4" => Code::Digit4, "5" => Code::Digit5, "6" => Code::Digit6, "7" => Code::Digit7,
        "8" => Code::Digit8, "9" => Code::Digit9,
        "F1" => Code::F1, "F2" => Code::F2, "F3" => Code::F3, "F4" => Code::F4,
        "F5" => Code::F5, "F6" => Code::F6, "F7" => Code::F7, "F8" => Code::F8,
        "F9" => Code::F9, "F10" => Code::F10, "F11" => Code::F11, "F12" => Code::F12,
        "ESCAPE" | "ESC" => Code::Escape,
        "SPACE" => Code::Space,
        "TAB" => Code::Tab,
        "ENTER" | "RETURN" => Code::Enter,
        "BACKSPACE" => Code::Backspace,
        _ => return None,
    };

    let mods_opt = if mods.is_empty() { None } else { Some(mods) };
    Some(Shortcut::new(mods_opt, code))
}

/// Update the tray menu toggle label with the new shortcut.
/// Note: Tauri v2 TrayIcon doesn't expose menu items for text updates,
/// so the tray label will show the initial shortcut only. The settings
/// dialog is the source of truth for the current hotkey.
fn update_tray_label(_app: &AppHandle, _combo: &str) {
    // Tray menu text update not supported in Tauri v2 without rebuilding the menu.
    // The settings dialog shows the current hotkey to the user.
}

// ── Window helpers ────────────────────────────────────────────────────

fn show_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_ignore_cursor_events(false);
        let _ = win.show();
        let _ = win.set_focus();
        VISIBLE.store(true, Ordering::SeqCst);
        // Re-register Escape so it can pause the running game
        register_pause_shortcut(app);
    }
}

fn hide_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
        VISIBLE.store(false, Ordering::SeqCst);
        // Unregister Escape so it passes through to other apps while hidden
        unregister_pause_shortcut(app);
    }
}

fn toggle_window(app: &AppHandle) {
    if VISIBLE.load(Ordering::SeqCst) && PAUSED.load(Ordering::SeqCst) {
        // If paused, resume instead of hiding
        resume_game(app);
        return;
    }

    if VISIBLE.load(Ordering::SeqCst) {
        hide_window(app);
    } else {
        show_window(app);
    }
}

fn resume_game(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        // Re-register Escape shortcut for pausing
        register_pause_shortcut(app);
        let _ = win.set_ignore_cursor_events(false);
        let _ = win.show();
        let _ = win.set_focus();
        // Expand window first
        if let Ok(Some(monitor)) = win.primary_monitor() {
            let size = monitor.size();
            let pos = monitor.position();
            let scale = monitor.scale_factor();
            let bottom_trim = (5.0 * scale) as u32;
            let _ = win.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
            let _ = win.set_size(tauri::PhysicalSize::new(size.width, size.height - bottom_trim));
        }
        // Resume game — overlay restoration is handled inside __agentArcadeResumeFromRust
        let _ = win.eval("window.__agentArcadeResumeFromRust && window.__agentArcadeResumeFromRust()");
        PAUSED.store(false, Ordering::SeqCst);
    }
}

fn pause_game(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        // Tell the webview to pause the game scene and hide overlays
        let _ = win.eval("window.__agentArcadeOnPause && window.__agentArcadeOnPause()");
        // Unregister Escape so it passes through to other apps while paused
        unregister_pause_shortcut(app);
        // Shrink to HUD bar so apps behind are fully usable
        let _ = win.set_ignore_cursor_events(false);
        if let Ok(Some(monitor)) = win.primary_monitor() {
            let scale = monitor.scale_factor();
            let hud_width = (1200.0 * scale) as u32;
            let hud_height = (152.0 * scale) as u32;
            let screen_w = monitor.size().width;
            let x = ((screen_w - hud_width) / 2) as i32;
            let y = monitor.position().y;
            let _ = win.set_size(tauri::PhysicalSize::new(hud_width, hud_height));
            let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
        }
        PAUSED.store(true, Ordering::SeqCst);
    }
}

// ── App entry point ───────────────────────────────────────────────────

/// Unregister the pause (Escape) shortcut so it passes through to other apps.
/// Uses a spawned thread to avoid deadlocking when called from within the
/// global shortcut handler callback.
fn unregister_pause_shortcut(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;
        let combo = PAUSE_SHORTCUT.lock().unwrap().clone();
        if !combo.is_empty() {
            if let Some(sc) = parse_shortcut(&combo) {
                let _ = app.global_shortcut().unregister(sc);
            }
        }
    });
}

/// Re-register the pause (Escape) shortcut after resuming.
/// Uses a spawned thread to avoid deadlocking when called from within the
/// global shortcut handler callback.
fn register_pause_shortcut(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;
        let combo = PAUSE_SHORTCUT.lock().unwrap().clone();
        if !combo.is_empty() {
            if let Some(sc) = parse_shortcut(&combo) {
                let _ = app.global_shortcut().register(sc);
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_window(app);
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    use tauri_plugin_global_shortcut::ShortcutState;

                    if event.state() != ShortcutState::Pressed {
                        return;
                    }

                    // Check if this is the current toggle shortcut
                    let is_toggle = {
                        let stored = TOGGLE_SHORTCUT.lock().unwrap();
                        if !stored.is_empty() {
                            if let Some(sc) = parse_shortcut(&stored) {
                                *shortcut == sc
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    };

                    // Check if this is the current pause shortcut
                    let is_pause = {
                        let stored = PAUSE_SHORTCUT.lock().unwrap();
                        if !stored.is_empty() {
                            if let Some(sc) = parse_shortcut(&stored) {
                                *shortcut == sc
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    };

                    // Check if this is the current unpause shortcut
                    let is_unpause = {
                        let stored = UNPAUSE_SHORTCUT.lock().unwrap();
                        if !stored.is_empty() {
                            if let Some(sc) = parse_shortcut(&stored) {
                                *shortcut == sc
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    };

                    if is_toggle {
                        toggle_window(app);
                    } else if is_unpause {
                        if PAUSED.load(Ordering::SeqCst) {
                            resume_game(app);
                        }
                    } else if is_pause {
                        if !PAUSED.load(Ordering::SeqCst) && VISIBLE.load(Ordering::SeqCst) {
                            pause_game(app);
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![set_click_through, set_paused, quit_app, hide_app, get_cursor_in_window, set_toggle_shortcut, get_toggle_shortcut, set_pause_shortcut, get_pause_shortcut, set_unpause_shortcut, get_unpause_shortcut, get_app_version, install_update])
        .setup(|app| {
            // Register default toggle shortcut and Escape.
            // If the toggle shortcut is already taken by another app,
            // log a warning but don't crash — the user can change it in settings.
            {
                use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
                let default_combo = "Ctrl+Alt+M";
                let toggle =
                    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyM);
                let esc = Shortcut::new(None, Code::Escape);

                // Load saved shortcut from JS (will be sent via set_toggle_shortcut on init).
                // For now, try the default.
                match app.global_shortcut().register(toggle) {
                    Ok(_) => {
                        let mut stored = TOGGLE_SHORTCUT.lock().unwrap();
                        *stored = default_combo.to_string();
                    }
                    Err(e) => {
                        log::warn!("Could not register default shortcut {}: {}. User can change it in Settings.", default_combo, e);
                        // Notify JS that the default shortcut failed
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.eval(&format!(
                                "window.__shortcutRegistrationFailed = '{}';",
                                default_combo
                            ));
                        }
                    }
                }
                // Escape is essential — try to register but don't crash if it fails
                if let Err(e) = app.global_shortcut().register(esc) {
                    log::warn!("Could not register Escape shortcut: {}", e);
                }
                {
                    let mut stored = PAUSE_SHORTCUT.lock().unwrap();
                    *stored = "Escape".to_string();
                }
                // Ctrl+Escape to resume when paused
                let ctrl_esc = Shortcut::new(Some(Modifiers::CONTROL), Code::Escape);
                if let Err(e) = app.global_shortcut().register(ctrl_esc) {
                    log::warn!("Could not register Ctrl+Escape shortcut: {}", e);
                }
                {
                    let mut stored = UNPAUSE_SHORTCUT.lock().unwrap();
                    *stored = "Ctrl+Escape".to_string();
                }
            }

            // Build system tray
            let is_mac = cfg!(target_os = "macos");
            let current_combo = TOGGLE_SHORTCUT.lock().unwrap().clone();
            let display_combo = if current_combo.is_empty() {
                "(no shortcut)".to_string()
            } else if is_mac {
                current_combo.replace("Ctrl", "⌃").replace("Alt", "⌥").replace("Shift", "⇧").replace("Super", "⌘")
            } else {
                current_combo.clone()
            };
            let toggle_label = format!("Show / Hide  ({})", display_combo);
            let quit_label = if is_mac {
                "Quit  (⌘Q)"
            } else {
                "Quit  (Ctrl+Q)"
            };

            let toggle_item =
                MenuItemBuilder::with_id("toggle", &toggle_label).build(app)?;
            let quit_item =
                MenuItemBuilder::with_id("quit", quit_label).build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&toggle_item, &quit_item])
                .build()?;

            let _tray = TrayIconBuilder::with_id("main")
                .tooltip("Agent Arcade")
                .title("")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "toggle" => toggle_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // Size and position the window to cover the full screen
            if let Some(win) = app.get_webview_window("main") {
                let resize_window = |w: &tauri::WebviewWindow| {
                    if let Ok(Some(monitor)) = w.primary_monitor() {
                        let size = monitor.size();
                        let pos = monitor.position();
                        let scale = monitor.scale_factor();
                        let bottom_trim = (5.0 * scale) as u32;
                        let _ = w.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
                        let _ = w.set_size(tauri::PhysicalSize::new(size.width, size.height - bottom_trim));
                    }
                };

                resize_window(&win);

                // Always on top at screen-saver level
                let _ = win.set_always_on_top(true);

                // macOS: visible on all workspaces/spaces
                #[cfg(target_os = "macos")]
                {
                    let _ = win.set_visible_on_all_workspaces(true);
                }

                // Show the window
                let _ = win.show();
                let _ = win.set_focus();
                VISIBLE.store(true, Ordering::SeqCst);

                // Re-apply size after a brief delay to handle monitor detection race
                let win_clone = win.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    if let Ok(Some(monitor)) = win_clone.primary_monitor() {
                        let size = monitor.size();
                        let pos = monitor.position();
                        let scale = monitor.scale_factor();
                        let bottom_trim = (5.0 * scale) as u32;
                        let _ = win_clone.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
                        let _ = win_clone.set_size(tauri::PhysicalSize::new(size.width, size.height - bottom_trim));
                    }
                });

                // Check for app updates after a short delay (once per session)
                let app_handle = app.handle().clone();
                if !UPDATE_CHECK_DONE.swap(true, Ordering::SeqCst) { std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    tauri::async_runtime::spawn(async move {
                        use tauri_plugin_updater::UpdaterExt;
                        let updater = match app_handle.updater_builder().build() {
                            Ok(u) => u,
                            Err(e) => { log::warn!("Failed to build updater: {}", e); return; }
                        };
                        match updater.check().await {
                            Ok(Some(update)) => {
                                let version: String = update.version
                                    .chars()
                                    .filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-')
                                    .collect();
                                if let Some(win) = app_handle.get_webview_window("main") {
                                    let _ = win.eval(&format!(
                                        "if(window.__agentArcadeUpdateAvailable)window.__agentArcadeUpdateAvailable('{}')",
                                        version
                                    ));
                                }
                            }
                            Ok(None) => log::info!("App is up to date"),
                            Err(e) => log::warn!("Update check failed: {}", e),
                        }
                    });
                }); }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Agent Arcade")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { has_visible_windows, .. } = event {
                if !has_visible_windows {
                    show_window(app);
                }
            }
            let _ = (app, event); // suppress unused warnings on non-macOS
        });
}
