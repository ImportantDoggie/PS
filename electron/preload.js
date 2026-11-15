const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  invoke: (action, body) => ipcRenderer.invoke('desktop', action, body),
  onShortcut: (cb) => ipcRenderer.on('shortcut', (e, k) => cb(k))
});
