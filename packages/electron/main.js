const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

/** Reference kept at module scope so IPC handlers can reach the window. */
let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'Load',
    backgroundColor: '#0a0e1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // In production, load from the built web package
  const indexPath = app.isPackaged
    ? path.join(process.resourcesPath, 'web-dist', 'index.html')
    : path.join(__dirname, '../web/dist/index.html');
  void win.loadFile(indexPath);

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }

  mainWindow = win;
  win.on('closed', () => { mainWindow = null; });
}

ipcMain.on('quit', () => app.quit());

const VALID_WINDOW_SIZES = new Set([
  '1280,720', '1280,800', '1600,900', '1920,1080',
]);

ipcMain.on('set-window-size', (_, width, height) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!VALID_WINDOW_SIZES.has(`${width},${height}`)) return;
    mainWindow.setSize(width, height, true /* animate */);
  }
});

ipcMain.on('set-fullscreen', (_, enabled) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setFullScreen(enabled);
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
