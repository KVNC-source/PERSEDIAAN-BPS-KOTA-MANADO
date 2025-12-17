// File: main.js

const { app, BrowserWindow } = require("electron");
const { PythonShell } = require("python-shell");
const path = require("path");
const isDev = process.env.NODE_ENV === "development";

let mainWindow;
let pythonProcess;

function startPythonBackend() {
  const scriptPath = path.join(__dirname, "backend", "api.py");

  const options = {
    mode: "text",
    pythonOptions: ["-u"], // Unbuffered output
    scriptPath: path.dirname(scriptPath),
    args: [],
  };

  pythonProcess = PythonShell.run(
    path.basename(scriptPath),
    options,
    (err, results) => {
      if (err) {
        console.error("Gagal menjalankan Python backend:", err);
      }
      if (results && isDev) {
        console.log("Python output:", results);
      }
    }
  );

  console.log("Backend Python Flask dimulai di port 5000...");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      webSecurity: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "frontend", "index.html"));

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startPythonBackend();
  createWindow();
});

// Tutup proses Python saat aplikasi Electron ditutup
app.on("will-quit", () => {
  if (pythonProcess) {
    // Mengirim sinyal SIGINT untuk menghentikan Flask secara graceful
    pythonProcess.childProcess.kill("SIGINT");
    console.log("Backend Python Flask dihentikan.");
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
