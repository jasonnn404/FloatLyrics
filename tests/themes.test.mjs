import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  defaultTheme,
  getContrastRatio,
  improveThemeContrast,
  sanitizeThemeSettings,
  themePresets
} = require("../.test-build/themes.js");

test("falls back to Midnight for missing and corrupted theme settings", () => {
  assert.deepEqual(sanitizeThemeSettings(null), defaultTheme);
  assert.deepEqual(sanitizeThemeSettings({ id: "custom", text: "red" }), defaultTheme);
  assert.deepEqual(sanitizeThemeSettings({ id: "unknown" }), defaultTheme);
});

test("restores canonical preset values instead of altered stored colors", () => {
  assert.deepEqual(sanitizeThemeSettings({
    id: "blue",
    text: "#000000",
    background: "#FFFFFF",
    accent: "#000000",
    backgroundOpacity: 1
  }), {
    id: "blue",
    text: "#70B8FF",
    background: "#111927",
    accent: "#0090FF",
    backgroundOpacity: 86
  });
});

test("normalizes valid custom settings and clamps background opacity", () => {
  assert.deepEqual(sanitizeThemeSettings({
    id: "custom",
    text: "#aabbcc",
    background: "#112233",
    accent: "#abcdef",
    backgroundOpacity: 130.2
  }), {
    id: "custom",
    text: "#AABBCC",
    background: "#112233",
    accent: "#ABCDEF",
    backgroundOpacity: 100
  });
});

test("contrast helper identifies and repairs unreadable text", () => {
  const lowContrast = {
    id: "custom",
    text: "#777777",
    background: "#777777",
    accent: "#FFFFFF",
    backgroundOpacity: 80
  };
  assert.equal(getContrastRatio(lowContrast.text, lowContrast.background), 1);
  const improved = improveThemeContrast(lowContrast);
  assert.ok(getContrastRatio(improved.text, improved.background) >= 4.5);
});

test("every built-in preset has readable lyric contrast", () => {
  for (const preset of themePresets) {
    assert.ok(
      getContrastRatio(preset.text, preset.background) >= 4.5,
      `${preset.name} should meet the normal-text contrast target`
    );
  }
});
