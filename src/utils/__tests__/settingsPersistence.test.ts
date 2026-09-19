import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../config/defaults";
import {
  isLocalOnlySetting,
  mergeFileSettings,
  projectSettings,
} from "../settingsPersistence";
import type { Settings } from "../../types";

const local: Settings = {
  ...DEFAULT_SETTINGS,
  theme: "dark",
  fieldMap: "biobuzz.svg",
  showZoneLabels: true,
  showOnionLayers: true,
  autoPeriodSeconds: 30,
  rWidth: 16,
  rHeight: 16,
};

describe("mergeFileSettings", () => {
  it("takes robot size and motion tuning from a file", () => {
    const merged = mergeFileSettings(local, { rWidth: 17, rHeight: 15, xVelocity: 60 });
    expect(merged.rWidth).toBe(17);
    expect(merged.rHeight).toBe(15);
    expect(merged.xVelocity).toBe(60);
  });

  it("keeps this device's display preferences", () => {
    const merged = mergeFileSettings(local, {
      theme: "light",
      fieldMap: "decode.webp",
      showZoneLabels: false,
      showOnionLayers: false,
      autoPeriodSeconds: 150,
      unknownKey: 1,
    });
    expect(merged.theme).toBe("dark");
    expect(merged.fieldMap).toBe("biobuzz.svg");
    expect(merged.showZoneLabels).toBe(true);
    expect(merged.showOnionLayers).toBe(true);
    expect(merged.autoPeriodSeconds).toBe(30);
    expect("unknownKey" in merged).toBe(false);
  });

  it("ignores missing or malformed file settings", () => {
    expect(mergeFileSettings(local, undefined)).toBe(local);
    expect(mergeFileSettings(local, "nope")).toBe(local);
    expect(mergeFileSettings(local, { rWidth: null }).rWidth).toBe(16);
  });
});

describe("projectSettings", () => {
  it("keeps only project-level keys", () => {
    const project = projectSettings(local);
    expect(project.rWidth).toBe(16);
    expect(project.maxVelocity).toBe(DEFAULT_SETTINGS.maxVelocity);
    expect(Object.keys(project).some(isLocalOnlySetting)).toBe(false);
  });

  it("round-trips through mergeFileSettings without touching display keys (undo)", () => {
    const before = projectSettings({ ...local, rWidth: 14 });
    const now: Settings = { ...local, theme: "light", showZoneLabels: false, rWidth: 18 };
    const undone = mergeFileSettings(now, before);
    expect(undone.rWidth).toBe(14);
    expect(undone.theme).toBe("light");
    expect(undone.showZoneLabels).toBe(false);
  });
});
