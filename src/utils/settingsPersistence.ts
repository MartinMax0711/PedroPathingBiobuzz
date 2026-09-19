// Modified for the BIOBUZZ Edition (FTC 2026-2027); based on Pedro-Pathing/Visualizer f54357e.
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Settings } from "../types";

// Versioning for settings schema. 2.x = BIOBUZZ edition.
const SETTINGS_VERSION = "2.0.0";

interface StoredSettings {
  version: string;
  settings: Settings;
  lastUpdated: string;
}




// Namespaced so this edition never shares settings with another Pedro Pathing
// visualizer deployed on the same origin (e.g. <user>.github.io).
const SETTINGS_STORAGE_KEY = "biobuzz_pp_settings";

/** Field maps from earlier seasons that should not survive an upgrade. */
const LEGACY_DEFAULT_FIELD_MAPS = ["decode.webp", "intothedeep.webp", "centerstage.webp"];

function migrateSettings(stored: Partial<StoredSettings>): Settings {
  const defaults = { ...DEFAULT_SETTINGS };

  if (!stored.settings) {
    return defaults;
  }

  // Always merge with defaults to ensure new settings are included
  // and removed settings are not persisted
  const migrated: Settings = { ...defaults };

  // Copy only the properties that exist in both objects
  Object.keys(stored.settings).forEach((key) => {
    if (key in migrated) {
      // @ts-ignore - We know the key exists in Settings
      migrated[key] = stored.settings[key];
    }
  });

  // Legacy support: older builds stored custom field as "custom||<data-url>".
  if (
    typeof migrated.fieldMap === "string" &&
    migrated.fieldMap.startsWith("custom||")
  ) {
    const [, embeddedImage = ""] = migrated.fieldMap.split("||");
    migrated.fieldMap = "custom";
    if (embeddedImage && !migrated.customFieldImage) {
      migrated.customFieldImage = embeddedImage;
    }
  }

  if (!migrated.fieldMap) {
    migrated.fieldMap = defaults.fieldMap;
  }

  // Settings saved before the BIOBUZZ edition default to this season's field.
  if (
    stored.version !== SETTINGS_VERSION &&
    LEGACY_DEFAULT_FIELD_MAPS.includes(migrated.fieldMap)
  ) {
    migrated.fieldMap = defaults.fieldMap;
  }

  return migrated;
}

// Load settings from localStorage
export async function loadSettings(): Promise<Settings> {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    const stored: StoredSettings = JSON.parse(raw);
    return migrateSettings(stored);
  } catch (error) {
    return { ...DEFAULT_SETTINGS };
  }
}

// Save settings to localStorage
export async function saveSettings(settings: Settings): Promise<boolean> {
  try {
    const stored: StoredSettings = {
      version: SETTINGS_VERSION,
      settings: { ...settings },
      lastUpdated: new Date().toISOString(),
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(stored));
    return true;
  } catch (error) {
    return false;
  }
}

// Reset settings to defaults
export async function resetSettings(): Promise<Settings> {
  const defaults = { ...DEFAULT_SETTINGS };
  await saveSettings(defaults);
  return defaults;
}

// Check if settings exist in localStorage
export async function settingsFileExists(): Promise<boolean> {
  return !!localStorage.getItem(SETTINGS_STORAGE_KEY);
}

/**
 * Settings embedded in a loaded .pp file only carry robot and motion tuning;
 * display preferences (field map, theme, robot image, drawing aids, overlays,
 * the AUTO timer) stay local. Undo/redo uses the same split, so it never
 * reverts a display preference.
 */
const LOCAL_ONLY_SETTING_KEYS: (keyof Settings)[] = [
  "fieldMap",
  "customFieldImage",
  "robotImage",
  "theme",
  "showGhostPaths",
  "showOnionLayers",
  "onionLayerSpacing",
  "onionColor",
  "onionNextPointOnly",
  "showHeadingArrow",
  "headingArrowLength",
  "headingArrowColor",
  "headingArrowThickness",
  "pathOpacity",
  "showTileLabels",
  "showFieldLabels",
  "showZoneLabels",
  "showAprilTags",
  "showStartCheck",
  "autoPeriodSeconds",
];

/** True for display-only keys that stay on this device (see above). */
export function isLocalOnlySetting(key: string): boolean {
  return LOCAL_ONLY_SETTING_KEYS.includes(key as keyof Settings);
}

/**
 * Only the project-level part of `settings` (robot size, motion tuning):
 * what undo history tracks and what mergeFileSettings() would take from it.
 */
export function projectSettings(settings: Settings): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (!settings) return out;
  for (const [key, value] of Object.entries(settings)) {
    if (!(key in DEFAULT_SETTINGS) || isLocalOnlySetting(key)) continue;
    // @ts-ignore - key is a known Settings key
    out[key] = value;
  }
  return out;
}

export function mergeFileSettings(current: Settings, fromFile: unknown): Settings {
  if (!fromFile || typeof fromFile !== "object") return current;
  const next: Settings = { ...current };
  for (const [key, value] of Object.entries(fromFile as Record<string, unknown>)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    if (isLocalOnlySetting(key)) continue;
    if (value === undefined || value === null) continue;
    // @ts-ignore - key is a known Settings key
    next[key] = value;
  }
  return next;
}
