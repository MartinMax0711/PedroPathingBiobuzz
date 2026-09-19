// Modified for the BIOBUZZ Edition (FTC 2026-2027); based on Pedro-Pathing/Visualizer f54357e.
import type { Shape } from "../types";
import { getBiobuzzObstacles } from "../biobuzz/field";

/**
 * Shape creation factory functions
 */

/** Anything that tells the factories which obstacles already exist. */
type ExistingShapes = Shape[] | number;

/**
 * Build an id `${prefix}-${n}` that no existing shape uses. Passing the shape
 * list (rather than just its length) avoids duplicate ids after deletions.
 */
export function uniqueShapeId(prefix: string, existing: ExistingShapes): string {
  const taken = new Set(Array.isArray(existing) ? existing.map((s) => s.id) : []);
  let n = (Array.isArray(existing) ? existing.length : existing) + 1;
  while (taken.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

/** Number of obstacles already present (for default names). */
function countOf(existing: ExistingShapes): number {
  return Array.isArray(existing) ? existing.length : existing;
}

/**
 * Create a triangle shape at default position
 */
export function createTriangle(existing: ExistingShapes): Shape {
  return {
    id: uniqueShapeId("triangle", existing),
    name: `Obstacle ${countOf(existing) + 1}`,
    vertices: [
      { x: 60, y: 60 },
      { x: 84, y: 60 },
      { x: 72, y: 84 },
    ],
    color: "#dc2626",
    fillColor: "#ff6b6b",
  };
}

/**
 * Create a rectangle shape at default position
 */
export function createRectangle(existing: ExistingShapes): Shape {
  return {
    id: uniqueShapeId("rectangle", existing),
    name: `Obstacle ${countOf(existing) + 1}`,
    vertices: [
      { x: 30, y: 30 },
      { x: 60, y: 30 },
      { x: 60, y: 50 },
      { x: 30, y: 50 },
    ],
    color: "#dc2626",
    fillColor: "#ff6b6b",
  };
}

/**
 * Create an N-sided regular polygon (n-gon) shape
 */
export function createNGon(sides: number, existing: ExistingShapes): Shape {
  const centerX = 45;
  const centerY = 45;
  const radius = 15;
  const vertices = [];

  for (let i = 0; i < sides; i++) {
    const angle = (i * 2 * Math.PI) / sides;
    vertices.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  }

  return {
    id: uniqueShapeId(`${sides}-gon`, existing),
    name: `Obstacle ${countOf(existing) + 1}`,
    vertices,
    color: "#dc2626",
    fillColor: "#ff6b6b",
  };
}

// ---------------------------------------------------------------------------
// Obstacle colours and BIOBUZZ grouping (used by the sidebar)
// ---------------------------------------------------------------------------

export interface ObstacleColorChoice {
  label: string;
  /** Outline / polygon colour (what the field draws). */
  color: string;
  /** Vertex handle fill. */
  fill: string;
}

export const OBSTACLE_COLOR_CHOICES: ObstacleColorChoice[] = [
  { label: "Flower", color: "#d97706", fill: "#fbbf24" },
  { label: "HIVE Frame", color: "#52525b", fill: "#a1a1aa" },
  { label: "Red", color: "#dc2626", fill: "#ff6b6b" },
  { label: "Blue", color: "#2563eb", fill: "#60a5fa" },
  { label: "Green", color: "#16a34a", fill: "#86efac" },
  { label: "Purple", color: "#9333ea", fill: "#d8b4fe" },
];

/** Preset matching a shape colour (case-insensitive), if any. */
export function findObstacleColor(color: string | undefined): ObstacleColorChoice | undefined {
  const c = (color ?? "").trim().toLowerCase();
  return OBSTACLE_COLOR_CHOICES.find((choice) => choice.color === c);
}

export type ObstacleKind = "hive-frame" | "flower" | "custom";

/** Ids of the four inward-leaning HIVE A-frame legs ("hive-leg-red-audience" …). */
const HIVE_LEG_ID = /^hive-leg-(red|blue)-(audience|rear)$/;

/**
 * Classify an obstacle by its id (BIOBUZZ field elements use fixed ids). The
 * HIVE foot bars ("hive-frame-*") and legs ("hive-leg-*") are both the HIVE frame.
 */
export function obstacleKind(shape: Pick<Shape, "id">): ObstacleKind {
  const id = shape.id ?? "";
  if (id.startsWith("hive-frame") || HIVE_LEG_ID.test(id)) return "hive-frame";
  if (id.startsWith("flower-")) return "flower";
  return "custom";
}

/** Ids of the fixed BIOBUZZ field obstacles. */
export function isBiobuzzObstacle(shape: Pick<Shape, "id">): boolean {
  return obstacleKind(shape) !== "custom";
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Short, readable obstacle label for badges ("FLOWER · Red wall",
 * "HIVE frame · Blue side", "HIVE leg · Red side (audience)"); falls back to
 * the obstacle's own name.
 */
export function shortObstacleName(shapeId: string, shapeName?: string): string {
  const kind = obstacleKind({ id: shapeId });
  if (kind === "flower") {
    return `FLOWER · ${capitalize(shapeId.replace(/^flower-/, ""))} wall`;
  }
  const leg = HIVE_LEG_ID.exec(shapeId);
  if (leg) {
    return `HIVE leg · ${capitalize(leg[1])} side (${leg[2]})`;
  }
  if (kind === "hive-frame") {
    return `HIVE frame · ${capitalize(shapeId.replace(/^hive-frame-?/, "") || "centre")} side`;
  }
  return shapeName?.trim() || "Obstacle";
}

/**
 * Bring a saved obstacle list up to the current BIOBUZZ model: projects saved
 * before the HIVE legs were modelled have both foot bars but no legs, so the
 * default legs are inserted right after the rails. Any other list (custom
 * fields, a user who deleted the rails) is returned unchanged.
 */
export function upgradeBiobuzzObstacles(shapes: Shape[]): Shape[] {
  if (!Array.isArray(shapes) || shapes.some((s) => HIVE_LEG_ID.test(s?.id ?? ""))) {
    return shapes;
  }
  const railIdx = ["hive-frame-red", "hive-frame-blue"].map((id) =>
    shapes.findIndex((s) => s?.id === id),
  );
  if (railIdx.some((i) => i < 0)) return shapes;
  const legs = getBiobuzzObstacles().filter((s) => HIVE_LEG_ID.test(s.id));
  const at = Math.max(...railIdx) + 1;
  return [...shapes.slice(0, at), ...legs, ...shapes.slice(at)];
}
