import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  Blend,
  GripHorizontal,
  LogIn,
  Minus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Type
} from "lucide-react";
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
import { romanizeLyrics } from "./lib/romanize";

type DisplayMode = "compact" | "focus";
type LyricsTextMode = "original" | "romanized";
type ResizeDrag = {
  pointerId: number;
  nextX: number;
  nextY: number;
  animationFrame: number | null;
};

const mockLyrics = [
  "Open Spotify desktop",
  "Synced lyrics will appear here"
];

const playbackTickMs = 250;
const fontScaleStorageKey = "floatlyrics.font-scale";
const minimumFontScale = 70;
const maximumFontScale = 160;
const fontScaleStep = 10;

function getStoredFontScale() {
  try {
    const value = Number(localStorage.getItem(fontScaleStorageKey));
    return Number.isFinite(value) && value >= minimumFontScale && value <= maximumFontScale
      ? value
      : 100;
  } catch {
    return 100;
  }
}

async function getSystemSpotifyPlayback() {
  try {
    return (await window.floatLyrics?.getSystemPlayback()) ?? null;
  } catch {
    return null;
  }
}

function formatPlaybackStatus(playback: SpotifyPlayback, source: "Spotify" | "Spotify desktop") {
  return playback.is_playing ? `${source} playing` : `${source} paused`;
}

function formatSpotifyPlaybackError(error: unknown) {
  const message = error instanceof Error ? error.message : "Spotify playback failed";

  if (message.includes("(403)")) {
    return "Spotify API blocked. Use Spotify desktop or check Premium/allowlist.";
  }

  return message;
}

async function getPlaybackSnapshot(isSpotifyConnected: boolean) {
  let apiError: unknown = null;

  const systemPlayback = await getSystemSpotifyPlayback();
  if (systemPlayback) {
    return {
      playback: systemPlayback,
      status: formatPlaybackStatus(systemPlayback, "Spotify desktop")
    };
  }

  if (isSpotifyConnected) {
    try {
      const apiPlayback = await getCurrentPlayback();
      if (apiPlayback) {
        return {
          playback: apiPlayback,
          status: formatPlaybackStatus(apiPlayback, "Spotify")
        };
      }
    } catch (error) {
      apiError = error;
    }
  }

  if (apiError) {
    return {
      playback: null,
      status: formatSpotifyPlaybackError(apiError)
    };
  }

  return {
    playback: null,
    status: isSpotifyConnected ? "No active Spotify playback" : "Open Spotify desktop or connect to Spotify"
  };
}

function App() {
  const resizeDrag = useRef<ResizeDrag | null>(null);
  const lyricsContainer = useRef<HTMLDivElement | null>(null);
  const lyricsContent = useRef<HTMLDivElement | null>(null);
  const [currentLine, setCurrentLine] = useState(0);
  const [opacity, setOpacity] = useState(86);
  const [mode, setMode] = useState<DisplayMode>("compact");
  const [showControls, setShowControls] = useState(true);
  const [showTitle, setShowTitle] = useState(true);
  const [showTimer, setShowTimer] = useState(true);
  const [fontScale, setFontScale] = useState(getStoredFontScale);
  const [isSpotifyConnected, setIsSpotifyConnected] = useState(() => Boolean(getStoredTokens()));
  const [spotifyStatus, setSpotifyStatus] = useState("Spotify not connected");
  const [playback, setPlayback] = useState<SpotifyPlayback | null>(null);
  const [playbackUpdatedAt, setPlaybackUpdatedAt] = useState(Date.now());
  const [playbackClock, setPlaybackClock] = useState(Date.now());
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [romanizedLyrics, setRomanizedLyrics] = useState<LyricLine[]>([]);
  const [lyricsTextMode, setLyricsTextMode] = useState<LyricsTextMode>("original");
  const [isRomanizing, setIsRomanizing] = useState(false);
  const [lyricsStatus, setLyricsStatus] = useState("Open Spotify desktop");
  const [isLyricsLoading, setIsLyricsLoading] = useState(false);
  const [lyricsRetryCount, setLyricsRetryCount] = useState(0);

  const estimatedProgressMs = useMemo(() => {
    if (!playback) return 0;
    if (!playback.is_playing) return playback.progress_ms;

    return Math.min(
      playback.duration_ms,
      playback.progress_ms + Math.max(0, playbackClock - playbackUpdatedAt)
    );
  }, [playback, playbackClock, playbackUpdatedAt]);

  const displayedLyrics =
    lyricsTextMode === "romanized" && romanizedLyrics.length > 0 ? romanizedLyrics : lyrics;
  const nextLine = useMemo(
    () => {
      const sourceLines = displayedLyrics.length > 0
        ? displayedLyrics
        : mockLyrics.map((text) => ({ text }));
      const nextIndex = currentLine + 1;
      return sourceLines[nextIndex]?.text ?? "";
    },
    [currentLine, displayedLyrics]
  );

  const hasSyncedLyrics = lyrics.length > 0;
  const hasPlaybackContext = isSpotifyConnected || Boolean(playback);
  const canRetryLyrics = Boolean(playback) && !hasSyncedLyrics && !isLyricsLoading;
  const currentLyricText =
    displayedLyrics[currentLine]?.text ?? (hasPlaybackContext ? lyricsStatus : mockLyrics[currentLine]);
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
    try {
      localStorage.setItem(fontScaleStorageKey, String(fontScale));
    } catch {
      // Preference persistence should not block font resizing.
    }
  }, [fontScale]);

  useEffect(() => {
    window.addEventListener("blur", finishResizeDrag);
    return () => {
      window.removeEventListener("blur", finishResizeDrag);
      finishResizeDrag();
    };
  }, []);

  useLayoutEffect(() => {
    const container = lyricsContainer.current;
    const content = lyricsContent.current;
    if (!container || !content) return;
    const measuredContainer = container;
    const measuredContent = content;

    let animationFrame = 0;
    const desiredScale = fontScale / 100;
    const minimumFitScale = 0.34;

    function setScale(scale: number) {
      measuredContainer.style.setProperty("--fitted-lyrics-scale", String(scale));
    }

    function contentFits() {
      return (
        measuredContent.scrollHeight <= measuredContainer.clientHeight + 1 &&
        measuredContent.scrollWidth <= measuredContainer.clientWidth + 1
      );
    }

    function fitCurrentLayout() {
      setScale(desiredScale);
      if (contentFits()) return true;

      setScale(minimumFitScale);
      if (!contentFits()) return false;

      let lowerScale = minimumFitScale;
      let upperScale = desiredScale;
      for (let iteration = 0; iteration < 8; iteration += 1) {
        const candidateScale = (lowerScale + upperScale) / 2;
        setScale(candidateScale);
        if (contentFits()) {
          lowerScale = candidateScale;
        } else {
          upperScale = candidateScale;
        }
      }

      setScale(lowerScale);
      return true;
    }

    function fitLyrics() {
      if (measuredContainer.clientWidth === 0 || measuredContainer.clientHeight === 0) return;

      delete measuredContainer.dataset.fitTight;
      delete measuredContainer.dataset.fitMinimal;
      delete measuredContainer.dataset.fitOverflow;

      if (fitCurrentLayout()) return;

      measuredContainer.dataset.fitTight = "true";
      if (fitCurrentLayout()) return;

      if (hasPlaybackContext) {
        measuredContainer.dataset.fitMinimal = "true";
        if (fitCurrentLayout()) return;
      }

      measuredContainer.dataset.fitOverflow = "true";
      setScale(minimumFitScale);
    }

    function scheduleFit() {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(fitLyrics);
    }

    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(measuredContainer);
    scheduleFit();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [
    fontScale,
    currentLyricText,
    nextLine,
    mode,
    showTitle,
    showTimer,
    showControls,
    hasPlaybackContext,
    canRetryLyrics,
    trackLabel,
    spotifyStatus
  ]);

  useEffect(() => {
    if (!playback || lyrics.length === 0) return;

    setCurrentLine(getActiveLyricIndex(lyrics, estimatedProgressMs));
  }, [estimatedProgressMs, lyrics, playback]);

  useEffect(() => {
    let isCancelled = false;

    setRomanizedLyrics([]);
    setLyricsTextMode("original");
    if (lyrics.length === 0) {
      setIsRomanizing(false);
      return;
    }

    setIsRomanizing(true);
    void romanizeLyrics(lyrics)
      .then((lines) => {
        if (!isCancelled) setRomanizedLyrics(lines);
      })
      .catch(() => {
        if (!isCancelled) setRomanizedLyrics([]);
      })
      .finally(() => {
        if (!isCancelled) setIsRomanizing(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [lyrics]);

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
    let isStopped = false;

    async function pollPlayback() {
      try {
        const snapshot = await getPlaybackSnapshot(isSpotifyConnected);
        if (isStopped) return;

        setPlayback(snapshot.playback);
        setPlaybackUpdatedAt(Date.now());
        setSpotifyStatus(snapshot.status);
      } catch (error) {
        if (isStopped) return;
        setPlayback(null);
        setSpotifyStatus(formatSpotifyPlaybackError(error));
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
      setIsLyricsLoading(false);
      setLyricsStatus(
        isSpotifyConnected ? "No active Spotify playback" : "Open Spotify desktop or connect to Spotify"
      );
      return;
    }

    let isCancelled = false;

    setLyrics([]);
    setIsLyricsLoading(true);
    setLyricsStatus("Finding synced lyrics...");

    getLyrics({
      title: playback.title,
      artist: playback.artist,
      durationMs: playback.duration_ms
    })
      .then((lines) => {
        if (isCancelled) return;

        setLyrics(lines);
        setIsLyricsLoading(false);
        setLyricsStatus(lines.length > 0 ? "" : "No synced lyrics found");
        setCurrentLine(lines.length > 0 ? getActiveLyricIndex(lines, estimatedProgressMs) : 0);
      })
      .catch((error: unknown) => {
        if (isCancelled) return;

        setLyrics([]);
        setIsLyricsLoading(false);
        setLyricsStatus(error instanceof Error ? error.message : "Lyrics lookup failed");
        setCurrentLine(0);
      });

    return () => {
      isCancelled = true;
    };
  }, [playback?.title, playback?.artist, playback?.duration_ms, isSpotifyConnected, lyricsRetryCount]);

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

  function handleRetryLyrics() {
    if (!playback || isLyricsLoading) return;

    setLyricsRetryCount((count) => count + 1);
  }

  function changeFontScale(change: number) {
    setFontScale((value) =>
      Math.min(maximumFontScale, Math.max(minimumFontScale, value + change))
    );
  }

  function handleResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !window.floatLyrics) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    window.floatLyrics.startOverlayResize(event.screenX, event.screenY);
    resizeDrag.current = {
      pointerId: event.pointerId,
      nextX: event.screenX,
      nextY: event.screenY,
      animationFrame: null
    };
  }

  function finishResizeDrag() {
    const drag = resizeDrag.current;
    if (!drag) return;

    if (drag.animationFrame !== null) window.cancelAnimationFrame(drag.animationFrame);
    resizeDrag.current = null;
    window.floatLyrics?.endOverlayResize();
  }

  function handleResizeMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = resizeDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    drag.nextX = event.screenX;
    drag.nextY = event.screenY;
    if (drag.animationFrame !== null) return;

    drag.animationFrame = window.requestAnimationFrame(() => {
      const currentDrag = resizeDrag.current;
      if (!currentDrag) return;

      window.floatLyrics?.resizeOverlay(currentDrag.nextX, currentDrag.nextY);
      currentDrag.animationFrame = null;
    });
  }

  function handleResizeEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = resizeDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    window.floatLyrics?.resizeOverlay(drag.nextX, drag.nextY);
    finishResizeDrag();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
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
        void getPlaybackSnapshot(isSpotifyConnected).then((snapshot) => {
          setPlayback(snapshot.playback);
          setPlaybackUpdatedAt(Date.now());
          setSpotifyStatus(snapshot.status);
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
    <main
      className="overlay-shell"
      style={{ opacity: opacity / 100 }}
    >
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
          <div className="drag-handle" aria-hidden="true">
            <GripHorizontal size={17} />
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

        <div
          className="lyrics"
          aria-live="polite"
          ref={lyricsContainer}
          style={{ "--fitted-lyrics-scale": fontScale / 100 } as CSSProperties}
        >
          <div className="lyrics-content" ref={lyricsContent}>
            <div className="spotify-panel">
            {hasPlaybackContext ? (
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
                <div className="connect-title">Open Spotify desktop</div>
                <div className="connect-copy">Play a song and FloatLyrics will follow along.</div>
                {hasSpotifyClientId() && (
                  <button
                    className="spotify-login action-button primary-action"
                    type="button"
                    onClick={handleSpotifyLogin}
                  >
                    <LogIn size={16} />
                    <span>Connect Spotify API</span>
                  </button>
                )}
              </>
            )}
            </div>

            {hasPlaybackContext && <p className="current-line">{currentLyricText}</p>}
            {canRetryLyrics && (
              <button
                className="lyrics-retry action-button"
                type="button"
                aria-label="Retry lyrics lookup"
                title="Retry lyrics lookup"
                onClick={handleRetryLyrics}
              >
                <RefreshCw size={15} />
                <span>Retry</span>
              </button>
            )}
            {hasPlaybackContext && mode === "compact" && hasSyncedLyrics && (
              <p className="next-line">{nextLine}</p>
            )}
          </div>
        </div>

        {showControls && (
          <section className="controls" aria-label="Overlay controls">
            <div className="controls-main">
              {hasPlaybackContext && (
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

              <div className="appearance-controls">
                <div className="font-size-control" role="group" aria-label="Lyric font size">
                  <Type size={14} aria-hidden="true" />
                  <button
                    className="font-step-button"
                    type="button"
                    aria-label="Decrease lyric font size"
                    title="Decrease lyric font size"
                    disabled={fontScale <= minimumFontScale}
                    onClick={() => changeFontScale(-fontScaleStep)}
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="range"
                    min={minimumFontScale}
                    max={maximumFontScale}
                    step={fontScaleStep}
                    value={fontScale}
                    aria-label={`Lyric font size ${fontScale}%`}
                    title={`Lyric font size ${fontScale}%`}
                    onChange={(event) => setFontScale(Number(event.target.value))}
                  />
                  <button
                    className="font-step-button"
                    type="button"
                    aria-label="Increase lyric font size"
                    title="Increase lyric font size"
                    disabled={fontScale >= maximumFontScale}
                    onClick={() => changeFontScale(fontScaleStep)}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <label className="opacity-control" title={`Overlay opacity ${opacity}%`}>
                  <Blend size={14} aria-hidden="true" />
                  <span className="sr-only">Overlay opacity</span>
                  <input
                    type="range"
                    min="30"
                    max="100"
                    value={opacity}
                    aria-label={`Overlay opacity ${opacity}%`}
                    onChange={(event) => setOpacity(Number(event.target.value))}
                  />
                </label>
              </div>
            </div>

            <div className="controls-options">
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
              {(isRomanizing || romanizedLyrics.length > 0) && (
                <div className="control-group" role="group" aria-label="Lyric script">
                  <span className="control-label">Script</span>
                  <button
                    type="button"
                    className={lyricsTextMode === "original" ? "active" : ""}
                    onClick={() => setLyricsTextMode("original")}
                  >
                    Original
                  </button>
                  <button
                    type="button"
                    className={lyricsTextMode === "romanized" ? "active" : ""}
                    disabled={isRomanizing || romanizedLyrics.length === 0}
                    title={isRomanizing ? "Preparing romanized lyrics" : "Show romanized lyrics"}
                    onClick={() => setLyricsTextMode("romanized")}
                  >
                    {isRomanizing ? "Preparing..." : "Romanized"}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
        <div
          className="resize-grip"
          aria-hidden="true"
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
          onLostPointerCapture={handleResizeEnd}
        />
      </section>
    </main>
  );
}

export default App;
