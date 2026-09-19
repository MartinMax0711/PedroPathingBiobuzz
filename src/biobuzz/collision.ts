import type { BasePoint, Line, Point, Shape } from "../types";
import { getCurvePoint, shortestRotation } from "../utils/math";
import { robotFootprint } from "./field";

/** One robot footprint sample that overlaps an obstacle. */
export interface CollisionSample {
  lineIndex: number;
  lineId: string;
  shapeId: string;
  shapeName: string;
  /** Curve parameter within the path (0..1). */
  t: number;
  x: number;
  y: number;
  headingDeg: number;
  corners: BasePoint[];
}

/** Collisions of one path with one obstacle. */
export interface PathCollision {
  lineIndex: number;
  lineId: string;
  shapeId: string;
  shapeName: string;
  /** First and last curve parameter where the robot overlaps the obstacle. */
  tStart: number;
  tEnd: number;
  samples: CollisionSample[];
}

/** Robot heading (degrees) at curve parameter t, as the simulator animates it. */
export function headingAt(
  line: Line,
  curve: BasePoint[],
  t: number,
): number {
  const ep = line.endPoint;
  if (ep.heading === "linear") return shortestRotation(ep.startDeg, ep.endDeg, t);
  if (ep.heading === "constant") return ep.degrees;
  const dt = 0.001;
  const a = getCurvePoint(Math.max(0, t - dt), curve);
  const b = getCurvePoint(Math.min(1, t + dt), curve);
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return ep.reverse ? deg + 180 : deg;
}

/**
 * Sweep the robot footprint along every path (in draw order) and report where
 * it overlaps an obstacle polygon. `length` runs along the heading (the
 * "robot width" setting), `width` across it. Samples every `spacing` inches.
 */
export function findPathCollisions(
  startPoint: Point,
  lines: Line[],
  shapes: Shape[],
  length: number,
  width: number,
  spacing = 1,
): PathCollision[] {
  const obstacles = shapes.filter((s) => s.vertices.length >= 3);
  if (!lines.length || !obstacles.length) return [];
  const bounds = obstacles.map((s) => bbox(s.vertices));
  const reach = Math.hypot(length, width) / 2;
  const results = new Map<string, PathCollision>();

  let prev: BasePoint = startPoint;
  lines.forEach((line, lineIndex) => {
    const curve = [prev, ...line.controlPoints, line.endPoint];
    prev = line.endPoint;
    const lineId = line.id ?? `line-${lineIndex}`;

    // Arc length → sample count.
    let arc = 0;
    let last = curve[0];
    for (let i = 1; i <= 50; i++) {
      const p = getCurvePoint(i / 50, curve);
      arc += Math.hypot(p.x - last.x, p.y - last.y);
      last = p;
    }
    const steps = Math.max(2, Math.ceil(arc / spacing));

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const pos = getCurvePoint(t, curve);
      let heading: number | null = null;
      let corners: BasePoint[] | null = null;
      obstacles.forEach((shape, si) => {
        const b = bounds[si];
        if (
          pos.x + reach < b.minX ||
          pos.x - reach > b.maxX ||
          pos.y + reach < b.minY ||
          pos.y - reach > b.maxY
        ) {
          return;
        }
        heading ??= headingAt(line, curve, t);
        corners ??= robotFootprint(pos.x, pos.y, heading, length, width);
        if (!polygonsIntersect(corners, shape.vertices)) return;
        const key = `${lineId}::${shape.id}`;
        let hit = results.get(key);
        if (!hit) {
          hit = {
            lineIndex,
            lineId,
            shapeId: shape.id,
            shapeName: shape.name || "Obstacle",
            tStart: t,
            tEnd: t,
            samples: [],
          };
          results.set(key, hit);
        }
        hit.tEnd = t;
        hit.samples.push({
          lineIndex,
          lineId,
          shapeId: shape.id,
          shapeName: hit.shapeName,
          t,
          x: pos.x,
          y: pos.y,
          headingDeg: heading,
          corners,
        });
      });
    }
  });
  return [...results.values()];
}

function bbox(poly: BasePoint[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function inside(p: BasePoint, poly: BasePoint[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      c = !c;
    }
  }
  return c;
}

function segmentsCross(p1: BasePoint, p2: BasePoint, q1: BasePoint, q2: BasePoint): boolean {
  const d = (a: BasePoint, b: BasePoint, c: BasePoint) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(q1, q2, p1);
  const d2 = d(q1, q2, p2);
  const d3 = d(p1, p2, q1);
  const d4 = d(p1, p2, q2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Overlap test that also handles concave (user-drawn) obstacle polygons. */
export function polygonsIntersect(a: BasePoint[], b: BasePoint[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      if (segmentsCross(a1, a2, b[j], b[(j + 1) % b.length])) return true;
    }
  }
  return inside(a[0], b) || inside(b[0], a);
}
