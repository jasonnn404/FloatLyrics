import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  shell,
  type NativeImage,
  type Rectangle
} from "electron";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  closeLinuxSpotify,
  controlLinuxSpotify,
  getLinuxSpotifyPlayback,
  type SystemSpotifyPlayback
} from "./linuxSpotify.js";

let mainWindow: BrowserWindow | null = null;
let spotifyAuthWindow: BrowserWindow | null = null;
let runtimeAppIcon: NativeImage | undefined;
let overlayResize: { startBounds: Rectangle; startX: number; startY: number } | null = null;
let boundsSaveTimer: NodeJS.Timeout | null = null;
const execFileAsync = promisify(execFile);

const spotifyRedirectUri = "http://127.0.0.1:5173/callback";
const spotifyNoPlayback = "__FLOATLYRICS_NO_PLAYBACK__";
const spotifyFieldDelimiter = "__FLOATLYRICS_FIELD__";
const defaultOverlaySize = { width: 900, height: 340 };
const minimumOverlaySize = { width: 340, height: 180 };

function getDefaultOverlayBounds(size = defaultOverlaySize) {
  const workArea = screen.getPrimaryDisplay().workArea;
  const width = Math.min(size.width, workArea.width);
  const height = Math.min(size.height, workArea.height);

  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height
  };
}

function loadAppIcon() {
  const iconPath = app.isPackaged
    ? path.join(app.getAppPath(), "build", "icon.png")
    : path.join(process.cwd(), "build", "icon.png");

  if (!existsSync(iconPath)) return undefined;

  const icon = nativeImage.createFromPath(iconPath);
  return icon.isEmpty() ? undefined : icon;
}

function loadOverlayBounds() {
  try {
    const savedBounds = JSON.parse(
      readFileSync(path.join(app.getPath("userData"), "window-size.json"), "utf8")
    ) as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
    const width = Number.isFinite(savedBounds.width)
      ? Math.max(minimumOverlaySize.width, Math.round(savedBounds.width as number))
      : defaultOverlaySize.width;
    const height = Number.isFinite(savedBounds.height)
      ? Math.max(minimumOverlaySize.height, Math.round(savedBounds.height as number))
      : defaultOverlaySize.height;

    if (!Number.isFinite(savedBounds.x) || !Number.isFinite(savedBounds.y)) {
      return getDefaultOverlayBounds({ width, height });
    }

    const display = screen.getDisplayMatching({
      x: Math.round(savedBounds.x as number),
      y: Math.round(savedBounds.y as number),
      width,
      height
    });
    const workArea = display.workArea;
    const visibleWidth = Math.min(width, workArea.width);
    const visibleHeight = Math.min(height, workArea.height);

    return {
      x: Math.min(
        workArea.x + workArea.width - visibleWidth,
        Math.max(workArea.x, Math.round(savedBounds.x as number))
      ),
      y: Math.min(
        workArea.y + workArea.height - visibleHeight,
        Math.max(workArea.y, Math.round(savedBounds.y as number))
      ),
      width: visibleWidth,
      height: visibleHeight
    };
  } catch {
    return getDefaultOverlayBounds();
  }
}

function keepOverlayReachable() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const bounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const workArea = display.workArea;
  const visibleDragWidth = Math.min(80, bounds.width);
  const visibleDragHeight = Math.min(32, bounds.height);
  const x = Math.min(
    workArea.x + workArea.width - visibleDragWidth,
    Math.max(workArea.x - bounds.width + visibleDragWidth, bounds.x)
  );
  const y = Math.min(
    workArea.y + workArea.height - visibleDragHeight,
    Math.max(workArea.y, bounds.y)
  );

  if (x !== bounds.x || y !== bounds.y) {
    mainWindow.setPosition(x, y, false);
  }
}

function fitOverlayToCurrentDisplay() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const bounds = mainWindow.getBounds();
  const workArea = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);
  const x = Math.min(workArea.x + workArea.width - width, Math.max(workArea.x, bounds.x));
  const y = Math.min(workArea.y + workArea.height - height, Math.max(workArea.y, bounds.y));

  mainWindow.setBounds({ x, y, width, height }, false);
}

function saveOverlayBounds(window: BrowserWindow) {
  try {
    writeFileSync(
      path.join(app.getPath("userData"), "window-size.json"),
      JSON.stringify(window.getBounds())
    );
  } catch {
    // Window persistence should not interfere with the overlay.
  }
}

function scheduleOverlayBoundsSave() {
  if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
  boundsSaveTimer = setTimeout(() => {
    boundsSaveTimer = null;
    if (mainWindow && !mainWindow.isDestroyed()) saveOverlayBounds(mainWindow);
  }, 250);
}

function createWindow() {
  const initialBounds = loadOverlayBounds();

  mainWindow = new BrowserWindow({
    ...initialBounds,
    minWidth: minimumOverlaySize.width,
    minHeight: minimumOverlaySize.height,
    transparent: true,
    frame: false,
    resizable: false,
    maximizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    icon: runtimeAppIcon,
    ...(process.platform === "darwin" ? {
      titleBarStyle: "hidden" as const,
      trafficLightPosition: { x: -100, y: -100 }
    } : {}),
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.platform === "darwin") {
    mainWindow.setAlwaysOnTop(true, "screen-saver");
  } else {
    mainWindow.setAlwaysOnTop(true);
  }
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setFullScreenable(false);

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("close", () => {
    if (mainWindow) saveOverlayBounds(mainWindow);
  });

  mainWindow.on("closed", () => {
    overlayResize = null;
    mainWindow = null;
  });

  mainWindow.on("resize", scheduleOverlayBoundsSave);
  mainWindow.on("move", scheduleOverlayBoundsSave);
  mainWindow.on("moved", keepOverlayReachable);
  mainWindow.on("blur", () => {
    overlayResize = null;
  });
}

app.whenReady().then(() => {
  runtimeAppIcon = loadAppIcon();
  if (process.platform === "darwin" && runtimeAppIcon) {
    app.dock?.setIcon(runtimeAppIcon);
  }

  createWindow();

  screen.on("display-removed", fitOverlayToCurrentDisplay);
  screen.on("display-metrics-changed", fitOverlayToCurrentDisplay);

  globalShortcut.register("CommandOrControl+Shift+L", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      overlayResize = null;
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

ipcMain.on("overlay:resize-start", (event, screenX: number, screenY: number) => {
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    !Number.isFinite(screenX) ||
    !Number.isFinite(screenY)
  ) return;

  overlayResize = {
    startBounds: mainWindow.getBounds(),
    startX: screenX,
    startY: screenY
  };
});

ipcMain.on("overlay:resize", (event, screenX: number, screenY: number) => {
  if (
    !mainWindow ||
    !overlayResize ||
    event.sender !== mainWindow.webContents ||
    !Number.isFinite(screenX) ||
    !Number.isFinite(screenY)
  ) return;

  const { startBounds, startX, startY } = overlayResize;
  const display = screen.getDisplayMatching(startBounds);
  const maximumWidth = Math.max(
    minimumOverlaySize.width,
    startBounds.width,
    display.workArea.x + display.workArea.width - startBounds.x
  );
  const maximumHeight = Math.max(
    minimumOverlaySize.height,
    startBounds.height,
    display.workArea.y + display.workArea.height - startBounds.y
  );
  const width = Math.min(
    maximumWidth,
    Math.max(minimumOverlaySize.width, Math.round(startBounds.width + screenX - startX))
  );
  const height = Math.min(
    maximumHeight,
    Math.max(minimumOverlaySize.height, Math.round(startBounds.height + screenY - startY))
  );

  const currentBounds = mainWindow.getBounds();
  if (currentBounds.width === width && currentBounds.height === height) return;

  mainWindow.setBounds({ ...startBounds, width, height }, false);
});

ipcMain.on("overlay:resize-end", (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return;

  overlayResize = null;
  scheduleOverlayBoundsSave();
});

ipcMain.handle("spotify:system-control", async (_event, action: "previous" | "playPause" | "next") => {
  if (process.platform === "linux") {
    return controlLinuxSpotify(action);
  }

  if (process.platform !== "darwin") return false;

  const spotifyCommand =
    action === "previous" ? "previous track" : action === "next" ? "next track" : "playpause";

  await execFileAsync("osascript", [
    "-e",
    `tell application "Spotify" to ${spotifyCommand}`
  ]);

  return true;
});

ipcMain.handle("spotify:get-system-playback", async (): Promise<SystemSpotifyPlayback | null> => {
  if (process.platform === "linux") {
    return getLinuxSpotifyPlayback();
  }

  if (process.platform !== "darwin") return null;

  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'tell application "Spotify"',
      "-e",
      `if player state is stopped then return "${spotifyNoPlayback}"`,
      "-e",
      "set currentTrack to current track",
      "-e",
      "set trackName to name of currentTrack",
      "-e",
      "set trackArtist to artist of currentTrack",
      "-e",
      "set trackAlbum to album of currentTrack",
      "-e",
      "set trackDuration to duration of currentTrack",
      "-e",
      "set trackPosition to player position",
      "-e",
      "set playbackState to player state as text",
      "-e",
      `return trackName & "${spotifyFieldDelimiter}" & trackArtist & "${spotifyFieldDelimiter}" & trackAlbum & "${spotifyFieldDelimiter}" & (trackDuration as text) & "${spotifyFieldDelimiter}" & (trackPosition as text) & "${spotifyFieldDelimiter}" & playbackState`,
      "-e",
      "end tell"
    ]);

    const output = stdout.trim();
    if (!output || output === spotifyNoPlayback) {
      return null;
    }

    const [title, artist, album, duration, position, playbackState] =
      output.split(spotifyFieldDelimiter);
    const durationMs = Number(duration);
    const positionSeconds = Number(position);

    if (
      !title ||
      !playbackState ||
      !Number.isFinite(durationMs) ||
      !Number.isFinite(positionSeconds)
    ) {
      return null;
    }

    return {
      title,
      artist: artist || "Unknown artist",
      album: album || "Unknown album",
      duration_ms: Math.max(0, Math.round(durationMs)),
      progress_ms: Math.max(0, Math.round(positionSeconds * 1000)),
      is_playing: playbackState === "playing"
    };
  } catch {
    return null;
  }
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
    icon: runtimeAppIcon,
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
  void closeLinuxSpotify();
});
