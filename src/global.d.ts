import type { SpotifyPlayback } from "./lib/spotify";

export {};

declare global {
  interface Window {
    floatLyrics?: {
      toggleOverlay: () => Promise<void>;
      closeOverlay: () => Promise<void>;
      startOverlayResize: (screenX: number, screenY: number) => void;
      resizeOverlay: (screenX: number, screenY: number) => void;
      endOverlayResize: () => void;
      getSystemPlayback: () => Promise<SpotifyPlayback | null>;
      controlSpotify: (action: "previous" | "playPause" | "next") => Promise<boolean>;
      getSpotifyVolume: () => Promise<number | null>;
      setSpotifyVolume: (volume: number) => Promise<boolean>;
      openSpotifyAuthWindow: (authUrl: string) => Promise<void>;
      onSpotifyCallback: (callback: (callbackUrl: string) => void) => () => void;
    };
  }
}
