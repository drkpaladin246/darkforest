'use strict';

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  globalShortcut,
  nativeImage,
  Notification,
  shell,
} = require('electron');
const path = require('path');
const fs = require('fs');

const IS_MAC = process.platform === 'darwin';
const GLOBAL_SHORTCUT = 'CommandOrControl+Shift+Space';
const FULL_SIZE = { width: 1180, height: 760 };
const MINI_SIZE = { width: 300, height: 132 };

let win = null;
let tray = null;
let isQuitting = false;
let miniMode = false;
let fullBounds = null;
let timerState = { label: 'Ready', running: false, phase: 'focus' };

// ---------------------------------------------------------------------------
// Local storage: one JSON file in the user's app-data folder.
// ---------------------------------------------------------------------------
const dataFile = () => path.join(app.getPath('userData'), 'pomodoro-forest.json');

function readData() {
  try {
    return JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
  } catch {
    return null;
  }
}

function writeData(data) {
  const file = dataFile();
  const tmp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  win = new BrowserWindow({
    ...FULL_SIZE,
    minWidth: 280,
    minHeight: 120,
    title: 'Pomodoro Forest',
    backgroundColor: '#0f1714',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // keep the timer and 3D scene accurate in background
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  // Links open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Closing the window hides it to the tray so the timer keeps running.
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function setMiniMode(on) {
  if (!win || miniMode === on) return;
  miniMode = on;
  if (on) {
    fullBounds = win.getBounds();
    win.setAlwaysOnTop(true, 'floating');
    win.setMinimumSize(MINI_SIZE.width, MINI_SIZE.height);
    win.setSize(MINI_SIZE.width, MINI_SIZE.height);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    win.setAlwaysOnTop(false);
    win.setVisibleOnAllWorkspaces(false);
    win.setMinimumSize(280, 120);
    if (fullBounds) win.setBounds(fullBounds);
    else win.setSize(FULL_SIZE.width, FULL_SIZE.height);
  }
  win.webContents.send('mini-mode', on);
  rebuildTrayMenu();
}

// ---------------------------------------------------------------------------
// Tray / menu bar
// ---------------------------------------------------------------------------
function fallbackTrayIcon() {
  const file = path.join(__dirname, '..', 'build', IS_MAC ? 'trayTemplate.png' : 'tray.png');
  const img = nativeImage.createFromPath(file);
  if (!img.isEmpty() && IS_MAC) img.setTemplateImage(true);
  return img;
}

function createTray() {
  tray = new Tray(fallbackTrayIcon());
  tray.setToolTip('Pomodoro Forest');
  if (IS_MAC) tray.setTitle(' Ready');
  tray.on('click', () => {
    if (IS_MAC) return; // macOS shows the context menu on click
    if (win.isVisible() && win.isFocused()) win.hide();
    else showWindow();
  });
  rebuildTrayMenu();
}

function sendCommand(cmd) {
  if (win) win.webContents.send('command', cmd);
}

function rebuildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: `${phaseName(timerState.phase)}  ${timerState.label}`, enabled: false },
    { type: 'separator' },
    { label: timerState.running ? 'Pause' : 'Start', click: () => sendCommand('toggle') },
    { label: 'Skip', click: () => sendCommand('skip') },
    { label: 'Reset', click: () => sendCommand('reset') },
    { type: 'separator' },
    { label: 'Show window', click: showWindow },
    { label: 'Mini mode', type: 'checkbox', checked: miniMode, click: (item) => setMiniMode(item.checked) },
    { type: 'separator' },
    { label: 'Quit Pomodoro Forest', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function phaseName(phase) {
  return { focus: 'Focus', short: 'Short break', long: 'Long break' }[phase] || 'Focus';
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.on('data:load', (e) => {
  e.returnValue = readData();
});

ipcMain.handle('data:save', (_e, data) => {
  writeData(data);
  return true;
});

ipcMain.on('timer:update', (_e, state) => {
  const changed = state.running !== timerState.running || state.phase !== timerState.phase;
  timerState = state;
  if (!tray) return;
  if (IS_MAC) tray.setTitle(' ' + state.label);
  tray.setToolTip(`Pomodoro Forest · ${phaseName(state.phase)} ${state.label}`);
  if (state.icon) {
    const img = nativeImage.createFromDataURL(state.icon);
    if (!img.isEmpty()) {
      tray.setImage(IS_MAC ? img.resize({ width: 18, height: 18 }) : img.resize({ width: 16, height: 16 }));
    }
  }
  if (changed) rebuildTrayMenu();
  else rebuildTrayMenuThrottled();
});

let menuTimer = null;
function rebuildTrayMenuThrottled() {
  if (menuTimer) return;
  menuTimer = setTimeout(() => { menuTimer = null; rebuildTrayMenu(); }, 5000);
}

ipcMain.on('notify', (_e, { title, body, silent }) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: silent !== false });
  n.on('click', showWindow);
  n.show();
});

ipcMain.on('mini-mode:set', (_e, on) => setMiniMode(!!on));
ipcMain.on('window:show', showWindow);

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.pomodoroforest.app');
    createWindow();
    createTray();

    const ok = globalShortcut.register(GLOBAL_SHORTCUT, () => sendCommand('toggle'));
    if (!ok) console.warn('Could not register global shortcut', GLOBAL_SHORTCUT);

    app.on('activate', showWindow);
  });

  app.on('before-quit', () => { isQuitting = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => {
    // Stay alive in the tray; quit happens from the tray menu or Cmd+Q.
  });
}
