export type ThemePresetId =
  | "midnight"
  | "light"
  | "pink"
  | "blue"
  | "purple"
  | "green";

export type ThemeId = ThemePresetId | "custom";

export type ThemeSettings = {
  id: ThemeId;
  text: string;
  background: string;
  accent: string;
  backgroundOpacity: number;
};

export type ThemePreset = ThemeSettings & {
  id: ThemePresetId;
  name: string;
};

export const themeStorageKey = "floatlyrics.theme.v1";

export const themePresets: ThemePreset[] = [
  {
    id: "midnight",
    name: "Midnight",
    text: "#EDEEF0",
    background: "#18191B",
    accent: "#FFFFFF",
    backgroundOpacity: 82
  },
  {
    id: "light",
    name: "Light",
    text: "#1C2024",
    background: "#F9F9FB",
    accent: "#0090FF",
    backgroundOpacity: 92
  },
  {
    id: "pink",
    name: "Pink",
    text: "#FF8DCC",
    background: "#21121D",
    accent: "#D6409F",
    backgroundOpacity: 86
  },
  {
    id: "blue",
    name: "Blue",
    text: "#70B8FF",
    background: "#111927",
    accent: "#0090FF",
    backgroundOpacity: 86
  },
  {
    id: "purple",
    name: "Purple",
    text: "#D19DFF",
    background: "#1E1523",
    accent: "#8E4EC6",
    backgroundOpacity: 86
  },
  {
    id: "green",
    name: "Green",
    text: "#1ED760",
    background: "#0B1F14",
    accent: "#1ED760",
    backgroundOpacity: 90
  }
];

function toThemeSettings(theme: ThemePreset): ThemeSettings {
  return {
    id: theme.id,
    text: theme.text,
    background: theme.background,
    accent: theme.accent,
    backgroundOpacity: theme.backgroundOpacity
  };
}

export const defaultTheme: ThemeSettings = toThemeSettings(themePresets[0]);

const hexColorPattern = /^#[0-9a-f]{6}$/i;

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && hexColorPattern.test(value);
}

function normalizeOpacity(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : null;
}

export function getThemePreset(id: ThemePresetId) {
  return themePresets.find((preset) => preset.id === id) ?? themePresets[0];
}

export function sanitizeThemeSettings(value: unknown): ThemeSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...defaultTheme };

  const candidate = value as Record<string, unknown>;
  const preset = themePresets.find((theme) => theme.id === candidate.id);
  if (preset) return toThemeSettings(preset);

  const opacity = normalizeOpacity(candidate.backgroundOpacity);
  if (
    candidate.id !== "custom" ||
    !isHexColor(candidate.text) ||
    !isHexColor(candidate.background) ||
    !isHexColor(candidate.accent) ||
    opacity === null
  ) return { ...defaultTheme };

  return {
    id: "custom",
    text: candidate.text.toUpperCase(),
    background: candidate.background.toUpperCase(),
    accent: candidate.accent.toUpperCase(),
    backgroundOpacity: opacity
  };
}

function hexToRgb(color: string) {
  const value = color.slice(1);
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16)
  ];
}

function relativeLuminance(color: string) {
  const channels = hexToRgb(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function getContrastRatio(foreground: string, background: string) {
  if (!isHexColor(foreground) || !isHexColor(background)) return 1;
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getReadableTextColor(background: string) {
  return getContrastRatio("#FFFFFF", background) >= getContrastRatio("#000000", background)
    ? "#FFFFFF"
    : "#000000";
}

export function improveThemeContrast(theme: ThemeSettings): ThemeSettings {
  return {
    ...theme,
    id: "custom",
    text: getReadableTextColor(theme.background),
    backgroundOpacity: Math.max(45, theme.backgroundOpacity)
  };
}
