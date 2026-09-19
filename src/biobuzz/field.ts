/**
 * BIOBUZZ (FIRST Tech Challenge 2026-2027) field model.
 *
 * Single source of truth for every game-element coordinate used by the
 * visualizer: the generated field artwork (scripts/generate-biobuzz-field.ts),
 * the on-field overlay, the default obstacles, the start-pose presets and the
 * G304 start legality check.
 *
 * Coordinate system (Pedro Pathing field coordinates, inches):
 *  - origin = bottom-left corner of the field as seen from the audience
 *  - +x points toward the BLUE alliance wall (right), +y points away from the
 *    audience (up); heading 0° = +x, counter-clockwise positive
 *  - the RED alliance area is on the left wall (x = 0), BLUE on the right
 *
 * The visualizer's field spans FIELD inches (the measured inside of the
 * perimeter, not the nominal 144 in), so the 6 × 6 foam-tile grid is FIELD / 6.
 * Elements are placed relative to tile seams (as the Competition Manual does)
 * and sized in real inches. Source: BIOBUZZ Competition Manual TU01, §9-10
 * (all illustrated dimensions carry ±1 in tolerance).
 */
import type { BasePoint, Shape } from "../types";

export type Alliance = "red" | "blue";

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Inside dimension of the field used by the visualizer (matches FIELD_SIZE). */
export const FIELD = 141.5;
export const TILE = FIELD / 6;
export const CENTER = FIELD / 2;

/** Position of tile seam `k` (0 = wall, 6 = opposite wall). */
export const seam = (k: number) => k * TILE;

export const TILE_COLUMNS = ["A", "B", "C", "D", "E", "F"] as const;
export const TILE_ROWS = ["1", "2", "3", "4", "5", "6"] as const;

export const ALLIANCE_COLORS: Record<Alliance, { tape: string; ui: string; fill: string }> = {
  red: { tape: "#e3262b", ui: "#dc2626", fill: "#ff6b6b" },
  blue: { tape: "#1f4fe0", ui: "#2563eb", fill: "#60a5fa" },
};

export const POLLEN_DIAMETER = 2.8;
export const NECTAR_DIAMETER = 3.6;
/** Largest legal STARTING CONFIGURATION (R102): an 18 in cube. */
export const MAX_START_SIZE = 18;

// ---------------------------------------------------------------------------
// Symmetry
// ---------------------------------------------------------------------------

/**
 * The BIOBUZZ field is 180° rotationally symmetric about its centre.
 *
 * Rotating twice gives back the same coordinates ("Switch alliance" twice is a
 * no-op): nothing is rounded to a coarse grid, only float noise is stripped
 * (e.g. 141.5 − 78.9365 = 62.563500000000005 → 62.5635), and only when that
 * cleaning is lossless for the reverse rotation. See `mirrorCoord`.
 */
export function rotatePoint180<T extends BasePoint>(p: T): T {
  return { ...p, x: mirrorCoord(p.x), y: mirrorCoord(p.y) };
}

/**
 * FIELD − v as an involution: `mirrorCoord(mirrorCoord(v)) === v` for every
 * value with up to 9 decimals and for every double ≥ CENTER. A double below
 * CENTER with more significant bits than FIELD − v can hold (e.g.
 * 29.972906403940886) cannot survive any rotation that returns the nearest
 * double to FIELD − v; it moves by at most one ulp (~4e-15 in) on the first
 * round trip and is exact from then on.
 */
function mirrorCoord(v: number): number {
  const raw = FIELD - v;
  const clean = round9(raw);
  return round9(FIELD - clean) === v ? clean : raw;
}

function round9(n: number): number {
  return Math.round(n * 1e9) / 1e9;
}

export function rotateRect180(r: Rect): Rect {
  return { x0: FIELD - r.x1, y0: FIELD - r.y1, x1: FIELD - r.x0, y1: FIELD - r.y0 };
}

/** Normalise an angle in degrees to (-180, 180] (the heading inputs' range). */
export function normalizeDeg(deg: number): number {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return round3(d === -180 ? 180 : d);
}

export function rotateHeading180(deg: number): number {
  return normalizeDeg(deg + 180);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function rectToPolygon(r: Rect): BasePoint[] {
  return [
    { x: r.x0, y: r.y0 },
    { x: r.x1, y: r.y0 },
    { x: r.x1, y: r.y1 },
    { x: r.x0, y: r.y1 },
  ];
}

// ---------------------------------------------------------------------------
// Zones (§9.3)
// ---------------------------------------------------------------------------

/** Width of the gaffer tape used for zone lines. */
export const TAPE_WIDTH = 1;
/** Tape lines never cross tile seams; they stop this far short of a seam (Setup Guide §8.3-8.4). */
const SEAM_INSET = 0.42;

/**
 * LOADING ZONE: ~23 in wide (set by tile seams) × 11 in deep, bounded by tape
 * and the perimeter wall it touches. Red: left wall, tile row 5. Blue: rotated.
 */
const RED_LOADING_ZONE: Rect = {
  x0: 0,
  x1: 11,
  y0: seam(4) + SEAM_INSET,
  y1: seam(5) - SEAM_INSET,
};

export const LOADING_ZONES: Record<Alliance, Rect> = {
  red: RED_LOADING_ZONE,
  blue: rotateRect180(RED_LOADING_ZONE),
};

/**
 * GARDEN: ~23 in × 2 in (two strips of 1 in tape) along the audience wall in the
 * red corner (closest to the red alliance area). Blue: rear wall, blue corner.
 */
const RED_GARDEN: Rect = { x0: 0, x1: seam(1) - SEAM_INSET, y0: 0, y1: 2 };

export const GARDENS: Record<Alliance, Rect> = {
  red: RED_GARDEN,
  blue: rotateRect180(RED_GARDEN),
};

// ---------------------------------------------------------------------------
// FLOWERS (§9.7) – four, mounted to the perimeter wall on tile seams
// ---------------------------------------------------------------------------

export type Wall = "rear" | "audience" | "red" | "blue";

export interface Flower {
  id: string;
  name: string;
  wall: Wall;
  /** Centre of the top ring / scoring opening. */
  center: BasePoint;
  /** Unit vector pointing from the wall into the field. */
  inward: BasePoint;
  /** Floor footprint polygon (counter-clockwise). */
  footprint: BasePoint[];
}

/** Distance from the wall to the centre of the FLOWER top ring (Fig 9-12, Fig 9-17). */
export const FLOWER_RING_OFFSET = 2.5;
/** Footprint of the FLOWER (plate + pipes) parallel to / away from the wall. */
export const FLOWER_WIDTH = 6.0;
export const FLOWER_DEPTH = 5.0;
/** Chamfer of the two field-side corners of the FLOWER base plate. */
export const FLOWER_CHAMFER = 1.2;
/** Height of the FLOWER top opening above the tiles. */
export const FLOWER_OPENING_HEIGHT = 21.5;

function makeFlower(id: string, name: string, wall: Wall, along: number): Flower {
  // Local frame: u runs along the wall, v points into the field.
  const frames: Record<Wall, (u: number, v: number) => BasePoint> = {
    rear: (u, v) => ({ x: along + u, y: FIELD - v }),
    audience: (u, v) => ({ x: along - u, y: v }),
    red: (u, v) => ({ x: v, y: along - u }),
    blue: (u, v) => ({ x: FIELD - v, y: along + u }),
  };
  const toField = frames[wall];
  const w = FLOWER_WIDTH / 2;
  const local: [number, number][] = [
    [-w, 0],
    [w, 0],
    [w, FLOWER_DEPTH - FLOWER_CHAMFER],
    [w - FLOWER_CHAMFER, FLOWER_DEPTH],
    [-w + FLOWER_CHAMFER, FLOWER_DEPTH],
    [-w, FLOWER_DEPTH - FLOWER_CHAMFER],
  ];
  const footprint = local.map(([u, v]) => roundPoint(toField(u, v)));
  // Keep a consistent counter-clockwise winding in field coordinates.
  if (signedArea(footprint) < 0) footprint.reverse();
  const origin = toField(0, 0);
  const inwardPoint = toField(0, 1);
  return {
    id,
    name,
    wall,
    center: roundPoint(toField(0, FLOWER_RING_OFFSET)),
    inward: { x: inwardPoint.x - origin.x, y: inwardPoint.y - origin.y },
    footprint,
  };
}

export const FLOWERS: Flower[] = [
  makeFlower("flower-rear", "Flower · Rear wall (B|C)", "rear", seam(2)),
  makeFlower("flower-blue", "Flower · Blue wall (4|5)", "blue", seam(4)),
  makeFlower("flower-audience", "Flower · Audience wall (D|E)", "audience", seam(4)),
  makeFlower("flower-red", "Flower · Red wall (2|3)", "red", seam(2)),
];

// ---------------------------------------------------------------------------
// HIVE Structure (§9.6) – centred on the field
// ---------------------------------------------------------------------------

/**
 * Frame: 49.46 in wide (x) × 38.95 in deep (y), measured outside-to-outside of
 * the two floor-level foot bars; pivots 43.95 in above the tiles. From each end
 * of a foot bar a leg leans inward (in x and y) up to the top frame corner that
 * holds the pivot of the HIVE on that side (Fig 9-8, 9-10, 9-17).
 */
export const HIVE_FRAME_WIDTH = 49.46;
export const HIVE_FRAME_DEPTH = 38.95;
/** Width of the floor-level foot bars of the two triangular side frames. */
export const HIVE_FRAME_TUBE = 2.0;
export const HIVE_PIVOT_HEIGHT = 43.95;
/** Lowest point of a HIVE above the tiles – ROBOTS may drive underneath. */
export const HIVE_UNDERSIDE_HEIGHT = 30.6;
/** Plan-view width of an A-frame leg tube (obstacle model). */
export const HIVE_LEG_TUBE = 1.5;
/**
 * Height up to which the inward-leaning legs are modelled as floor obstacles:
 * the 18 in STARTING CONFIGURATION cube (R102). A robot no taller than that
 * only meets the lowest 18 in of each leg, which already sits ≈ 4.5 in (x) and
 * 8 in (y) inboard of its foot at the top; the higher, further-inboard part is
 * only reachable by robots that extend upward (R105, up to 29 in), which the
 * 2D planner does not model.
 */
export const LEG_CHECK_HEIGHT = 18;
/** HIVE centre-to-centre spacing (x) and CELL width including its frame. */
export const HIVE_SPACING = 25.5;
export const CELL_WIDTH = 21.2;
/**
 * Plan-view extent (distance from the pivot line along y) of a CELL in each
 * stable state: the HIVE sits tilted 30°, so the upward CELL reaches back
 * toward the pivot while the downward CELL hangs further out.
 */
export const CELL_SPAN_UP: [number, number] = [1.7, 20.0];
export const CELL_SPAN_DOWN: [number, number] = [6.7, 25.1];
/** Centre of the upward CELL opening (SDK AprilTag cluster origin), from the pivot line. */
export const CELL_AIM_OFFSET = 16.1;
/** Height of the upward CELL opening centre above the tiles. */
export const CELL_AIM_HEIGHT = 59;

/** Floor-level side frames (the triangular A-frames). */
export const HIVE_FRAME_RAILS: Rect[] = [
  {
    x0: CENTER - HIVE_FRAME_WIDTH / 2,
    x1: CENTER - HIVE_FRAME_WIDTH / 2 + HIVE_FRAME_TUBE,
    y0: CENTER - HIVE_FRAME_DEPTH / 2,
    y1: CENTER + HIVE_FRAME_DEPTH / 2,
  },
  {
    x0: CENTER + HIVE_FRAME_WIDTH / 2 - HIVE_FRAME_TUBE,
    x1: CENTER + HIVE_FRAME_WIDTH / 2,
    y0: CENTER - HIVE_FRAME_DEPTH / 2,
    y1: CENTER + HIVE_FRAME_DEPTH / 2,
  },
];

export type CellSide = "audience" | "rear";

export interface Cell {
  id: string;
  alliance: Alliance;
  side: CellSide;
  /** Plan-view bounding box of the CELL in its MATCH-start state. */
  rect: Rect;
  /** Facing upward at the start of the MATCH (can receive launches). */
  upAtStart: boolean;
  /** AprilTag cluster on the underside of the CELL (§9.9, Figure 9-17), listed left to right as seen from above. */
  aprilTags: number[];
  /** Plan-view centre of the AprilTag cluster in the MATCH-start state. */
  tagCenter: BasePoint;
  /** Launch aim point (centre of the opening) whenever this CELL faces up. */
  aimPoint: BasePoint;
}

export interface Hive {
  alliance: Alliance;
  /** Pivot centre in plan view. */
  pivot: BasePoint;
  cells: Cell[];
}

function makeHive(alliance: Alliance): Hive {
  const px = alliance === "red" ? CENTER - HIVE_SPACING / 2 : CENTER + HIVE_SPACING / 2;
  const x0 = px - CELL_WIDTH / 2;
  const x1 = px + CELL_WIDTH / 2;
  // Left-to-right order as seen from above (Figure 9-17).
  const tags: Record<Alliance, Record<CellSide, number[]>> = {
    red: { rear: [33, 32, 31, 30], audience: [34, 35, 36, 37] },
    blue: { audience: [38, 39, 40, 41], rear: [45, 44, 43, 42] },
  };
  // At MATCH start the CELL that points at a FLOWER is tilted down, so the red
  // audience-side CELL and the blue rear-side CELL face up (Figure 10-2).
  const upSide: CellSide = alliance === "red" ? "audience" : "rear";
  const cell = (side: CellSide): Cell => {
    const up = side === upSide;
    const [near, far] = up ? CELL_SPAN_UP : CELL_SPAN_DOWN;
    const s = side === "audience" ? -1 : 1;
    // Cluster centre sits 13.85 in (up) / 10.85 in (down) from the pivot line.
    const tagOffset = up ? 13.85 : 10.85;
    return {
      id: `cell-${alliance}-${side}`,
      alliance,
      side,
      rect:
        s < 0
          ? { x0, x1, y0: CENTER - far, y1: CENTER - near }
          : { x0, x1, y0: CENTER + near, y1: CENTER + far },
      upAtStart: up,
      aprilTags: tags[alliance][side],
      tagCenter: { x: px, y: CENTER + s * tagOffset },
      aimPoint: { x: px, y: CENTER + s * CELL_AIM_OFFSET },
    };
  };
  return { alliance, pivot: { x: px, y: CENTER }, cells: [cell("audience"), cell("rear")] };
}

export const HIVES: Record<Alliance, Hive> = {
  red: makeHive("red"),
  blue: makeHive("blue"),
};

/** One inward-leaning A-frame leg, from a foot-bar end up to a HIVE pivot. */
export interface HiveLeg {
  id: string;
  name: string;
  /** Side of the field (and HIVE) the leg belongs to: the left rail leans to the red HIVE. */
  alliance: Alliance;
  /** End of the foot bar the leg stands on. */
  side: CellSide;
  /** Foot on the tiles: rail centre line, at the rail's audience / rear end. */
  foot: BasePoint;
  /** Top corner (plan view) = that side's HIVE pivot, HIVE_PIVOT_HEIGHT above the tiles. */
  top: BasePoint;
}

function makeHiveLegs(): HiveLeg[] {
  const legs: HiveLeg[] = [];
  HIVE_FRAME_RAILS.forEach((rail, i) => {
    const alliance: Alliance = i === 0 ? "red" : "blue";
    const x = (rail.x0 + rail.x1) / 2;
    for (const side of ["audience", "rear"] as CellSide[]) {
      legs.push({
        id: `hive-leg-${alliance}-${side}`,
        name: `HIVE Leg · ${alliance === "red" ? "Red" : "Blue"} side (${side})`,
        alliance,
        side,
        foot: { x, y: side === "audience" ? rail.y0 : rail.y1 },
        top: { ...HIVES[alliance].pivot },
      });
    }
  });
  return legs;
}

/** The four legs: red-audience, red-rear, blue-audience, blue-rear. */
export const HIVE_LEGS: HiveLeg[] = makeHiveLegs();

/** Plan-view position of a leg's centre line at `height` in above the tiles. */
export function hiveLegPoint(leg: HiveLeg, height: number): BasePoint {
  const t = height / HIVE_PIVOT_HEIGHT;
  return {
    x: leg.foot.x + (leg.top.x - leg.foot.x) * t,
    y: leg.foot.y + (leg.top.y - leg.foot.y) * t,
  };
}

/**
 * Plan-view footprint of a leg from the tiles up to `toHeight` (default
 * LEG_CHECK_HEIGHT): a `tube`-wide strip along the leg (counter-clockwise).
 */
export function hiveLegPolygon(
  leg: HiveLeg,
  toHeight = LEG_CHECK_HEIGHT,
  tube = HIVE_LEG_TUBE,
): BasePoint[] {
  const a = leg.foot;
  const b = hiveLegPoint(leg, toHeight);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = (-(b.y - a.y) / len) * (tube / 2);
  const ny = ((b.x - a.x) / len) * (tube / 2);
  const poly = [
    { x: a.x - nx, y: a.y - ny },
    { x: b.x - nx, y: b.y - ny },
    { x: b.x + nx, y: b.y + ny },
    { x: a.x + nx, y: a.y + ny },
  ].map(roundPoint);
  if (signedArea(poly) < 0) poly.reverse();
  return poly;
}

// ---------------------------------------------------------------------------
// Pre-staged SCORING ELEMENTS (§10.3.1)
// ---------------------------------------------------------------------------

export interface StagedPiece {
  kind: "pollen" | "nectar";
  alliance?: Alliance;
  x: number;
  y: number;
}

function stagedPieces(): StagedPiece[] {
  const pieces: StagedPiece[] = [];
  const r = POLLEN_DIAMETER / 2;
  // 4 POLLEN in the red GARDEN, in a line from the red corner against the wall.
  for (let i = 0; i < 4; i++) {
    const p = { kind: "pollen" as const, x: r + i * POLLEN_DIAMETER, y: r };
    pieces.push(p, { ...rotatePoint180(p) });
  }
  // 3 NECTAR in each upward CELL, against the back wall, starting from the
  // side closest to that alliance's area (plan view of the tilted CELL).
  const n = NECTAR_DIAMETER / 2;
  const redUp = HIVES.red.cells.find((c) => c.upAtStart)!;
  const depth = redUp.rect.y1 - redUp.rect.y0;
  for (let i = 0; i < 3; i++) {
    const p = {
      kind: "nectar" as const,
      alliance: "red" as Alliance,
      x: redUp.rect.x0 + 1.6 + n + i * NECTAR_DIAMETER,
      y: redUp.rect.y0 + depth * 0.6,
    };
    pieces.push(p, { ...rotatePoint180(p), alliance: "blue" });
  }
  return pieces;
}

/** POLLEN in GARDENS and NECTAR in upward CELLS (FLOWERS hold 4 POLLEN each). */
export const STAGED_PIECES: StagedPiece[] = stagedPieces();

// ---------------------------------------------------------------------------
// Obstacles for the path planner
// ---------------------------------------------------------------------------

export const OBSTACLE_COLORS = {
  flower: { color: "#d97706", fillColor: "#fbbf24" },
  frame: { color: "#52525b", fillColor: "#a1a1aa" },
};

/**
 * Obstacles at robot height. The HIVES themselves hang ≥ 30.6 in above the
 * tiles, so ROBOTS may drive underneath them, except near the A-frame: the two
 * foot bars on the tiles and the four inward-leaning legs (modelled up to
 * LEG_CHECK_HEIGHT = 18 in, the R102 starting size).
 * Order: rails, legs (HIVE_LEGS order), FLOWERS.
 */
export function getBiobuzzObstacles(): Shape[] {
  const flowers: Shape[] = FLOWERS.map((f) => ({
    id: f.id,
    name: f.name,
    vertices: f.footprint.map((p) => ({ ...p })),
    ...OBSTACLE_COLORS.flower,
    locked: true,
  }));
  const rails: Shape[] = HIVE_FRAME_RAILS.map((r, i) => ({
    id: i === 0 ? "hive-frame-red" : "hive-frame-blue",
    name: i === 0 ? "HIVE Frame · Red side" : "HIVE Frame · Blue side",
    vertices: rectToPolygon(r).map(roundPoint),
    ...OBSTACLE_COLORS.frame,
    locked: true,
  }));
  const legs: Shape[] = HIVE_LEGS.map((leg) => ({
    id: leg.id,
    name: leg.name,
    vertices: hiveLegPolygon(leg),
    ...OBSTACLE_COLORS.frame,
    locked: true,
  }));
  return [...rails, ...legs, ...flowers];
}

// ---------------------------------------------------------------------------
// Robot footprint + G304 start legality
// ---------------------------------------------------------------------------

/**
 * Robot footprint polygon in field coordinates. `length` runs along the
 * heading (the visualizer's "robot width" setting), `width` across it.
 */
export function robotFootprint(
  x: number,
  y: number,
  headingDeg: number,
  length: number,
  width: number,
): BasePoint[] {
  const h = (headingDeg * Math.PI) / 180;
  const c = Math.cos(h);
  const s = Math.sin(h);
  const hl = length / 2;
  const hw = width / 2;
  return [
    [hl, hw],
    [-hl, hw],
    [-hl, -hw],
    [hl, -hw],
  ].map(([u, v]) => ({ x: x + u * c - v * s, y: y + u * s + v * c }));
}

/** Half extents of the axis-aligned bounding box of a rotated robot. */
export function robotHalfExtents(headingDeg: number, length: number, width: number) {
  const h = (headingDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(h));
  const s = Math.abs(Math.sin(h));
  return {
    hx: (c * length + s * width) / 2,
    hy: (s * length + c * width) / 2,
  };
}

export type StartIssueCode =
  | "outside-field"
  | "crosses-center"
  | "not-touching-wall"
  | "in-loading-zone"
  | "touching-flower"
  | "touching-pollen"
  | "on-garden"
  | "oversize";

export interface StartIssue {
  code: StartIssueCode;
  message: string;
  /** Blocking rule violations vs. advisories. */
  severity: "error" | "warning";
}

export interface StartCheck {
  alliance: Alliance | null;
  ok: boolean;
  issues: StartIssue[];
}

/**
 * Largest gap to the perimeter wall that is still reported as legal-but-off
 * (a warning); anything further away is a G304.C error.
 */
export const WALL_TOUCH_TOLERANCE = 0.5;
/** A robot within this distance of the wall counts as touching it. */
export const WALL_CONTACT_TOLERANCE = 0.05;
/** Gap below which the robot counts as contacting a FLOWER or staged POLLEN. */
export const CONTACT_MARGIN = 0.05;
const EPS = 1e-6;
/**
 * Tolerance for the perimeter and centre-line tests. Presets and dragged
 * poses are rounded to 0.001 in, so a robot flush against a wall may poke
 * past it by up to 0.0005 in without really being outside.
 */
const POSE_EPS = 1e-3;

/**
 * Check a starting pose against G304 (A, C, D, E, G) and R102 using the
 * robot's rectangular footprint. `length` runs along the heading.
 */
export function checkStartPose(
  x: number,
  y: number,
  headingDeg: number,
  length: number,
  width: number,
): StartCheck {
  const issues: StartIssue[] = [];
  const poly = robotFootprint(x, y, headingDeg, length, width);
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const alliance: Alliance | null =
    maxX <= CENTER + POSE_EPS ? "red" : minX >= CENTER - POSE_EPS ? "blue" : null;

  if (
    minX < -POSE_EPS ||
    minY < -POSE_EPS ||
    maxX > FIELD + POSE_EPS ||
    maxY > FIELD + POSE_EPS
  ) {
    issues.push({
      code: "outside-field",
      message: "Robot extends past the field perimeter (G304.A)",
      severity: "error",
    });
  }
  if (!alliance) {
    issues.push({
      code: "crosses-center",
      message: "Must be fully on its own alliance side — red A–C, blue D–F (G304.A)",
      severity: "error",
    });
  }
  const wallGap = Math.max(0, Math.min(minX, minY, FIELD - maxX, FIELD - maxY));
  if (wallGap > WALL_TOUCH_TOLERANCE) {
    issues.push({
      code: "not-touching-wall",
      message: `Must touch the perimeter wall (${wallGap.toFixed(1)} in away) (G304.C)`,
      severity: "error",
    });
  } else if (wallGap > WALL_CONTACT_TOLERANCE) {
    issues.push({
      code: "not-touching-wall",
      message: `${wallGap.toFixed(wallGap < 0.095 ? 2 : 1)} in from the wall — should touch it (G304.C)`,
      severity: "warning",
    });
  }
  for (const a of ["red", "blue"] as Alliance[]) {
    if (polygonsOverlap(poly, rectToPolygon(LOADING_ZONES[a]))) {
      issues.push({
        code: "in-loading-zone",
        message: `Overlaps the ${a} LOADING ZONE (G304.E)`,
        severity: "error",
      });
    }
  }
  // G304.D says "not contacting", so being flush against a FLOWER counts.
  for (const f of FLOWERS) {
    if (polygonsTouch(poly, f.footprint, CONTACT_MARGIN)) {
      const where = f.name.replace("Flower · ", "");
      issues.push({
        code: "touching-flower",
        message: `Contacts the ${where[0].toLowerCase()}${where.slice(1)} FLOWER (G304.D)`,
        severity: "error",
      });
    }
  }
  // G304.G: the only POLLEN a robot may contact are its 4 pre-loads.
  const pollenHit = new Set<Alliance>();
  for (const p of STAGED_PIECES) {
    if (p.kind !== "pollen") continue;
    if (distanceToPolygon(p, poly) < POLLEN_DIAMETER / 2 + CONTACT_MARGIN) {
      pollenHit.add(p.y < CENTER ? "red" : "blue");
    }
  }
  if (pollenHit.size) {
    issues.push({
      code: "touching-pollen",
      message: "Touches the pre-staged GARDEN POLLEN (G304.G)",
      severity: "error",
    });
  }
  for (const a of ["red", "blue"] as Alliance[]) {
    if (pollenHit.has(a)) continue;
    if (polygonsOverlap(poly, rectToPolygon(GARDENS[a]))) {
      issues.push({
        code: "on-garden",
        message: `Sits on the ${a} GARDEN, where 4 POLLEN are pre-staged`,
        severity: "warning",
      });
    }
  }
  if (length > MAX_START_SIZE + EPS || width > MAX_START_SIZE + EPS) {
    issues.push({
      code: "oversize",
      message: `Robot footprint exceeds the 18 in STARTING CONFIGURATION (R102)`,
      severity: "error",
    });
  }
  return { alliance, ok: !issues.some((i) => i.severity === "error"), issues };
}

// ---------------------------------------------------------------------------
// Start pose presets
// ---------------------------------------------------------------------------

export interface StartPreset {
  id: string;
  label: string;
  alliance: Alliance;
  x: number;
  y: number;
  headingDeg: number;
  description: string;
}

/**
 * Legal starting poses for a robot of the given size, each touching a
 * perimeter wall. Blue presets are the 180° rotation of the red ones.
 */
export function getStartPresets(length: number, width: number): StartPreset[] {
  const margin = 1;
  const pose = (headingDeg: number) => robotHalfExtents(headingDeg, length, width);
  const up = pose(90);
  const down = pose(270);
  const right = pose(0);
  const red: StartPreset[] = [
    {
      id: "audience-center",
      label: "Audience wall · by HIVE",
      alliance: "red",
      x: CENTER - up.hx - margin,
      y: up.hy,
      headingDeg: 90,
      description: "Against the audience wall next to the centre line, facing the HIVE",
    },
    {
      id: "audience-corner",
      label: "Audience wall · by GARDEN",
      alliance: "red",
      x: GARDENS.red.x1 + up.hx + margin,
      y: up.hy,
      headingDeg: 90,
      description: "Against the audience wall just past the red GARDEN",
    },
    {
      id: "rear-center",
      label: "Rear wall · by HIVE",
      alliance: "red",
      x: CENTER - down.hx - margin,
      y: FIELD - down.hy,
      headingDeg: -90,
      description: "Against the rear wall next to the centre line, facing the HIVE",
    },
    {
      id: "alliance-wall",
      label: "Alliance wall · centre",
      alliance: "red",
      x: right.hx,
      y: CENTER,
      headingDeg: 0,
      description: "Against the red alliance wall between the FLOWER and the LOADING ZONE",
    },
  ];
  // Rotating by 180° swaps the audience and rear walls.
  const swapWalls = (s: string) =>
    s.replace(/(audience|rear)/gi, (m) => {
      const swapped = m.toLowerCase() === "audience" ? "rear" : "audience";
      return m[0] === m[0].toUpperCase()
        ? swapped[0].toUpperCase() + swapped.slice(1)
        : swapped;
    });
  const blue = red.map((p) => {
    const r = rotatePoint180(p);
    return {
      ...p,
      id: swapWalls(p.id),
      label: swapWalls(p.label),
      alliance: "blue" as Alliance,
      x: r.x,
      y: r.y,
      headingDeg: rotateHeading180(p.headingDeg),
      description: swapWalls(p.description).replace(/red/g, "blue"),
    };
  });
  // Round to 0.001 in toward the field centre, so a robot flush against a
  // wall never ends up poking past it (and 180° symmetry is kept).
  const inward = (v: number) =>
    v < CENTER
      ? Math.ceil(v * 1000 - 1e-6) / 1000
      : v > CENTER
        ? Math.floor(v * 1000 + 1e-6) / 1000
        : v;
  return [...red, ...blue].map((p) => ({
    ...p,
    id: `${p.alliance}-${p.id}`,
    x: inward(p.x),
    y: inward(p.y),
  }));
}

// ---------------------------------------------------------------------------
// Polygon helpers
// ---------------------------------------------------------------------------

function roundPoint(p: BasePoint): BasePoint {
  return { x: round3(p.x), y: round3(p.y) };
}

function signedArea(poly: BasePoint[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Separating-axis test for two convex polygons. Touching edges do not count as
 * an overlap, so a robot flush against a zone's boundary is outside it.
 */
export function polygonsOverlap(a: BasePoint[], b: BasePoint[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = q.y - p.y;
      const ny = p.x - q.x;
      const len = Math.hypot(nx, ny) || 1;
      let minA = Infinity;
      let maxA = -Infinity;
      for (const v of a) {
        const d = (v.x * nx + v.y * ny) / len;
        minA = Math.min(minA, d);
        maxA = Math.max(maxA, d);
      }
      let minB = Infinity;
      let maxB = -Infinity;
      for (const v of b) {
        const d = (v.x * nx + v.y * ny) / len;
        minB = Math.min(minB, d);
        maxB = Math.max(maxB, d);
      }
      if (maxA <= minB + 1e-3 || maxB <= minA + 1e-3) return false;
    }
  }
  return true;
}

/**
 * Separating-axis test for two convex polygons that also counts contact:
 * true when they overlap or are less than `margin` apart (so a robot flush
 * against the polygon touches it).
 */
export function polygonsTouch(a: BasePoint[], b: BasePoint[], margin = CONTACT_MARGIN): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = q.y - p.y;
      const ny = p.x - q.x;
      const len = Math.hypot(nx, ny) || 1;
      let minA = Infinity;
      let maxA = -Infinity;
      for (const v of a) {
        const d = (v.x * nx + v.y * ny) / len;
        minA = Math.min(minA, d);
        maxA = Math.max(maxA, d);
      }
      let minB = Infinity;
      let maxB = -Infinity;
      for (const v of b) {
        const d = (v.x * nx + v.y * ny) / len;
        minB = Math.min(minB, d);
        maxB = Math.max(maxB, d);
      }
      if (maxA + margin < minB || maxB + margin < minA) return false;
    }
  }
  return true;
}

/** Distance from a point to a polygon (0 when the point is inside it). */
export function distanceToPolygon(p: BasePoint, poly: BasePoint[]): number {
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return inside ? 0 : best;
}
