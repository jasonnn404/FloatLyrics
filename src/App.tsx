import { useEffect, useMemo, useState } from "react";
import { LogIn, Pause, Play, SkipBack, SkipForward, SlidersHorizontal } from "lucide-react";
import {
  exchangeCallbackForTokens,
  getCurrentPlayback,
  getStoredTokens,
  hasSpotifyClientId,
  pauseSpotifyPlayback,
  previousSpotifyPlayback,
  resumeSpotifyPlayback,
  skipSpotifyPlayback,
  startSpotifyLogin,
  type SpotifyPlayback
} from "./lib/spotify";
import { formatTime, getActiveLyricIndex, getLyrics, type LyricLine } from "./lib/lyrics";

type DisplayMode = "compact" | "focus";

const mockLyrics = [
  "Connect to Spotify",
  "Synced lyrics will appear here"
];

const playbackTickMs = 250;

function App() {
  const [currentLine, setCurrentLine] = useState(0);
  const [opacity, setOpacity] = useState(86);
  const [mode, setMode] = useState<DisplayMode>("compact");
  const [showControls, setShowControls] = useState(true);
  const [showTitle, setShowTitle] = useState(true);
  const [showTimer, setShowTimer] = useState(true);
  const [isSpotifyConnected, setIsSpotifyConnected] = useState(() => Boolean(getStoredTokens()));
  const [spotifyStatus, setSpotifyStatus] = useState("Spotify not connected");
  const [playback, setPlayback] = useState<SpotifyPlayback | null>(null);
  const [playbackUpdatedAt, setPlaybackUpdatedAt] = useState(Date.now());
  const [playbackClock, setPlaybackClock] = useState(Date.now());
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [lyricsStatus, setLyricsStatus] = useState("Connect to Spotify");

  const estimatedProgressMs = useMemo(() => {
    if (!playback) return 0;
    if (!playback.is_playing) return playback.progress_ms;

    return Math.min(
      playback.duration_ms,
      playback.progress_ms + Math.max(0, playbackClock - playbackUpdatedAt)
    );
  }, [playback, playbackClock, playbackUpdatedAt]);

  const nextLine = useMemo(
    () => {
      const sourceLines = lyrics.length > 0 ? lyrics : mockLyrics.map((text) => ({ text }));
      const nextIndex = currentLine + 1;
      return sourceLines[nextIndex]?.text ?? "";
    },
    [currentLine, lyrics]
  );

  const hasSyncedLyrics = lyrics.length > 0;
  const currentLyricText =
    lyrics[currentLine]?.text ?? (isSpotifyConnected ? lyricsStatus : mockLyrics[currentLine]);
  const trackLabel = playback ? `${playback.title} - ${playback.artist}` : "Waiting for Spotify";
  const progressLabel = playback
    ? `${formatTime(estimatedProgressMs)} / ${formatTime(playback.duration_ms)}`
    : "0:00 / 0:00";

  async function handleSpotifyCallback(callbackUrl = window.location.href) {
    try {
      const tokens = await exchangeCallbackForTokens(callbackUrl);
      if (tokens) {
        setIsSpotifyConnected(true);
        setSpotifyStatus("Spotify connected");
      }
    } catch (error) {
      setSpotifyStatus(error instanceof Error ? error.message : "Spotify login failed");
    } finally {
      if (window.location.pathname === "/callback") {
        window.history.replaceState(null, "", "/");
      }
    }
  }

  useEffect(() => {
    if (!playback || lyrics.length === 0) return;

    setCurrentLine(getActiveLyricIndex(lyrics, estimatedProgressMs));
  }, [estimatedProgressMs, lyrics, playback]);

  useEffect(() => {
    const tickTimer = window.setInterval(() => {
      setPlaybackClock(Date.now());
    }, playbackTickMs);

    return () => window.clearInterval(tickTimer);
  }, []);

  useEffect(() => {
    if (window.location.pathname === "/callback" && window.opener) {
      window.opener.postMessage(
        { type: "floatlyrics:spotify-callback", callbackUrl: window.location.href },
        window.location.origin
      );
      window.close();
      return;
    }

    function handleSpotifyCallbackMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "floatlyrics:spotify-callback") return;
      if (typeof event.data.callbackUrl !== "string") return;

      void handleSpotifyCallback(event.data.callbackUrl);
    }

    window.addEventListener("message", handleSpotifyCallbackMessage);

    const removeSpotifyCallbackListener = window.floatLyrics?.onSpotifyCallback((callbackUrl) => {
      void handleSpotifyCallback(callbackUrl);
    });

    if (window.location.pathname === "/callback") {
      void handleSpotifyCallback();
    }

    return () => {
      window.removeEventListener("message", handleSpotifyCallbackMessage);
      removeSpotifyCallbackListener?.();
    };
  }, []);

  useEffect(() => {
    if (!isSpotifyConnected) return;

    let isStopped = false;

    async function pollPlayback() {
      try {
        const currentPlayback = await getCurrentPlayback();
        if (isStopped) return;

        setPlayback(currentPlayback);
        setPlaybackUpdatedAt(Date.now());
        setSpotifyStatus(currentPlayback ? "Spotify playing" : "No active Spotify playback");
      } catch (error) {
        if (isStopped) return;
        setSpotifyStatus(error instanceof Error ? error.message : "Spotify playback failed");
      }
    }

    void pollPlayback();
    const pollTimer = window.setInterval(pollPlayback, 1000);

    return () => {
      isStopped = true;
      window.clearInterval(pollTimer);
    };
  }, [isSpotifyConnected]);

  useEffect(() => {
    if (!playback) {
      setLyrics([]);
      setLyricsStatus(isSpotifyConnected ? "No active Spotify playback" : "Connect to Spotify");
      return;
    }

    let isCancelled = false;

    setLyrics([]);
    setLyricsStatus("Finding synced lyrics...");

    getLyrics({
      title: playback.title,
      artist: playback.artist,
      durationMs: playback.duration_ms
    })
      .then((lines) => {
        if (isCancelled) return;

        setLyrics(lines);
        setLyricsStatus(lines.length > 0 ? "" : "No synced lyrics found");
        setCurrentLine(lines.length > 0 ? getActiveLyricIndex(lines, estimatedProgressMs) : 0);
      })
      .catch((error: unknown) => {
        if (isCancelled) return;

        setLyrics([]);
        setLyricsStatus(error instanceof Error ? error.message : "Lyrics lookup failed");
        setCurrentLine(0);
      });

    return () => {
      isCancelled = true;
    };
  }, [playback?.title, playback?.artist, playback?.duration_ms, isSpotifyConnected]);

  async function handleSpotifyLogin() {
    try {
      setSpotifyStatus("Opening Spotify login...");
      await startSpotifyLogin();
    } catch (error) {
      setSpotifyStatus(error instanceof Error ? error.message : "Spotify login failed");
    }
  }

  function handleCloseOverlay() {
    void window.floatLyrics?.closeOverlay();
  }

  async function handlePlaybackControl(action: "previous" | "playPause" | "next") {
    try {
      let didUseSystemControl = false;

      try {
        didUseSystemControl = Boolean(await window.floatLyrics?.controlSpotify(action));
      } catch {
        didUseSystemControl = false;
      }

      if (!didUseSystemControl && action === "previous") {
        await previousSpotifyPlayback();
      } else if (!didUseSystemControl && action === "next") {
        await skipSpotifyPlayback();
      } else if (!didUseSystemControl && playback?.is_playing) {
        await pauseSpotifyPlayback();
      } else if (!didUseSystemControl) {
        await resumeSpotifyPlayback();
      }

      window.setTimeout(() => {
        void getCurrentPlayback().then((currentPlayback) => {
          setPlayback(currentPlayback);
          setPlaybackUpdatedAt(Date.now());
          setSpotifyStatus(currentPlayback ? "Spotify playing" : "No active Spotify playback");
        });
      }, 350);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Spotify control failed";

      setSpotifyStatus(message);
      if (message.includes("Reconnect Spotify")) {
        setIsSpotifyConnected(false);
        setPlayback(null);
      }
    }
  }

  return (
    <main className="overlay-shell" style={{ opacity: opacity / 100 }}>
      <section className="drag-region" aria-label="Draggable lyric overlay">
        <div className="top-bar">
          <div className="window-chrome" aria-label="Window controls">
            <button
              className="close-control"
              type="button"
              aria-label="Close lyrics overlay"
              title="Close overlay. Use Cmd+Shift+L or click the Dock icon to reopen."
              onClick={handleCloseOverlay}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <button
            className="customize-button"
            type="button"
            aria-label={showControls ? "Hide controls" : "Show controls"}
            title={showControls ? "Hide controls" : "Show controls"}
            onClick={() => setShowControls((value) => !value)}
          >
            <SlidersHorizontal size={15} />
            <span>{showControls ? "Hide Controls" : "Show Controls"}</span>
          </button>
        </div>

        <div className="lyrics" aria-live="polite">
          <div className="spotify-panel">
            {isSpotifyConnected ? (
              <>
                {showTitle && <div className="track-title">{trackLabel}</div>}
                {showTimer && (
                  <div className="track-detail">
                    <span>{playback ? progressLabel : spotifyStatus}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="connect-title">Connect to Spotify</div>
                <div className="connect-copy">Play a song and FloatLyrics will follow along.</div>
                <button
                  className="spotify-login action-button primary-action"
                  type="button"
                  disabled={!hasSpotifyClientId()}
                  onClick={handleSpotifyLogin}
                >
                  <LogIn size={16} />
                  <span>Login with Spotify</span>
                </button>
              </>
            )}
          </div>

          {isSpotifyConnected && <p className="current-line">{currentLyricText}</p>}
          {isSpotifyConnected && mode === "compact" && hasSyncedLyrics && (
            <p className="next-line">{nextLine}</p>
          )}
        </div>

        {showControls && (
        <section className="controls" aria-label="Overlay controls">
          {isSpotifyConnected && (
            <div className="playback-controls" role="group" aria-label="Spotify playback controls">
              <button
                className="round-button"
                type="button"
                aria-label="Previous track"
                title="Previous track"
                onClick={() => void handlePlaybackControl("previous")}
              >
                <SkipBack size={15} />
              </button>
              <button
                className="round-button primary-round"
                type="button"
                aria-label={playback?.is_playing ? "Pause Spotify" : "Play Spotify"}
                title={playback?.is_playing ? "Pause Spotify" : "Play Spotify"}
                onClick={() => void handlePlaybackControl("playPause")}
              >
                {playback?.is_playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button
                className="round-button"
                type="button"
                aria-label="Next track"
                title="Next track"
                onClick={() => void handlePlaybackControl("next")}
              >
                <SkipForward size={15} />
              </button>
            </div>
          )}
          <div className="control-group" role="group" aria-label="Lyric display">
            <span className="control-label">Lyrics</span>
            <button
              type="button"
              className={mode === "compact" ? "active" : ""}
              title="Show current and next lyric line"
              onClick={() => setMode("compact")}
            >
              Compact
            </button>
            <button
              type="button"
              className={mode === "focus" ? "active" : ""}
              title="Show only the current lyric line"
              onClick={() => setMode("focus")}
            >
              Focus
            </button>
          </div>
          <div className="control-group" role="group" aria-label="Metadata display">
            <span className="control-label">Show</span>
            <button
              type="button"
              className={showTitle ? "active" : ""}
              title="Show or hide song title"
              onClick={() => setShowTitle((value) => !value)}
            >
              Title
            </button>
            <button
              type="button"
              className={showTimer ? "active" : ""}
              title="Show or hide playback time"
              onClick={() => setShowTimer((value) => !value)}
            >
              Time
            </button>
          </div>
          <label className="opacity-control">
            <span>Opacity</span>
            <input
              type="range"
              min="30"
              max="100"
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
            />
          </label>
        </section>
        )}
      </section>
    </main>
  );
}

export default App;
