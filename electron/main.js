import { app, BrowserWindow, Menu, dialog } from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.VITE_DEV_SERVER_URL != null;

// Log errors to help debug packaged app crashes
process.on("uncaughtException", (error) => {
  const logPath = path.join(app.getPath("userData"), "crash.log");
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] Uncaught Exception:\n${error.stack}\n\n`);
  dialog.showErrorBox("Application Error", `An error occurred:\n${error.message}\n\nLog saved to: ${logPath}`);
});

process.on("unhandledRejection", (reason) => {
  const logPath = path.join(app.getPath("userData"), "crash.log");
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] Unhandled Rejection:\n${reason}\n\n`);
});

/** @type {BrowserWindow | null} */
let mainWindow = null;

let backendStarted = false;

function handleSquirrelEvent() {
  // During install/update/uninstall, Squirrel may invoke the app with special args.
  // If we don't quit immediately, the installer can trigger multiple unwanted launches.
  if (process.platform !== "win32") return false;
  return process.argv.some((arg) => arg?.startsWith?.("--squirrel"));
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

async function startBackend() {
  if (backendStarted) return;
  backendStarted = true;

  // IMPORTANT:
  // In a packaged app, `process.execPath` points to your app's .exe.
  // Spawning it to run `server.js` can recursively launch more app instances.
  // Instead, start the backend in-process by importing the module.
  
  // In packaged app, resources are in app.asar, so we need to handle paths correctly
  let serverEntry;
  if (app.isPackaged) {
    // When packaged, __dirname is inside app.asar
    serverEntry = path.join(__dirname, "..", "server.js");
  } else {
    serverEntry = path.join(__dirname, "..", "server.js");
  }

  console.log("Starting backend from:", serverEntry);
  
  try {
    await import(pathToFileURL(serverEntry).href);
    console.log("Backend started successfully");
  } catch (error) {
    console.error("Failed to start backend:", error);
    const logPath = path.join(app.getPath("userData"), "crash.log");
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] Backend Error:\n${error.stack}\n\n`);
    dialog.showErrorBox("Backend Error", `Failed to start server:\n${error.message}`);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  if (handleSquirrelEvent()) {
    app.quit();
    return;
  }

  Menu.setApplicationMenu(null);
  await startBackend();
  createWindow();

  app.on("second-instance", () => {
    if (!mainWindow) {
      createWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
