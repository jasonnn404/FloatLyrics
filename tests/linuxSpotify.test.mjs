import assert from "node:assert/strict";
import test from "node:test";
import {
  parseLinuxSpotifyVolume,
  serializeLinuxSpotifyVolume
} from "../dist-electron/linuxSpotify.js";

test("normalizes Linux MPRIS volume values", () => {
  assert.equal(parseLinuxSpotifyVolume(0), 0);
  assert.equal(parseLinuxSpotifyVolume(0.505), 51);
  assert.equal(parseLinuxSpotifyVolume(1), 100);
  assert.equal(parseLinuxSpotifyVolume(1.5), 100);
  assert.equal(parseLinuxSpotifyVolume(-0.5), 0);
  assert.equal(parseLinuxSpotifyVolume(Number.NaN), null);
});

test("serializes and clamps Linux MPRIS volume values", () => {
  assert.equal(serializeLinuxSpotifyVolume(0), 0);
  assert.equal(serializeLinuxSpotifyVolume(50.4), 0.5);
  assert.equal(serializeLinuxSpotifyVolume(100), 1);
  assert.equal(serializeLinuxSpotifyVolume(150), 1);
  assert.equal(serializeLinuxSpotifyVolume(-20), 0);
  assert.equal(serializeLinuxSpotifyVolume(Number.POSITIVE_INFINITY), null);
});
