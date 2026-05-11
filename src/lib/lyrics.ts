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

export async function getLyrics(query: LyricsQuery): Promise<LyricLine[]> {
  const params = new URLSearchParams({
    track_name: query.title,
    artist_name: query.artist,
    duration: String(Math.round(query.durationMs / 1000))
  });

  const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
  if (response.status === 404) return [];

  if (!response.ok) {
    throw new Error(`Lyrics lookup failed (${response.status}).`);
  }

  const data = (await response.json()) as LrcLibResponse;
  if (data.instrumental) return [];

  if (data.syncedLyrics) {
    return parseLrc(data.syncedLyrics);
  }

  if (data.plainLyrics) {
    return data.plainLyrics
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text, index) => ({ timeMs: index * 3500, text }));
  }

  return [];
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
