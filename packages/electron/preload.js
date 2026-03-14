const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  quit: () => ipcRenderer.send('quit'),
  setWindowSize: (width, height) => ipcRenderer.send('set-window-size', width, height),
  setFullscreen: (enabled) => ipcRenderer.send('set-fullscreen', enabled),
  isElectron: true,
});
