import type { ControlPoint, Line, Point, SequenceItem } from "../types";
import { getLineEndHeading, getLineStartHeading } from "../utils/math";
import { FIELD, normalizeDeg, rotateHeading180, rotatePoint180 } from "./field";

/**
 * Rotate a point's heading parameters by 180°. Tangential heading follows the
 * (rotated) path geometry, so its `reverse` flag stays as it is.
 */
export function rotatePointHeading180(p: Point): Point {
  if (p.heading === "linear") {
    return {
      ...p,
      startDeg: rotateHeading180(p.startDeg),
      endDeg: rotateHeading180(p.endDeg),
    };
  }
  if (p.heading === "constant") {
    return { ...p, degrees: rotateHeading180(p.degrees) };
  }
  return { ...p };
}

/**
 * Convert a path between alliances. BIOBUZZ is 180° rotationally symmetric,
 * so red ↔ blue is (x, y) → (W − x, W − y) with every heading + 180°.
 * Ids, names, colours, lock state, waits and event markers are preserved, so
 * `sequence` and `pathChains` stay valid without changes.
 */
export function rotateProject180(
  startPoint: Point,
  lines: Line[],
): { startPoint: Point; lines: Line[] } {
  return {
    startPoint: rotatePointHeading180(rotatePoint180(startPoint)),
    lines: lines.map((line) => ({
      ...line,
      endPoint: rotatePointHeading180(rotatePoint180(line.endPoint)),
      controlPoints: line.controlPoints.map((cp: ControlPoint) => rotatePoint180(cp)),
    })),
  };
}

/** First path in play order (the sequence decides; falls back to lines[0]). */
export function firstSequencedLine(
  lines: Line[],
  sequence: SequenceItem[] | undefined,
): Line | undefined {
  const first = sequence?.find((s) => s.kind === "path");
  if (first && first.kind === "path") {
    return lines.find((l) => l.id === first.lineId) ?? lines[0];
  }
  return lines[0];
}

/** Longest "drive straight ahead" path that moves along with a new start pose. */
export const FOLLOW_START_MAX_DISTANCE = 48;
/** Sideways error (in) still counted as "straight ahead". */
const STRAIGHT_AHEAD_TOLERANCE = 0.05;

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const sameDeg = (a: number, b: number) => Math.abs(normalizeDeg(a - b)) < 1e-6;

/**
 * Distance to the end of a project's only path when that path drives straight
 * ahead of the start along the robot's start heading (no control points,
 * 0 < d ≤ FOLLOW_START_MAX_DISTANCE, sideways error < 0.05 in); else null.
 */
function straightAheadDistance(
  startPoint: Point,
  lines: Line[],
  sequence: SequenceItem[] | undefined,
): number | null {
  if (lines.length !== 1) return null;
  const line = lines[0];
  if (line.locked || line.endPoint.locked || line.controlPoints.length) return null;
  const h = (startHeadingDeg(startPoint, lines, sequence) * Math.PI) / 180;
  const dx = line.endPoint.x - startPoint.x;
  const dy = line.endPoint.y - startPoint.y;
  const along = dx * Math.cos(h) + dy * Math.sin(h);
  const across = -dx * Math.sin(h) + dy * Math.cos(h);
  if (!(along > 0 && along <= FOLLOW_START_MAX_DISTANCE)) return null;
  if (Math.abs(across) >= STRAIGHT_AHEAD_TOLERANCE) return null;
  return along;
}

/**
 * Move the start to a pose (start presets, the start heading field).
 *
 * - The robot's initial heading comes from the first path's heading, so a
 *   linear first path starts at `headingDeg` (and keeps holding it if it held
 *   its heading before) and a constant one holds it.
 * - A tangential first path would keep following its geometry, which can
 *   leave the robot at an illegal angle against the wall; unless its tangent
 *   already matches `headingDeg`, it becomes linear from `headingDeg` to the
 *   heading it currently ends with.
 * - When the start moves to a new position and the project is a single
 *   straight "drive forward d in" path (like the default one), that path moves
 *   with the start: its end is put d in straight ahead of the new pose, so a
 *   preset never leaves a path running across the field. Heading-only edits
 *   (same position) leave the path where it is.
 */
export function applyStartPose(
  startPoint: Point,
  lines: Line[],
  sequence: SequenceItem[] | undefined,
  pose: { x: number; y: number; headingDeg: number },
): { startPoint: Point; lines: Line[] } {
  const nextStart: Point = {
    x: pose.x,
    y: pose.y,
    heading: "linear",
    startDeg: pose.headingDeg,
    endDeg: pose.headingDeg,
    locked: startPoint.locked,
  };
  const moved =
    Math.abs(pose.x - startPoint.x) > 1e-9 || Math.abs(pose.y - startPoint.y) > 1e-9;
  const ahead = moved ? straightAheadDistance(startPoint, lines, sequence) : null;
  const first = firstSequencedLine(lines, sequence);
  const nextLines = lines.map((line) => {
    if (line !== first) return line;
    let ep = line.endPoint;
    if (ahead !== null) {
      const h = (pose.headingDeg * Math.PI) / 180;
      const x = round3(pose.x + ahead * Math.cos(h));
      const y = round3(pose.y + ahead * Math.sin(h));
      if (x >= 0 && x <= FIELD && y >= 0 && y <= FIELD) ep = { ...ep, x, y };
    }
    if (ep.heading === "linear") {
      // A path that held its heading (start = end) keeps holding the new one.
      const holds = Math.abs(ep.startDeg - ep.endDeg) < 1e-6;
      ep = { ...ep, startDeg: pose.headingDeg, endDeg: holds ? pose.headingDeg : ep.endDeg };
    } else if (ep.heading === "constant") {
      ep = { ...ep, degrees: pose.headingDeg };
    } else {
      const moving = { ...line, endPoint: ep };
      if (!sameDeg(getLineStartHeading(moving, nextStart), pose.headingDeg)) {
        ep = {
          x: ep.x,
          y: ep.y,
          ...(ep.locked !== undefined ? { locked: ep.locked } : {}),
          heading: "linear",
          startDeg: pose.headingDeg,
          endDeg: normalizeDeg(getLineEndHeading(moving, nextStart)),
        };
      }
    }
    return ep === line.endPoint ? line : { ...line, endPoint: ep };
  });
  return { startPoint: nextStart, lines: nextLines };
}

/** Heading (degrees) the robot has at t = 0, as the simulator computes it. */
export function startHeadingDeg(
  startPoint: Point,
  lines: Line[],
  sequence: SequenceItem[] | undefined,
): number {
  const first = firstSequencedLine(lines, sequence);
  if (first) return getLineStartHeading(first, startPoint);
  if (startPoint.heading === "linear") return startPoint.startDeg;
  if (startPoint.heading === "constant") return startPoint.degrees;
  return 0;
}
