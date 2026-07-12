export type LyricLine = {
  timeMs: number;
  text: string;
};

export type LyricsQuery = {
  title: string;
  artist: string;
  durationMs: number;
};

type LrcLibResponse = {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
};

type CachedLyrics = {
  cachedAt: number;
  lines: LyricLine[];
};

type CachedLyricsIndexItem = {
  key: string;
  cachedAt: number;
};

const lyricsCachePrefix = "floatlyrics.lyrics.";
const lyricsCacheIndexKey = `${lyricsCachePrefix}index`;
const maxCachedLyricsEntries = 80;

export async function getLyrics(query: LyricsQuery): Promise<LyricLine[]> {
  const cachedLyrics = readCachedLyrics(query);
  const params = new URLSearchParams({
    track_name: query.title,
    artist_name: query.artist,
    duration: String(Math.round(query.durationMs / 1000))
  });

  try {
    const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
    if (response.status === 404) return cachedLyrics ?? [];

    if (!response.ok) {
      throw new Error(`Lyrics lookup failed (${response.status}).`);
    }

    const data = (await response.json()) as LrcLibResponse;
    if (data.instrumental) return [];

    if (data.syncedLyrics) {
      const lines = parseLrc(data.syncedLyrics);
      writeCachedLyrics(query, lines);
      return lines;
    }

    if (data.plainLyrics) {
      const lines = data.plainLyrics
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((text, index) => ({ timeMs: index * 3500, text }));

      writeCachedLyrics(query, lines);
      return lines;
    }

    return [];
  } catch (error) {
    if (cachedLyrics) return cachedLyrics;
    throw error;
  }
}

export function getActiveLyricIndex(lines: LyricLine[], progressMs: number) {
  if (lines.length === 0) return 0;

  let low = 0;
  let high = lines.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);

    if (lines[mid].timeMs <= progressMs) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return Math.max(0, high);
}

export function formatTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];

  for (const rawLine of lrc.split("\n")) {
    const timestamps = [...rawLine.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    if (timestamps.length === 0) continue;

    const text = rawLine.replace(/\[[^\]]+\]/g, "").trim();
    if (!text) continue;

    for (const timestamp of timestamps) {
      const minutes = Number(timestamp[1]);
      const seconds = Number(timestamp[2]);
      const fraction = timestamp[3] ?? "0";
      const milliseconds = Number(fraction.padEnd(3, "0"));

      lines.push({
        timeMs: minutes * 60_000 + seconds * 1000 + milliseconds,
        text
      });
    }
  }

  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

function readCachedLyrics(query: LyricsQuery) {
  const rawEntry = safeLocalStorageGet(getLyricsCacheKey(query));
  if (!rawEntry) return null;

  try {
    const entry = JSON.parse(rawEntry) as CachedLyrics;
    if (!Array.isArray(entry.lines)) return null;

    const lines = entry.lines.filter(
      (line) => Number.isFinite(line.timeMs) && typeof line.text === "string" && line.text
    );

    return lines.length > 0 ? lines : null;
  } catch {
    return null;
  }
}

function writeCachedLyrics(query: LyricsQuery, lines: LyricLine[]) {
  if (lines.length === 0) return;

  const key = getLyricsCacheKey(query);
  const cachedAt = Date.now();
  const entry: CachedLyrics = { cachedAt, lines };

  try {
    localStorage.setItem(key, JSON.stringify(entry));
    updateLyricsCacheIndex(key, cachedAt);
  } catch {
    // Cache failures should never block live lyrics.
  }
}

function updateLyricsCacheIndex(key: string, cachedAt: number) {
  const rawIndex = safeLocalStorageGet(lyricsCacheIndexKey);
  const index = parseLyricsCacheIndex(rawIndex)
    .filter((item) => item.key !== key)
    .concat({ key, cachedAt })
    .sort((a, b) => b.cachedAt - a.cachedAt);

  for (const staleItem of index.slice(maxCachedLyricsEntries)) {
    localStorage.removeItem(staleItem.key);
  }

  localStorage.setItem(lyricsCacheIndexKey, JSON.stringify(index.slice(0, maxCachedLyricsEntries)));
}

function parseLyricsCacheIndex(rawIndex: string | null): CachedLyricsIndexItem[] {
  if (!rawIndex) return [];

  try {
    const index = JSON.parse(rawIndex) as CachedLyricsIndexItem[];

    return Array.isArray(index)
      ? index.filter((item) => typeof item.key === "string" && Number.isFinite(item.cachedAt))
      : [];
  } catch {
    return [];
  }
}

function getLyricsCacheKey(query: LyricsQuery) {
  const durationSeconds = Math.round(query.durationMs / 1000);
  const normalizedQuery = [
    normalizeCachePart(query.title),
    normalizeCachePart(query.artist),
    String(durationSeconds)
  ].join("|");

  return `${lyricsCachePrefix}${encodeURIComponent(normalizedQuery)}`;
}

function normalizeCachePart(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeLocalStorageGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
