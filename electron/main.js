'use strict';
const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../server');

let win, tray, server, PORT = 47823;

function startServer() {
  const userData = app.getPath('userData');
  const hooks = {
    pickExe: async () => {
      const r = await dialog.showOpenDialog(win, { title: 'Выберите исполняемый файл игры', properties: ['openFile'], filters: [{ name: 'Программы', extensions: ['exe', 'bat', 'cmd', 'sh', 'app'] }, { name: 'Все файлы', extensions: ['*'] }] });
      return { ok: !r.canceled, path: r.filePaths[0] || '' };
    },
    pickFolder: async () => {
      const r = await dialog.showOpenDialog(win, { title: 'Выберите папку с играми', properties: ['openDirectory'] });
      return { ok: !r.canceled, path: r.filePaths[0] || '' };
    },
    pickImage: async () => {
      const r = await dialog.showOpenDialog(win, { title: 'Выберите изображение', properties: ['openFile'], filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
      if (r.canceled) return { ok: false };
      // Copy into userData/art and serve via /art route.
      const dir = path.join(userData, 'art'); fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, Date.now() + '-' + path.basename(r.filePaths[0]));
      fs.copyFileSync(r.filePaths[0], dest);
      return { ok: true, path: '/art/' + path.basename(dest), file: dest };
    },
    openExternal: async ({ url }) => { if (/^https?:|^steam:|^com\.epicgames|^uplay:|^origin:|^eadesktop:/.test(url)) await shell.openExternal(url); return { ok: true }; },
    openPath: async ({ path: p }) => { if (p && fs.existsSync(p)) shell.openPath(p); return { ok: true }; },
    setStartup: async ({ enabled }) => { app.setLoginItemSettings({ openAtLogin: !!enabled, openAsHidden: true }); return { ok: true }; },
    setFullscreen: async ({ enabled }) => { if (win) win.setFullScreen(!!enabled); return { ok: true }; },
    minimize: async () => { if (win) win.minimize(); return { ok: true }; },
    quit: async () => { app.quit(); return { ok: true }; },
    version: async () => ({ ok: true, version: app.getVersion(), electron: process.versions.electron, platform: process.platform })
  };
  const { app: expressApp, store, tracker } = createApp({ desktop: true, demo: false, dataFile: path.join(userData, 'library.json'), desktopHooks: hooks, staticDirs: [{ route: '/art', dir: path.join(userData, 'art') }] });
  return new Promise(resolve => {
    server = expressApp.listen(0, '127.0.0.1', () => { PORT = server.address().port; resolve({ store, tracker }); });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 600,
    frame: false, fullscreen: true, backgroundColor: '#05070a',
    show: false, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  win.loadURL(`http://127.0.0.1:${PORT}/`);
  win.once('ready-to-show', () => win.show());
  win.on('close', e => {
    const { store } = global.__launcher || {};
    if (store && store.get().settings.minimizeToTray && !app.isQuiting) { e.preventDefault(); win.hide(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'public', 'assets', 'tray.png');
  const img = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(img.isEmpty() ? nativeImage.createFromBuffer(Buffer.alloc(0)) : img);
  tray.setToolTip('Console Launcher');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть лаунчер', click: () => { win.show(); win.focus(); } },
    { label: 'Сканировать игры', click: () => { win.show(); win.webContents.send('shortcut', 'scan'); } },
    { type: 'separator' },
    { label: 'Выход', click: () => { app.isQuiting = true; app.quit(); } }
  ]));
  tray.on('click', () => { win.show(); win.focus(); });
}

app.whenReady().then(async () => {
  global.__launcher = await startServer();
  createWindow();
  createTray();
  ipcMain.handle('desktop', async (e, action, body) => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/desktop/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    return res.json();
  });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else win.show(); });
app.on('before-quit', () => { app.isQuiting = true; global.__launcher?.tracker.stopAll(); global.__launcher?.store.save(true); });
