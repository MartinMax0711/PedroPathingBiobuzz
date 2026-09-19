import { describe, expect, it } from "vitest";
import {
  CENTER,
  FIELD,
  FLOWERS,
  FLOWER_CHAMFER,
  FLOWER_DEPTH,
  FLOWER_WIDTH,
  GARDENS,
  HIVES,
  HIVE_FRAME_RAILS,
  HIVE_LEGS,
  HIVE_LEG_TUBE,
  HIVE_PIVOT_HEIGHT,
  LEG_CHECK_HEIGHT,
  LOADING_ZONES,
  STAGED_PIECES,
  checkStartPose,
  getBiobuzzObstacles,
  getStartPresets,
  hiveLegPoint,
  hiveLegPolygon,
  normalizeDeg,
  rotatePoint180,
  rotateRect180,
} from "../field";

describe("BIOBUZZ field geometry", () => {
  it("is 180° rotationally symmetric", () => {
    expect(rotateRect180(LOADING_ZONES.red)).toEqual(LOADING_ZONES.blue);
    expect(rotateRect180(GARDENS.red)).toEqual(GARDENS.blue);
    const centers = FLOWERS.map((f) => `${f.center.x},${f.center.y}`).sort();
    const rotated = FLOWERS.map((f) => rotatePoint180(f.center))
      .map((c) => `${c.x},${c.y}`)
      .sort();
    expect(rotated).toEqual(centers);
    expect(HIVES.red.pivot.x + HIVES.blue.pivot.x).toBeCloseTo(FIELD);
  });

  it("places the red LOADING ZONE on the red wall in tile row 5", () => {
    const z = LOADING_ZONES.red;
    expect(z.x0).toBe(0);
    expect(z.x1).toBe(11);
    expect(z.y1 - z.y0).toBeCloseTo(22.75, 1);
    expect(z.y0).toBeCloseTo(94.75, 1);
    expect(z.y0).toBeGreaterThan((4 * FIELD) / 6);
    expect(z.y1).toBeLessThan((5 * FIELD) / 6);
  });

  it("starts with the red audience-side and blue rear-side CELLS facing up", () => {
    const up = (a: "red" | "blue") => HIVES[a].cells.find((c) => c.upAtStart)!;
    expect(up("red").side).toBe("audience");
    expect(up("blue").side).toBe("rear");
    expect(up("red").rect.y1).toBeLessThan(CENTER);
    expect(up("blue").rect.y0).toBeGreaterThan(CENTER);
  });

  it("labels AprilTag clusters per Figure 9-17", () => {
    const tags = (a: "red" | "blue", side: "audience" | "rear") =>
      HIVES[a].cells.find((c) => c.side === side)!.aprilTags;
    expect(tags("red", "rear")).toEqual([33, 32, 31, 30]);
    expect(tags("red", "audience")).toEqual([34, 35, 36, 37]);
    expect(tags("blue", "audience")).toEqual([38, 39, 40, 41]);
    expect(tags("blue", "rear")).toEqual([45, 44, 43, 42]);
  });

  it("exposes HIVE rails, the four HIVE legs and four FLOWERS as obstacles", () => {
    const obstacles = getBiobuzzObstacles();
    const ids = obstacles.map((s) => s.id);
    expect(ids).toEqual([
      "hive-frame-red",
      "hive-frame-blue",
      "hive-leg-red-audience",
      "hive-leg-red-rear",
      "hive-leg-blue-audience",
      "hive-leg-blue-rear",
      "flower-rear",
      "flower-blue",
      "flower-audience",
      "flower-red",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(obstacles.every((s) => s.locked)).toBe(true);
    expect(obstacles.find((s) => s.id === "hive-leg-red-rear")!.name).toBe(
      "HIVE Leg · Red side (rear)",
    );
  });

  it("models each HIVE leg leaning from its foot toward that side's pivot", () => {
    const [left, right] = HIVE_FRAME_RAILS;
    const leg = (id: string) => HIVE_LEGS.find((l) => l.id === id)!;
    expect(leg("hive-leg-red-audience").foot).toEqual({ x: (left.x0 + left.x1) / 2, y: left.y0 });
    expect(leg("hive-leg-red-rear").foot.y).toBe(left.y1);
    expect(leg("hive-leg-blue-audience").foot).toEqual({ x: (right.x0 + right.x1) / 2, y: right.y0 });
    for (const l of HIVE_LEGS) expect(l.top).toEqual(HIVES[l.alliance].pivot);
    // Reaches the pivot at pivot height, leans ≈ 0.25 in/in in x and 0.44 in/in in y.
    const red = leg("hive-leg-red-audience");
    expect(hiveLegPoint(red, HIVE_PIVOT_HEIGHT)).toEqual(HIVES.red.pivot);
    const at18 = hiveLegPoint(red, LEG_CHECK_HEIGHT);
    expect(at18.x).toBeCloseTo(51.52, 1);
    expect(at18.y).toBeCloseTo(59.25, 1);
    // The obstacle strip is HIVE_LEG_TUBE wide and ends at LEG_CHECK_HEIGHT.
    const poly = hiveLegPolygon(red);
    expect(poly).toHaveLength(4);
    const side = Math.hypot(poly[1].x - poly[2].x, poly[1].y - poly[2].y);
    expect(side).toBeCloseTo(HIVE_LEG_TUBE, 2);
    const obstacle = getBiobuzzObstacles().find((s) => s.id === red.id)!;
    expect(obstacle.vertices).toEqual(poly);
    // 180° symmetric: the red audience leg maps onto the blue rear leg.
    const key = (pts: { x: number; y: number }[]) =>
      pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).sort();
    expect(key(poly.map(rotatePoint180))).toEqual(key(hiveLegPolygon(leg("hive-leg-blue-rear"))));
  });

  it("builds the FLOWER footprint from FLOWER_WIDTH / FLOWER_DEPTH / FLOWER_CHAMFER", () => {
    const red = FLOWERS.find((f) => f.id === "flower-red")!;
    const xs = red.footprint.map((p) => p.x);
    const ys = red.footprint.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(FLOWER_DEPTH);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(FLOWER_WIDTH);
    expect(red.footprint).toHaveLength(6);
    expect(FLOWER_CHAMFER).toBeGreaterThan(0);
  });

  it("rotates by 180° as an exact involution (Switch alliance twice is a no-op)", () => {
    for (const v of [78.9365, 30.1, 61.75, 0, 8, 141.5, 23.1625, 12.345678901, 100.123456789]) {
      const once = rotatePoint180({ x: v, y: v });
      expect(rotatePoint180(once)).toEqual({ x: v, y: v });
    }
    // Float noise is stripped instead of rounding to 0.001 in.
    expect(rotatePoint180({ x: 78.9365, y: 0.1 + 0.2 })).toEqual({ x: 62.5635, y: 141.2 });
    // A full-precision double (e.g. from a double-click) keeps all its digits.
    const raw = 29.972906403940886;
    const once = rotatePoint180({ x: raw, y: raw });
    expect(once.x).toBeCloseTo(FIELD - raw, 12);
    const twice = rotatePoint180(once);
    // Doubles below the centre hold more bits than FIELD − v can, so the first
    // round trip may move one ulp (≈ 4e-15 in); after that it is exact.
    expect(Math.abs(twice.x - raw)).toBeLessThan(1e-12);
    expect(rotatePoint180(rotatePoint180(twice))).toEqual(twice);
    // Random 3–9 decimal coordinates and any double above the centre round-trip exactly.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2000; i++) {
      const digits = 3 + (i % 7);
      const v = Math.round(rand() * FIELD * 10 ** digits) / 10 ** digits;
      const hi = CENTER + rand() * CENTER;
      for (const x of [v, hi]) {
        expect(rotatePoint180(rotatePoint180({ x, y: 0 })).x).toBe(x);
      }
    }
  });

  it("normalises headings to (-180, 180]", () => {
    expect([0, 90, 180, -180, 270, -270, 360, 450].map(normalizeDeg)).toEqual([
      0, 90, 180, 180, -90, 90, 0, 90,
    ]);
  });
});

describe("G304 start check", () => {
  const expectCleanPresets = (l: number, w: number) => {
    const presets = getStartPresets(l, w);
    expect(presets).toHaveLength(8);
    for (const p of presets) {
      const r = checkStartPose(p.x, p.y, p.headingDeg, l, w);
      expect(r.issues, `${p.id} ${l}x${w}`).toEqual([]);
      expect(r.alliance, `${p.id} ${l}x${w}`).toBe(p.alliance);
    }
  };

  it("accepts every preset for 16 in and 18 × 14 in robots", () => {
    for (const [l, w] of [
      [16, 16],
      [18, 14],
      [14, 18],
    ]) {
      expectCleanPresets(l, w);
    }
  });

  it("accepts every preset for fractional and metric robot sizes", () => {
    for (const [l, w] of [
      [17.125, 17.125],
      [17.375, 16],
      [16, 17.375],
      [15.625, 15.625],
      [17.875, 17.875],
      [17.7165, 17.7165], // 45 cm
      [16, 13.875],
    ]) {
      expectCleanPresets(l, w);
    }
  });

  it("accepts every preset for square robots from 10 to 18 in (1/8 in steps)", () => {
    for (let s = 10; s <= 18; s += 0.125) expectCleanPresets(s, s);
  });

  it("accepts every preset for rectangular robots from 10 to 18 in", () => {
    for (let l = 10; l <= 18; l += 0.5) {
      for (let w = 10; w <= 18; w += 0.5) expectCleanPresets(l, w);
    }
  });

  it("never lets a preset poke past the perimeter", () => {
    for (const p of getStartPresets(17.7165, 17.125)) {
      const r = checkStartPose(p.x, p.y, p.headingDeg, 17.7165, 17.125);
      expect(r.ok).toBe(true);
    }
    const blueWall = getStartPresets(17.125, 17.125).find((p) => p.id === "blue-alliance-wall")!;
    expect(blueWall.x + 17.125 / 2).toBeLessThanOrEqual(FIELD);
  });

  it("rejects crossing the centre line, floating, LOADING ZONE and FLOWER contact", () => {
    const codes = (x: number, y: number, h: number) =>
      checkStartPose(x, y, h, 16, 16).issues.map((i) => i.code);
    expect(codes(CENTER, 8, 90)).toContain("crosses-center");
    expect(codes(40, 40, 90)).toContain("not-touching-wall");
    expect(codes(8, 105, 0)).toContain("in-loading-zone");
    expect(codes(47, FIELD - 8, -90)).toContain("touching-flower");
    expect(codes(20, 8, 90)).toContain("on-garden");
    expect(checkStartPose(60, 9, 90, 19, 16).issues.map((i) => i.code)).toContain("oversize");
  });

  it("flags a robot resting on the pre-staged GARDEN POLLEN (G304.G)", () => {
    // Red corner, against the red wall, just above the GARDEN tape (y 2–20):
    // the tape is clear but the 4 POLLEN (up to y = 2.8) are under the robot.
    const r = checkStartPose(9, 11, 90, 18, 18);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.message)).toContain(
      "Touches the pre-staged GARDEN POLLEN (G304.G)",
    );
    expect(r.issues.find((i) => i.code === "touching-pollen")!.severity).toBe("error");
    // Same in the blue GARDEN (rotated pose).
    const b = rotatePoint180({ x: 9, y: 11 });
    expect(checkStartPose(b.x, b.y, -90, 18, 18).issues.map((i) => i.code)).toContain(
      "touching-pollen",
    );
    // Clear of the POLLEN but on the GARDEN tape: only the warning.
    const tape = checkStartPose(20, 8, 90, 16, 16);
    expect(tape.ok).toBe(true);
    expect(tape.issues.map((i) => `${i.code}/${i.severity}`)).toEqual(["on-garden/warning"]);
    // Every staged GARDEN POLLEN is checked.
    expect(STAGED_PIECES.filter((p) => p.kind === "pollen")).toHaveLength(8);
  });

  it("counts a robot flush against a FLOWER as contact (G304.D)", () => {
    const red = FLOWERS.find((f) => f.id === "flower-red")!;
    const flowerBottom = Math.min(...red.footprint.map((p) => p.y));
    // Robot top edge exactly on the FLOWER's edge.
    const flush = checkStartPose(9, flowerBottom - 9, 0, 18, 18);
    expect(flush.ok).toBe(false);
    expect(flush.issues.map((i) => i.code)).toEqual(["touching-flower"]);
    // A clear gap is fine.
    expect(checkStartPose(9, flowerBottom - 9.25, 0, 18, 18).issues).toEqual([]);
  });

  it("keeps tile letters uppercase in FLOWER messages", () => {
    const rear = FLOWERS.find((f) => f.id === "flower-rear")!;
    const audience = FLOWERS.find((f) => f.id === "flower-audience")!;
    const msg = (x: number, y: number, h: number) =>
      checkStartPose(x, y, h, 16, 16).issues.find((i) => i.code === "touching-flower")!.message;
    expect(msg(rear.center.x, FIELD - 8, -90)).toBe("Contacts the rear wall (B|C) FLOWER (G304.D)");
    expect(msg(audience.center.x, 8, 90)).toBe(
      "Contacts the audience wall (D|E) FLOWER (G304.D)",
    );
  });

  it("requires real wall contact: warns for small gaps, rejects large ones (G304.C)", () => {
    const at = (gap: number) => checkStartPose(9 + gap, 30, 0, 18, 18);
    expect(at(0).issues).toEqual([]);
    expect(at(0.04).issues).toEqual([]);
    const small = at(0.3);
    expect(small.ok).toBe(true);
    expect(small.issues).toEqual([
      {
        code: "not-touching-wall",
        message: "0.3 in from the wall — should touch it (G304.C)",
        severity: "warning",
      },
    ]);
    expect(at(0.06).issues[0]).toMatchObject({ severity: "warning" });
    expect(at(0.06).issues[0].message).toMatch(/^0\.06 in from the wall/);
    expect(at(0.5).issues[0]).toMatchObject({ severity: "warning" });
    const far = at(0.6);
    expect(far.ok).toBe(false);
    expect(far.issues[0]).toMatchObject({ code: "not-touching-wall", severity: "error" });
  });

  it("labels rotated blue presets by their actual wall", () => {
    const blue = getStartPresets(16, 16).filter((p) => p.alliance === "blue");
    const rear = blue.find((p) => p.id === "blue-rear-center")!;
    expect(rear.y).toBeGreaterThan(CENTER);
    expect(rear.label).toMatch(/^Rear wall/);
    expect(rear.headingDeg).toBe(-90);
  });
});
