// main.js
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const isDev = process.env.NODE_ENV === "development";

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (isDev) {
    // Memuat dari server Vite (port 5173) saat pengembangan
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    // Memuat dari build React saat produksi
    mainWindow.loadFile(
      path.join(__dirname, "frontend-react", "dist", "index.html")
    );
  }
}

app.whenReady().then(createWindow);

// Tambahkan logika IPC dan PDF Printing di sini
// ... (ipcMain.on('print-pdf-request', ...))
