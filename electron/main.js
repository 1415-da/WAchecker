import { app, BrowserWindow, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.VITE_DEV_SERVER_URL != null;

/** @type {import('node:child_process').ChildProcessWithoutNullStreams | null} */
let backend = null;

function startBackend() {
  if (backend) return;

  // In dev: run your existing Express server with node
  // In prod: we still run the same JS file from the app resources.
  const serverEntry = path.join(__dirname, "..", "server.js");

  backend = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      PORT: process.env.PORT ?? "3000",
    },
    stdio: "inherit",
  });

  backend.on("exit", () => {
    backend = null;
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  startBackend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (backend) {
    backend.kill();
    backend = null;
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});
