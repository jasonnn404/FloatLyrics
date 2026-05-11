import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("floatLyrics", {
  toggleOverlay: () => ipcRenderer.invoke("overlay:toggle"),
  closeOverlay: () => ipcRenderer.invoke("overlay:close"),
  setOverlaySize: (size: "small" | "medium" | "large") =>
    ipcRenderer.invoke("overlay:set-size", size),
  controlSpotify: (action: "previous" | "playPause" | "next") =>
    ipcRenderer.invoke("spotify:system-control", action),
  openSpotifyAuthWindow: (authUrl: string) =>
    ipcRenderer.invoke("spotify:open-auth-window", authUrl),
  onSpotifyCallback: (callback: (callbackUrl: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, callbackUrl: string) => {
      callback(callbackUrl);
    };

    ipcRenderer.on("spotify:callback", listener);
    return () => ipcRenderer.removeListener("spotify:callback", listener);
  }
});
