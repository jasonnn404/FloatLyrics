import dbus = require("dbus-native");
import { toPlain, type DBusInterface, type MessageBus } from "dbus-native";

const mprisObjectPath = "/org/mpris/MediaPlayer2";
const mprisPlayerInterface = "org.mpris.MediaPlayer2.Player";
const mprisRootInterface = "org.mpris.MediaPlayer2";
const mprisServicePrefix = "org.mpris.MediaPlayer2.";

export type SystemSpotifyPlayback = {
  title: string;
  artist: string;
  album: string;
  progress_ms: number;
  duration_ms: number;
  is_playing: boolean;
};

interface MprisPlayer extends DBusInterface {
  Next(): PromiseLike<void>;
  PlayPause(): PromiseLike<void>;
  Previous(): PromiseLike<void>;
}

let sessionBus: MessageBus | null = null;
let spotifyServiceName: string | null = null;
let spotifyPlayer: (MprisPlayer & DBusInterface) | null = null;

function getSessionBus() {
  if (!sessionBus) {
    sessionBus = dbus.sessionBus({
      timeout: 2500,
      reconnect: {
        retries: Infinity,
        minDelay: 250,
        maxDelay: 5000
      }
    });
  }

  return sessionBus;
}

async function findSpotifyService(bus: MessageBus) {
  const names = await bus.listNames();

  if (spotifyServiceName && names.includes(spotifyServiceName)) {
    return spotifyServiceName;
  }

  const mprisNames = names.filter((name) => name.startsWith(mprisServicePrefix));
  const namedSpotify = mprisNames.find((name) => name.toLowerCase().includes("spotify"));
  if (namedSpotify) {
    spotifyServiceName = namedSpotify;
    return namedSpotify;
  }

  for (const name of mprisNames) {
    try {
      const root = await bus
        .getService(name)
        .getInterface(mprisObjectPath, mprisRootInterface);
      const identity = await root.$readProp("Identity");
      if (typeof identity === "string" && identity.toLowerCase().includes("spotify")) {
        spotifyServiceName = name;
        return name;
      }
    } catch {
      // An MPRIS player may disappear while its identity is being inspected.
    }
  }

  spotifyServiceName = null;
  return null;
}

async function getSpotifyPlayer() {
  if (spotifyPlayer) return spotifyPlayer;

  const bus = getSessionBus();
  const serviceName = await findSpotifyService(bus);
  if (!serviceName) return null;

  spotifyPlayer = await bus
    .getService(serviceName)
    .getInterface<MprisPlayer>(mprisObjectPath, mprisPlayerInterface);
  return spotifyPlayer;
}

function asRecord(value: unknown): Record<string, unknown> {
  const plainValue = toPlain(value);
  return plainValue && typeof plainValue === "object" && !Array.isArray(plainValue)
    ? plainValue as Record<string, unknown>
    : {};
}

function asMilliseconds(value: unknown) {
  const microseconds = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(microseconds) ? Math.max(0, Math.round(microseconds / 1000)) : 0;
}

export async function getLinuxSpotifyPlayback(): Promise<SystemSpotifyPlayback | null> {
  try {
    const player = await getSpotifyPlayer();
    if (!player) return null;

    const properties = asRecord(await player.$readAllProps());
    const playbackStatus = properties.PlaybackStatus;
    if (playbackStatus === "Stopped") return null;

    const metadata = asRecord(properties.Metadata);
    const title = metadata["xesam:title"];
    if (typeof title !== "string" || !title.trim()) return null;

    const artists = metadata["xesam:artist"];
    const artist = Array.isArray(artists)
      ? artists.filter((value): value is string => typeof value === "string").join(", ")
      : typeof artists === "string" ? artists : "";
    const album = metadata["xesam:album"];

    return {
      title,
      artist: artist || "Unknown artist",
      album: typeof album === "string" && album ? album : "Unknown album",
      progress_ms: asMilliseconds(properties.Position),
      duration_ms: asMilliseconds(metadata["mpris:length"]),
      is_playing: playbackStatus === "Playing"
    };
  } catch {
    spotifyServiceName = null;
    spotifyPlayer = null;
    return null;
  }
}

export async function controlLinuxSpotify(
  action: "previous" | "playPause" | "next"
) {
  try {
    const player = await getSpotifyPlayer();
    if (!player) return false;

    if (action === "previous") {
      await player.Previous();
    } else if (action === "next") {
      await player.Next();
    } else {
      await player.PlayPause();
    }

    return true;
  } catch {
    spotifyServiceName = null;
    spotifyPlayer = null;
    return false;
  }
}

export async function closeLinuxSpotify() {
  const bus = sessionBus;
  sessionBus = null;
  spotifyServiceName = null;
  spotifyPlayer = null;
  if (bus) await bus.close();
}
