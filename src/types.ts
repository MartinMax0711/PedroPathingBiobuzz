// Modified for the BIOBUZZ Edition (FTC 2026-2027); based on Pedro-Pathing/Visualizer f54357e.
// Exported type definitions for use in Svelte and TS modules

export interface BasePoint {
  x: number;
  y: number;
  locked?: boolean;
}

export type Point = BasePoint &
  (
    | {
        heading: "linear";
        startDeg: number;
        endDeg: number;
        degrees?: never;
        reverse?: never;
      }
    | {
        heading: "constant";
        degrees: number;
        startDeg?: never;
        endDeg?: never;
        reverse?: never;
      }
    | {
        heading: "tangential";
        degrees?: never;
        startDeg?: never;
        endDeg?: never;
        reverse: boolean;
      }
  );

export type ControlPoint = BasePoint;


export interface WaitSegment {
  name?: string;
  durationMs: number;
  position?: "before" | "after";
}

export interface Line {
  id?: string;
  endPoint: Point;
  controlPoints: ControlPoint[];
  color: string;
  name?: string;
  locked?: boolean;
  waitBefore?: WaitSegment;
  waitAfter?: WaitSegment;
  waitBeforeMs?: number;
  waitAfterMs?: number;
  waitBeforeName?: string;
  waitAfterName?: string;
}

export type SequencePathItem = {
  kind: "path";
  lineId: string;
};

export type SequenceWaitItem = {
  kind: "wait";
  id: string;
  name: string;
  durationMs: number;
  locked?: boolean;
};

export type SequenceItem = SequencePathItem | SequenceWaitItem;

export interface PathChain {
  id: string;
  name: string;
  color: string;
  lineIds: string[];
}

export interface Settings {
  xVelocity: number;
  yVelocity: number;
  aVelocity: number;
  kFriction: number;
  rWidth: number;
  rHeight: number;
  safetyMargin: number;
  maxVelocity: number; // inches/sec
  maxAcceleration: number; // inches/sec²
  maxDeceleration?: number; // inches/sec²
  fieldMap: string;
  customFieldImage?: string; // Base64 data URL for custom field image
  robotImage?: string;
  theme: "light" | "dark" | "auto";
  showGhostPaths?: boolean; // Show collision overlays via ghost paths
  showOnionLayers?: boolean; // Show robot body at intervals along the path
  onionLayerSpacing?: number; // Distance in inches between onion layers
  onionColor?: string; // Color for onion-layer colliders
  onionNextPointOnly?: boolean; // When true, onion layers show only for the next point (UI-only for now)
  showHeadingArrow?: boolean; // Show arrow indicating robot heading direction
  headingArrowLength?: number; // Length of the heading arrow in pixels
  headingArrowColor?: string; // Color of the heading arrow
  headingArrowThickness?: number; // Thickness/stroke width of the heading arrow
  pathOpacity?: number; // Opacity of path lines (0-1)
  // BIOBUZZ field overlay (drawn above the field image, below paths)
  showTileLabels?: boolean; // A–F / 1–6 tile coordinates
  showFieldLabels?: boolean; // AUDIENCE / RED / BLUE wall labels
  showZoneLabels?: boolean; // LOADING ZONE, GARDEN, FLOWER, HIVE callouts
  showAprilTags?: boolean; // AprilTag cluster IDs under each CELL
  showStartCheck?: boolean; // Outline the start pose green/red using the G304 check
  autoPeriodSeconds?: number; // AUTO length used for the timer warnings (BIOBUZZ: 30 s)
}

export interface Shape {
  id: string;
  name?: string;
  vertices: BasePoint[];
  color: string;
  fillColor: string;
  locked?: boolean; // Fixed field element: vertices cannot be dragged or edited
}

export type TimelineEventType = "travel" | "wait";

export interface TimelineEvent {
  type: TimelineEventType;
  duration: number;
  startTime: number;
  endTime: number;
  name?: string;
  waitPosition?: "before" | "after";
  lineIndex?: number; // for travel
  startHeading?: number;
  targetHeading?: number;
  atPoint?: BasePoint;
}

export interface TimePrediction {
  totalTime: number;
  segmentTimes: number[];
  totalDistance: number;
  timeline: TimelineEvent[];
}

export interface DirectorySettings {
  autoPathsDirectory: string;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: Date;
  error?: string;
}
