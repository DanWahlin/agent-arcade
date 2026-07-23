use tauri::{
    AppHandle, Manager,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

static VISIBLE: AtomicBool = AtomicBool::new(false);
static PAUSED: AtomicBool = AtomicBool::new(false);
static UPDATE_CHECK_DONE: AtomicBool = AtomicBool::new(false);
static UPDATE_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

/// The current toggle shortcut string (e.g. "Ctrl+Alt+M").
/// Updated by the `set_toggle_shortcut` command from JS.
static TOGGLE_SHORTCUT: Mutex<String> = Mutex::new(String::new());

/// The current pause/unpause shortcut string (default "Escape").
/// Updated by the `set_pause_shortcut` command from JS.
static PAUSE_SHORTCUT: Mutex<String> = Mutex::new(String::new());

/// The current unpause shortcut string (default "Ctrl+Escape").
/// Updated by the `set_unpause_shortcut` command from JS.
/// Only OS-registered while the game is paused so it isn't swallowed
/// system-wide the rest of the time.
static UNPAUSE_SHORTCUT: Mutex<String> = Mutex::new(String::new());

/// Combo string of a default shortcut that failed to register at startup.
/// Surfaced to JS on page load — evaluating it during setup would be lost
/// because the webview hasn't loaded the page yet.
static FAILED_DEFAULT_SHORTCUT: Mutex<String> = Mutex::new(String::new());

/// Tray "Show / Hide" menu item, kept so its label can follow the toggle shortcut.
static TOGGLE_MENU_ITEM: OnceLock<tauri::menu::MenuItem<tauri::Wry>> = OnceLock::new();

/// Registration state for a shortcut whose OS registration toggles with app
/// state (pause/unpause). `generation` cancels jobs superseded by a newer
/// call; `lock` serializes the actual register/unregister calls so rapid
/// pause/resume can't interleave them out of order.
struct ToggleableShortcut {
    combo: &'static Mutex<String>,
    generation: AtomicU64,
    lock: Mutex<()>,
}

static PAUSE_SC: ToggleableShortcut = ToggleableShortcut {
    combo: &PAUSE_SHORTCUT,
    generation: AtomicU64::new(0),
    lock: Mutex::new(()),
};

static UNPAUSE_SC: ToggleableShortcut = ToggleableShortcut {
    combo: &UNPAUSE_SHORTCUT,
    generation: AtomicU64::new(0),
    lock: Mutex::new(()),
};

// ── Tauri commands (called from JS via invoke()) ──────────────────────

/// Enable/disable click-through so clicks pass to apps below the overlay.
/// When disabling click-through (window becomes interactive), proactively
/// request OS keyboard focus. Focus during active gameplay is maintained
/// reactively by the blur handler in hud.js via the request_focus command.
#[tauri::command]
fn set_click_through(app: AppHandle, enabled: bool) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_ignore_cursor_events(enabled);
        if !enabled {
            let _ = win.set_focus();
        }
    }
}

/// Immediately request OS keyboard focus without changing click-through state.
/// Called by the blur handler in hud.js to reclaim focus the instant
/// another window steals it during active gameplay.
#[tauri::command]
fn request_focus(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_focus();
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

/// Track the paused state from the renderer (HUD pause/resume buttons).
/// When paused, shrink window to just the HUD bar so apps behind are usable.
/// When resumed, expand back to full screen with click-through enabled.
#[tauri::command]
fn set_paused(app: AppHandle, paused: bool) {
    if paused {
        pause_game(&app);
    } else {
        resume_game_impl(&app, false);
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
async fn install_update(app: AppHandle) -> Result<(), String> {
    if UPDATE_IN_PROGRESS.swap(true, Ordering::SeqCst) {
        return Err("Update already in progress".to_string());
    }
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater_builder().build().map_err(|e| {
        UPDATE_IN_PROGRESS.store(false, Ordering::SeqCst);
        e.to_string()
    })?;
    match updater.check().await {
        Ok(Some(update)) => {
            // Notify JS that download is starting
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.eval("if(window.__agentArcadeUpdateStatus)window.__agentArcadeUpdateStatus('downloading')");
            }
            if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
                UPDATE_IN_PROGRESS.store(false, Ordering::SeqCst);
                return Err(e.to_string());
            }
            // Notify JS that install is complete, then restart
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.eval("if(window.__agentArcadeUpdateStatus)window.__agentArcadeUpdateStatus('restarting')");
            }
            app.restart();
        }
        Ok(None) => {
            UPDATE_IN_PROGRESS.store(false, Ordering::SeqCst);
            Err("No update available".to_string())
        }
        Err(e) => {
            UPDATE_IN_PROGRESS.store(false, Ordering::SeqCst);
            Err(format!("Update check failed: {}", e))
        }
    }
}

/// Shared helper: swap a global shortcut registration, updating the stored Mutex.
fn swap_shortcut(
    app: &AppHandle,
    storage: &Mutex<String>,
    combo: &str,
    should_register: bool,
) -> Result<String, String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    let new_sc = parse_shortcut(combo).ok_or_else(|| format!("Invalid shortcut: {}", combo))?;
    let old_combo = storage.lock().unwrap().clone();

    if old_combo == combo {
        return Ok(combo.to_string());
    }

    if should_register {
        // Register first so a failure leaves the existing shortcut intact.
        app.global_shortcut()
            .register(new_sc)
            .map_err(|e| format!("Could not register {}: {}", combo, e))?;

        if let Some(old_sc) = parse_shortcut(&old_combo) {
            let _ = app.global_shortcut().unregister(old_sc);
        }
    }

    *storage.lock().unwrap() = combo.to_string();

    Ok(combo.to_string())
}

/// Change the toggle shortcut at runtime.
/// `combo` is a string like "Ctrl+Alt+M" or "Ctrl+Shift+G".
/// Returns Ok(combo) on success or an error string if the shortcut can't be registered.
#[tauri::command]
fn set_toggle_shortcut(app: AppHandle, combo: String) -> Result<String, String> {
    let result = swap_shortcut(&app, &TOGGLE_SHORTCUT, &combo, true)?;
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
    if *PAUSE_SHORTCUT.lock().unwrap() == combo {
        return Ok(combo);
    }

    PAUSE_SC.generation.fetch_add(1, Ordering::SeqCst);
    let _registration = PAUSE_SC.lock.lock().unwrap();
    // Only OS-registered while the game is visible and unpaused.
    let should_register =
        VISIBLE.load(Ordering::SeqCst) && !PAUSED.load(Ordering::SeqCst);
    swap_shortcut(&app, &PAUSE_SHORTCUT, &combo, should_register)
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
    if *UNPAUSE_SHORTCUT.lock().unwrap() == combo {
        return Ok(combo);
    }

    UNPAUSE_SC.generation.fetch_add(1, Ordering::SeqCst);
    let _registration = UNPAUSE_SC.lock.lock().unwrap();
    // Only OS-registered while paused; otherwise just store the combo.
    let should_register = PAUSED.load(Ordering::SeqCst);
    swap_shortcut(&app, &UNPAUSE_SHORTCUT, &combo, should_register)
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

/// Format a combo string for display, using modifier symbols on macOS.
fn format_combo_display(combo: &str) -> String {
    if combo.is_empty() {
        "(no shortcut)".to_string()
    } else if cfg!(target_os = "macos") {
        combo
            .replace("Ctrl", "⌃")
            .replace("Alt", "⌥")
            .replace("Shift", "⇧")
            .replace("Super", "⌘")
    } else {
        combo.to_string()
    }
}

/// Update the tray menu toggle label with the new shortcut.
fn update_tray_label(_app: &AppHandle, combo: &str) {
    if let Some(item) = TOGGLE_MENU_ITEM.get() {
        let _ = item.set_text(format!("Show / Hide  ({})", format_combo_display(combo)));
    }
}

// ── Window helpers ────────────────────────────────────────────────────

/// Monitor used for overlay sizing/positioning. Always the primary monitor —
/// matching the original behavior. Using current_monitor() here mispositions
/// the window when the initial (hidden) window materializes on a non-primary
/// display or displays have different scale factors, which shifts the whole
/// app sideways and breaks get_cursor_in_window's coordinate math (making the
/// HUD undetectable and unclickable).
fn overlay_monitor(win: &tauri::WebviewWindow) -> Option<tauri::Monitor> {
    win.primary_monitor().ok().flatten()
}

/// Monitor geometry in logical (point) units: (x, y, width, height).
/// All window sizing/positioning uses logical coordinates. Physical-pixel
/// math breaks on mixed-DPI multi-monitor setups: tauri interprets
/// Physical* values through the WINDOW's current scale factor, so a window
/// that materialized on a scale-1 monitor gets double-sized/mispositioned
/// when targeting a scale-2 monitor. Logical points are scale-independent.
fn monitor_logical_rect(monitor: &tauri::Monitor) -> (f64, f64, f64, f64) {
    let scale = monitor.scale_factor();
    (
        monitor.position().x as f64 / scale,
        monitor.position().y as f64 / scale,
        monitor.size().width as f64 / scale,
        monitor.size().height as f64 / scale,
    )
}

/// Shrink the window to just the HUD bar, centered at the top of the monitor,
/// so apps behind are fully usable while paused.
fn shrink_to_hud(win: &tauri::WebviewWindow) {
    if let Some(monitor) = overlay_monitor(win) {
        let (mx, my, mw, _mh) = monitor_logical_rect(&monitor);
        let hud_w = 1200.0_f64.min(mw);
        let hud_h = 152.0;
        let x = mx + ((mw - hud_w) / 2.0).max(0.0);
        let _ = win.set_size(tauri::LogicalSize::new(hud_w, hud_h));
        let _ = win.set_position(tauri::LogicalPosition::new(x, my));
    }
}

/// Expand the window to cover the monitor, minus a small bottom trim.
fn expand_fullscreen(win: &tauri::WebviewWindow) {
    if let Some(monitor) = overlay_monitor(win) {
        let (mx, my, mw, mh) = monitor_logical_rect(&monitor);
        let bottom_trim = 5.0;
        let _ = win.set_position(tauri::LogicalPosition::new(mx, my));
        let _ = win.set_size(tauri::LogicalSize::new(mw, (mh - bottom_trim).max(1.0)));
    }
}

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
        // Unregister both shortcuts so they pass through to other apps while hidden
        unregister_pause_shortcut(app);
        unregister_unpause_shortcut(app);
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

/// Shared resume logic for both resume paths. `from_hotkey` marks the global
/// shortcut / tray path, where the window may be hidden or unfocused and must
/// be shown, focused, and made interactive. The HUD Resume-button path
/// re-enables click-through immediately instead. In both cases JS
/// restoreAfterResume() sets the definitive click-through value ~300ms later.
fn resume_game_impl(app: &AppHandle, from_hotkey: bool) {
    if let Some(win) = app.get_webview_window("main") {
        PAUSED.store(false, Ordering::SeqCst);
        // Swap shortcuts back: pause key live again, unpause key released
        register_pause_shortcut(app);
        unregister_unpause_shortcut(app);
        if from_hotkey {
            let _ = win.set_ignore_cursor_events(false);
            let _ = win.show();
            let _ = win.set_focus();
        }
        // Expand window first, then notify JS — scene resume and overlay
        // restoration are handled inside __agentArcadeOnResume
        expand_fullscreen(&win);
        let _ = win.eval("window.__agentArcadeOnResume && window.__agentArcadeOnResume()");
        if !from_hotkey {
            let _ = win.set_ignore_cursor_events(true);
        }
    }
}

fn resume_game(app: &AppHandle) {
    resume_game_impl(app, true);
}

fn pause_game(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        PAUSED.store(true, Ordering::SeqCst);
        // Tell the webview to pause the game scene and hide overlays
        let _ = win.eval("window.__agentArcadeOnPause && window.__agentArcadeOnPause()");
        // Swap shortcuts: Escape passes through to other apps while paused,
        // and the unpause combo is only live while paused
        unregister_pause_shortcut(app);
        register_unpause_shortcut(app);
        // Shrink to HUD bar so apps behind are fully usable
        let _ = win.set_ignore_cursor_events(false);
        shrink_to_hud(&win);
    }
}

// ── App entry point ───────────────────────────────────────────────────

/// Register/unregister a state-toggled shortcut. Uses a spawned thread to
/// avoid deadlocking when called from within the global shortcut handler
/// callback; jobs superseded by a newer call are dropped via the generation
/// counter, and the lock keeps the surviving calls from interleaving.
fn set_shortcut_registration(
    app: &AppHandle,
    state: &'static ToggleableShortcut,
    registered: bool,
) {
    let generation = state.generation.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;

        let _registration = state.lock.lock().unwrap();
        if generation != state.generation.load(Ordering::SeqCst) {
            return;
        }

        let combo = state.combo.lock().unwrap().clone();
        if !combo.is_empty() {
            if let Some(sc) = parse_shortcut(&combo) {
                if registered {
                    let _ = app.global_shortcut().register(sc);
                } else {
                    let _ = app.global_shortcut().unregister(sc);
                }
            }
        }
    });
}

fn register_pause_shortcut(app: &AppHandle) {
    set_shortcut_registration(app, &PAUSE_SC, true);
}

fn unregister_pause_shortcut(app: &AppHandle) {
    set_shortcut_registration(app, &PAUSE_SC, false);
}

fn register_unpause_shortcut(app: &AppHandle) {
    set_shortcut_registration(app, &UNPAUSE_SC, true);
}

fn unregister_unpause_shortcut(app: &AppHandle) {
    set_shortcut_registration(app, &UNPAUSE_SC, false);
}

/// True when `shortcut` matches the combo currently stored in `storage`.
fn matches_stored(
    storage: &Mutex<String>,
    shortcut: &tauri_plugin_global_shortcut::Shortcut,
) -> bool {
    let stored = storage.lock().unwrap();
    !stored.is_empty() && parse_shortcut(&stored).is_some_and(|sc| sc == *shortcut)
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

                    let is_toggle = matches_stored(&TOGGLE_SHORTCUT, shortcut);
                    let is_pause = matches_stored(&PAUSE_SHORTCUT, shortcut);
                    let is_unpause = matches_stored(&UNPAUSE_SHORTCUT, shortcut);

                    if is_toggle {
                        toggle_window(app);
                    } else if is_unpause {
                        if PAUSED.load(Ordering::SeqCst) {
                            resume_game(app);
                        }
                    } else if is_pause
                        && !PAUSED.load(Ordering::SeqCst)
                        && VISIBLE.load(Ordering::SeqCst)
                    {
                        pause_game(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![set_click_through, request_focus, set_paused, quit_app, hide_app, get_cursor_in_window, set_toggle_shortcut, get_toggle_shortcut, set_pause_shortcut, get_pause_shortcut, set_unpause_shortcut, get_unpause_shortcut, get_app_version, install_update])
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                // Surface a startup shortcut-registration failure now that the
                // page's JS exists — an eval during setup would be lost.
                let failed = FAILED_DEFAULT_SHORTCUT.lock().unwrap().clone();
                if !failed.is_empty() {
                    let _ = webview.eval(format!(
                        "window.__shortcutRegistrationFailed = '{}';",
                        failed
                    ));
                }
            }
        })
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
                        // Remember the failure — surfaced to JS on page load,
                        // since the webview hasn't loaded the page yet.
                        *FAILED_DEFAULT_SHORTCUT.lock().unwrap() = default_combo.to_string();
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
                // Ctrl+Escape resumes when paused. Only stored here — it is
                // OS-registered on pause and released on resume so it isn't
                // swallowed system-wide while the game is running or hidden.
                {
                    let mut stored = UNPAUSE_SHORTCUT.lock().unwrap();
                    *stored = "Ctrl+Escape".to_string();
                }
            }

            // Build system tray
            let is_mac = cfg!(target_os = "macos");
            let current_combo = TOGGLE_SHORTCUT.lock().unwrap().clone();
            let toggle_label = format!("Show / Hide  ({})", format_combo_display(&current_combo));
            let quit_label = if is_mac {
                "Quit  (⌘Q)"
            } else {
                "Quit  (Ctrl+Q)"
            };

            let toggle_item =
                MenuItemBuilder::with_id("toggle", &toggle_label).build(app)?;
            // Keep a handle so the label can follow future hotkey changes
            let _ = TOGGLE_MENU_ITEM.set(toggle_item.clone());
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
                expand_fullscreen(&win);

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
                    expand_fullscreen(&win_clone);
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
                                    let _ = win.eval(format!(
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
