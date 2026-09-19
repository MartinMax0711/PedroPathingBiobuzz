// Modified for the BIOBUZZ Edition (FTC 2026-2027); based on Pedro-Pathing/Visualizer f54357e.
import type { Point, Line, Shape, Settings } from "../types";
import { getBiobuzzObstacles, getStartPresets } from "../biobuzz/field";

/**
 * Default robot dimensions
 */
export const DEFAULT_ROBOT_WIDTH = 16;
export const DEFAULT_ROBOT_HEIGHT = 16;

/**
 * Default canvas drawing settings
 */
export const POINT_RADIUS = 1.15;
/** Colour of the default path and of the default "Main Chain". */
export const DEFAULT_PATH_COLOR = "#ffc516";
export const LINE_WIDTH = 0.57;
export const FIELD_SIZE = 141.5;

/**
 * Available field maps
 */
export const AVAILABLE_FIELD_MAPS = [
  { value: "biobuzz.svg", label: "BIOBUZZ Field (2026-2027)" },
  { value: "decode.webp", label: "DECODE Field (2025-2026)" },
  { value: "intothedeep.webp", label: "Into The Deep Field (2024-2025)" },
  { value: "centerstage.webp", label: "Centerstage (2023-2024)" },
  { value: "custom", label: "Custom Field (Upload)" },
];

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: Settings = {
  xVelocity: 75,
  yVelocity: 65,
  aVelocity: Math.PI,
  kFriction: 0.1,
  rWidth: DEFAULT_ROBOT_WIDTH,
  rHeight: DEFAULT_ROBOT_HEIGHT,
  safetyMargin: 1,
  maxVelocity: 40,
  maxAcceleration: 30,
  maxDeceleration: 30,
  fieldMap: "biobuzz.svg",
  customFieldImage: "",
  robotImage: "/robot.png",
  theme: "light",
  showGhostPaths: false,
  showOnionLayers: false,
  onionLayerSpacing: 3, // inches between each robot body trace
  onionColor: "#dc2626",
  onionNextPointOnly: false,
  showHeadingArrow: false,
  headingArrowLength: 50,
  headingArrowColor: "#ffffff",
  headingArrowThickness: 2,
  pathOpacity: 1,
  showTileLabels: true,
  showFieldLabels: true,
  showZoneLabels: false,
  showAprilTags: false,
  showStartCheck: true,
  autoPeriodSeconds: 30,
};

/** Default BIOBUZZ start: red alliance, against the audience wall by the HIVE. */
const DEFAULT_START_PRESET_ID = "red-audience-center";
/** Length (in) of the default Path 1, driven straight ahead of the start. */
export const DEFAULT_DRIVE_DISTANCE = 22;

/**
 * `length` runs along the heading (settings.rWidth) and `width` across it
 * (settings.rHeight), so the default start stays G304-legal for any robot size.
 */
function defaultStartPreset(length = DEFAULT_ROBOT_WIDTH, width = DEFAULT_ROBOT_HEIGHT) {
  const presets = getStartPresets(length || DEFAULT_ROBOT_WIDTH, width || DEFAULT_ROBOT_HEIGHT);
  return presets.find((p) => p.id === DEFAULT_START_PRESET_ID) ?? presets[0];
}

/**
 * Get default starting point
 */
export function getDefaultStartPoint(
  length: number = DEFAULT_ROBOT_WIDTH,
  width: number = DEFAULT_ROBOT_HEIGHT,
): Point {
  const preset = defaultStartPreset(length, width);
  return {
    x: preset.x,
    y: preset.y,
    heading: "linear",
    startDeg: preset.headingDeg,
    endDeg: preset.headingDeg,
    locked: false,
  };
}

/**
 * Get default initial path lines
 */
export function getDefaultLines(
  length: number = DEFAULT_ROBOT_WIDTH,
  width: number = DEFAULT_ROBOT_HEIGHT,
): Line[] {
  const preset = defaultStartPreset(length, width);
  const h = (preset.headingDeg * Math.PI) / 180;
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  return [
    {
      id: `line-${Math.random().toString(36).slice(2)}`,
      name: "Path 1",
      // Drive DEFAULT_DRIVE_DISTANCE straight ahead, off the wall to a launch
      // position below the red upward CELL (clear of the HIVE legs). Start
      // presets move this path along with the start (biobuzz/transform.ts).
      endPoint: {
        x: round3(preset.x + DEFAULT_DRIVE_DISTANCE * Math.cos(h)),
        y: round3(preset.y + DEFAULT_DRIVE_DISTANCE * Math.sin(h)),
        heading: "linear",
        startDeg: preset.headingDeg,
        endDeg: preset.headingDeg,
      },
      controlPoints: [],
      color: DEFAULT_PATH_COLOR,
      locked: false,
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    },
  ];
}

/**
 * Get default shapes (field obstacles): the BIOBUZZ HIVE frame (two foot bars
 * plus the four inward-leaning A-frame legs, modelled up to the 18 in R102
 * starting height) and the four FLOWERS. The HIVES hang >= 30.6 in above the
 * tiles, so robots can drive under them, except near the four legs.
 */
export function getDefaultShapes(): Shape[] {
  return getBiobuzzObstacles();
}
