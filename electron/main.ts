import { app, BrowserWindow, globalShortcut, ipcMain, shell } from "electron";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

let mainWindow: BrowserWindow | null = null;
let spotifyAuthWindow: BrowserWindow | null = null;
const execFileAsync = promisify(execFile);

const spotifyRedirectUri = "http://127.0.0.1:5173/callback";
const overlaySizes = {
  small: { width: 680, height: 280 },
  medium: { width: 900, height: 340 },
  large: { width: 1160, height: 420 }
} as const;

type OverlaySize = keyof typeof overlaySizes;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: overlaySizes.medium.width,
    height: overlaySizes.medium.height,
    minWidth: 520,
    minHeight: 260,
    transparent: true,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    hasShadow: false,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: -100, y: -100 },
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setFullScreenable(false);

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  globalShortcut.register("CommandOrControl+Shift+L", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on("activate", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

ipcMain.handle("overlay:toggle", () => {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.handle("overlay:close", () => {
  app.quit();
});

ipcMain.handle("overlay:set-size", (_event, size: OverlaySize) => {
  if (!mainWindow || !(size in overlaySizes)) return;

  const bounds = mainWindow.getBounds();
  const nextSize = overlaySizes[size];

  mainWindow.setBounds({
    x: Math.round(bounds.x + (bounds.width - nextSize.width) / 2),
    y: Math.round(bounds.y + (bounds.height - nextSize.height) / 2),
    width: nextSize.width,
    height: nextSize.height
  });
  mainWindow.show();
  mainWindow.focus();
});

ipcMain.handle("spotify:system-control", async (_event, action: "previous" | "playPause" | "next") => {
  if (process.platform !== "darwin") {
    return false;
  }

  const spotifyCommand =
    action === "previous" ? "previous track" : action === "next" ? "next track" : "playpause";

  await execFileAsync("osascript", [
    "-e",
    `tell application "Spotify" to ${spotifyCommand}`
  ]);

  return true;
});

ipcMain.handle("spotify:open-auth-window", (_event, authUrl: string) => {
  spotifyAuthWindow?.close();

  spotifyAuthWindow = new BrowserWindow({
    width: 520,
    height: 760,
    minWidth: 420,
    minHeight: 560,
    title: "Login with Spotify",
    transparent: false,
    frame: true,
    resizable: true,
    closable: true,
    minimizable: true,
    maximizable: true,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  spotifyAuthWindow.setAlwaysOnTop(true, "floating");
  spotifyAuthWindow.center();

  spotifyAuthWindow.once("ready-to-show", () => {
    spotifyAuthWindow?.show();
    spotifyAuthWindow?.focus();
  });

  spotifyAuthWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  spotifyAuthWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key === "Escape") {
      event.preventDefault();
      spotifyAuthWindow?.close();
    }
  });

  const handleAuthCallback = (callbackUrl: string) => {
    if (!callbackUrl.startsWith(spotifyRedirectUri)) return false;

    mainWindow?.webContents.send("spotify:callback", callbackUrl);
    spotifyAuthWindow?.close();
    spotifyAuthWindow = null;
    return true;
  };

  spotifyAuthWindow.webContents.on("will-navigate", (event, url) => {
    if (handleAuthCallback(url)) {
      event.preventDefault();
    }
  });

  spotifyAuthWindow.webContents.on("will-redirect", (event, url) => {
    if (handleAuthCallback(url)) {
      event.preventDefault();
    }
  });

  spotifyAuthWindow.on("closed", () => {
    spotifyAuthWindow = null;
  });

  void spotifyAuthWindow.loadURL(authUrl);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
