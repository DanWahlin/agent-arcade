use tauri::{
    AppHandle, Manager,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

use std::sync::atomic::{AtomicBool, Ordering};

static VISIBLE: AtomicBool = AtomicBool::new(false);
static PAUSED: AtomicBool = AtomicBool::new(false);

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
            // Hide overlays and add paused state via JS
            let _ = win.eval(
                "document.body.classList.add('paused'); \
                 var go=document.getElementById('gameover-overlay'); if(go) go.style.display='none'; \
                 var wb=document.getElementById('wave-banner'); if(wb) wb.style.display='none'; \
                 var ho=document.getElementById('help-overlay'); if(ho) ho.classList.remove('show');"
            );
            // Shrink to HUD bar size so apps behind are fully usable
            let _ = win.set_ignore_cursor_events(false);
            if let Ok(Some(monitor)) = win.primary_monitor() {
                let scale = monitor.scale_factor();
                let hud_width = (1200.0 * scale) as u32;
                let hud_height = (115.0 * scale) as u32;
                let screen_w = monitor.size().width;
                let x = ((screen_w - hud_width) / 2) as i32;
                let _ = win.set_size(tauri::PhysicalSize::new(hud_width, hud_height));
                let _ = win.set_position(tauri::PhysicalPosition::new(x, 0));
            }
        } else {
            // Expand back to full screen and reset position FIRST
            if let Ok(Some(monitor)) = win.primary_monitor() {
                let size = monitor.size();
                let pos = monitor.position();
                let scale = monitor.scale_factor();
                let bottom_trim = (5.0 * scale) as u32;
                let _ = win.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
                let _ = win.set_size(tauri::PhysicalSize::new(size.width, size.height - bottom_trim));
            }
            // Remove paused class and restore overlays after window resize settles
            let _ = win.eval(
                "setTimeout(function() { \
                   document.body.classList.remove('paused'); \
                   var go=document.getElementById('gameover-overlay'); \
                   if(go) go.setAttribute('style', \
                     'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;' + \
                     'display:flex;align-items:center;justify-content:center;' + \
                     'background:rgba(0,0,0,0.75);pointer-events:auto;'); \
                   var wb=document.getElementById('wave-banner'); if(wb) wb.style.display=''; \
                   var c=document.querySelector('canvas'); if(c) c.focus(); \
                 }, 300);"
            );
            let _ = win.set_ignore_cursor_events(true);
        }
    }
    update_escape_shortcut(&app, paused);
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

// ── Window helpers ────────────────────────────────────────────────────

fn show_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_ignore_cursor_events(false);
        let _ = win.show();
        let _ = win.set_focus();
        VISIBLE.store(true, Ordering::SeqCst);
    }
}

fn hide_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
        VISIBLE.store(false, Ordering::SeqCst);
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
        // Resume game immediately, but delay overlay restoration until
        // after the window resize has fully settled (300ms)
        let _ = win.eval("if(window.__agentArcadeResumeFromRust) window.__agentArcadeResumeFromRust(); \
             setTimeout(function() { \
               var go=document.getElementById('gameover-overlay'); \
               if(go) go.setAttribute('style', \
                 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;' + \
                 'display:flex;align-items:center;justify-content:center;' + \
                 'background:rgba(0,0,0,0.75);pointer-events:auto;'); \
               var wb=document.getElementById('wave-banner'); if(wb) wb.style.display=''; \
               var c=document.querySelector('canvas'); if(c) c.focus(); \
             }, 300);");
        PAUSED.store(false, Ordering::SeqCst);
    }
}

fn pause_game(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        // Tell the webview to pause the game scene and hide overlays
        let _ = win.eval(
            "if(window.__agentArcadePause) window.__agentArcadePause(true); \
             var h=document.getElementById('hud'); if(h) h.classList.add('paused'); \
             document.body.classList.add('paused'); \
             var go=document.getElementById('gameover-overlay'); if(go) go.style.display='none'; \
             var wb=document.getElementById('wave-banner'); if(wb) wb.style.display='none';"
        );
        // Enable click-through so user can interact with apps behind
        let _ = win.set_ignore_cursor_events(true);
        PAUSED.store(true, Ordering::SeqCst);
    }
}

// ── Global shortcut management ────────────────────────────────────────

fn update_escape_shortcut(_app: &AppHandle, _register: bool) {
    // No-op: Escape is handled entirely by the in-page keydown handler.
    // When paused and user switches apps, Ctrl+Alt+M brings it back.
}

// ── App entry point ───────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_window(app);
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

                    if event.state() != ShortcutState::Pressed {
                        return;
                    }

                    let toggle_shortcut =
                        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyM);
                    let esc_shortcut = Shortcut::new(None, Code::Escape);

                    if *shortcut == toggle_shortcut {
                        toggle_window(app);
                    } else if *shortcut == esc_shortcut {
                        if PAUSED.load(Ordering::SeqCst) {
                            resume_game(app);
                        } else if VISIBLE.load(Ordering::SeqCst) {
                            pause_game(app);
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![set_click_through, set_paused, quit_app, hide_app, get_cursor_in_window])
        .setup(|app| {
            // Register Ctrl+Alt+M and Escape global shortcuts
            {
                use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
                let toggle =
                    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyM);
                let esc = Shortcut::new(None, Code::Escape);
                app.global_shortcut().register(toggle)?;
                app.global_shortcut().register(esc)?;
            }

            // Build system tray
            let is_mac = cfg!(target_os = "macos");
            let toggle_label = if is_mac {
                "Show / Hide  (⌃⌥M)"
            } else {
                "Show / Hide  (Ctrl+Alt+M)"
            };
            let quit_label = if is_mac {
                "Quit  (⌘Q)"
            } else {
                "Quit  (Ctrl+Q)"
            };

            let toggle_item =
                MenuItemBuilder::with_id("toggle", toggle_label).build(app)?;
            let quit_item =
                MenuItemBuilder::with_id("quit", quit_label).build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&toggle_item, &quit_item])
                .build()?;

            let _tray = TrayIconBuilder::new()
                .tooltip("Agent Arcade")
                .title("🍄")
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
