import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  parseWindowsSpotifyPlayback,
  windowsSpotifyAudioSource,
  windowsSpotifyHelperScript
} from "../dist-electron/windowsSpotify.js";

test("normalizes a valid Windows media-session response", () => {
  assert.deepEqual(parseWindowsSpotifyPlayback({
    title: "Track",
    artist: "Artist",
    album: "Album",
    progress_ms: 1234.6,
    duration_ms: 9876.4,
    is_playing: true
  }), {
    title: "Track",
    artist: "Artist",
    album: "Album",
    progress_ms: 1235,
    duration_ms: 9876,
    is_playing: true
  });
});

test("fills missing artist and album labels", () => {
  const playback = parseWindowsSpotifyPlayback({
    title: "Track",
    artist: "",
    album: "",
    progress_ms: -25,
    duration_ms: -1,
    is_playing: false
  });
  assert.equal(playback?.artist, "Unknown artist");
  assert.equal(playback?.album, "Unknown album");
  assert.equal(playback?.progress_ms, 0);
  assert.equal(playback?.duration_ms, 0);
});

test("rejects empty, malformed, and non-finite playback responses", () => {
  assert.equal(parseWindowsSpotifyPlayback(null), null);
  assert.equal(parseWindowsSpotifyPlayback([]), null);
  assert.equal(parseWindowsSpotifyPlayback({ title: "" }), null);
  assert.equal(parseWindowsSpotifyPlayback({
    title: "Track",
    artist: "Artist",
    album: "Album",
    progress_ms: Number.NaN,
    duration_ms: 1000,
    is_playing: true
  }), null);
});

test("Windows PowerShell accepts the media helper syntax", {
  skip: process.platform !== "win32"
}, () => {
  const result = spawnSync("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "[void][scriptblock]::Create($env:FLOATLYRICS_TEST_HELPER)"
  ], {
    encoding: "utf8",
    env: { ...process.env, FLOATLYRICS_TEST_HELPER: windowsSpotifyHelperScript }
  });

  assert.equal(result.status, 0, result.stderr);
});

test("Windows PowerShell compiles the Spotify audio-session helper", {
  skip: process.platform !== "win32"
}, () => {
  const result = spawnSync("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Add-Type -TypeDefinition $env:FLOATLYRICS_TEST_AUDIO -Language CSharp"
  ], {
    encoding: "utf8",
    env: { ...process.env, FLOATLYRICS_TEST_AUDIO: windowsSpotifyAudioSource }
  });

  assert.equal(result.status, 0, result.stderr);
});

test("Windows helper stays within the environment-variable transport limit", () => {
  assert.ok(windowsSpotifyHelperScript.length < 30_000);
});
