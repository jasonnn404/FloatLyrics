import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("floatLyrics", {
  toggleOverlay: () => ipcRenderer.invoke("overlay:toggle"),
  closeOverlay: () => ipcRenderer.invoke("overlay:close"),
  startOverlayResize: (screenX: number, screenY: number) =>
    ipcRenderer.send("overlay:resize-start", screenX, screenY),
  resizeOverlay: (screenX: number, screenY: number) =>
    ipcRenderer.send("overlay:resize", screenX, screenY),
  endOverlayResize: () => ipcRenderer.send("overlay:resize-end"),
  getSystemPlayback: () => ipcRenderer.invoke("spotify:get-system-playback"),
  controlSpotify: (action: "previous" | "playPause" | "next") =>
    ipcRenderer.invoke("spotify:system-control", action),
  getSpotifyVolume: () => ipcRenderer.invoke("spotify:get-volume"),
  setSpotifyVolume: (volume: number) => ipcRenderer.invoke("spotify:set-volume", volume),
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
