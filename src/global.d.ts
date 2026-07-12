import type { SpotifyPlayback } from "./lib/spotify";

export {};

declare global {
  interface Window {
    floatLyrics?: {
      toggleOverlay: () => Promise<void>;
      closeOverlay: () => Promise<void>;
      setOverlaySize: (size: "small" | "medium" | "large") => Promise<void>;
      getSystemPlayback: () => Promise<SpotifyPlayback | null>;
      controlSpotify: (action: "previous" | "playPause" | "next") => Promise<boolean>;
      openSpotifyAuthWindow: (authUrl: string) => Promise<void>;
      onSpotifyCallback: (callback: (callbackUrl: string) => void) => () => void;
    };
  }
}
