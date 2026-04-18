import { app, BrowserWindow, globalShortcut, Tray, Menu, screen, nativeImage, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// Project root: dist/main/main.js -> ../../
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const LOG_DIR = path.join(PROJECT_ROOT, 'logs');
const LOG = path.join(LOG_DIR, 'agent-break.log');
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}
function log(...args: any[]) {
  const line = `[${new Date().toISOString()}] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}\n`;
  try { fs.appendFileSync(LOG, line); } catch {}
  console.log(...args);
}
try { fs.writeFileSync(LOG, ''); } catch {}

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let visible = false;
let paused = false;

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  win = new BrowserWindow({
    width,
    height,
    x,
    y,
    transparent: true,
    frame: false,
    // NOTE: Do NOT use fullscreen on macOS with transparent windows.
    // macOS native fullscreen moves the window to its own Space and
    // forces an opaque background. We size to display.bounds instead
    // so the window covers the screen including menu bar.
    fullscreen: false,
    simpleFullscreen: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    focusable: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Float above everything, including other apps' fullscreen windows
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.openDevTools({ mode: 'detach' });

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    log('renderer:', level, message, sourceId + ':' + line);
  });

  // Cmd+Q quits when window is focused. Esc is handled in the renderer
  // (it toggles the pause overlay there).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key.toLowerCase() === 'q' && input.meta) {
      event.preventDefault();
      app.quit();
    }
  });

  // Start visible for first-run verification (will switch to hide() once ported).
  win.once('ready-to-show', () => {
    win!.show();
    // On macOS, the app must be activated for the window to receive keyboard
    // input. `app.focus({ steal: true })` brings the app to the foreground.
    app.focus({ steal: true });
    win!.focus();
    win!.webContents.focus();
    visible = true;
  });

  win.on('closed', () => {
    win = null;
  });
}

function setPausedState(isPaused: boolean) {
  paused = !!isPaused;
  if (paused) {
    // While paused, register Esc as a global shortcut so the user can resume
    // even if focus has moved to another app (click-through is on while paused).
    try {
      globalShortcut.register('Escape', () => {
        if (!win) return;
        win.setIgnoreMouseEvents(false);
        win.show();
        app.focus({ steal: true });
        win.focus();
        win.webContents.focus();
        win.webContents.send('agent-break:resume');
      });
    } catch (e) {
      log('failed to register global Escape:', String(e));
    }
  } else {
    try { globalShortcut.unregister('Escape'); } catch {}
  }
}

function toggleWindow() {
  if (!win) return;
  // If currently paused, the global shortcut should resume the game and
  // restore focus, not hide the window.
  if (visible && paused) {
    win.setIgnoreMouseEvents(false);
    win.show();
    app.focus({ steal: true });
    win.focus();
    win.webContents.focus();
    win.webContents.send('agent-break:resume');
    return;
  }
  if (visible) {
    win.hide();
    visible = false;
  } else {
    win.show();
    app.focus({ steal: true });
    win.focus();
    win.webContents.focus();
    visible = true;
  }
}

function createTray() {
  log('createTray: starting');
  const iconPath = path.join(__dirname, '..', 'assets', 'sprites', 'small_0.png');
  let img = nativeImage.createFromPath(iconPath);
  log('createTray: iconPath=', iconPath, 'empty=', img.isEmpty(), 'size=', img.getSize());
  if (img.isEmpty()) {
    img = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAH0lEQVQ4T2NkYGD4z0AEYBxVSF6YjCo8Go0wY0wAAGwCBQHX5kKHAAAAAElFTkSuQmCC'
    );
  } else {
    img = img.resize({ width: 18, height: 18 });
  }

  try {
    tray = new Tray(img);
    tray.setToolTip('Agent Break');
    tray.setTitle('🍄');
    const menu = Menu.buildFromTemplate([
      { label: 'Show / Hide  (⌃⌥M)', click: toggleWindow },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.quit(); } },
    ]);
    tray.setContextMenu(menu);
    tray.on('click', toggleWindow);
    log('createTray: success, tray bounds=', tray.getBounds());
  } catch (e: any) {
    log('createTray: ERROR', e?.message || String(e));
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      win.show();
      win.focus();
      visible = true;
    }
  });

  app.whenReady().then(() => {
    log('whenReady fired');

    ipcMain.on('agent-break:set-click-through', (_e, enabled: boolean) => {
      if (!win) return;
      // forward: true keeps mouse-move events flowing for hover detection
      // while clicks pass through to apps below.
      win.setIgnoreMouseEvents(!!enabled, { forward: true });
    });

    ipcMain.on('agent-break:set-paused', (_e, isPaused: boolean) => {
      setPausedState(!!isPaused);
    });

    createWindow();
    createTray();

    const ok = globalShortcut.register('Control+Alt+M', toggleWindow);
    log('globalShortcut Control+Alt+M registered=', ok);
    if (!ok) {
      globalShortcut.register('Control+Alt+Shift+M', toggleWindow);
    }
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    // Stay alive in tray; user quits via menu or hotkey reopens
  });
}
