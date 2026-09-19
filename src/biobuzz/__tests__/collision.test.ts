import { describe, expect, it } from "vitest";
import type { Line, Point } from "../../types";
import { findPathCollisions, polygonsIntersect } from "../collision";
import { FIELD, getBiobuzzObstacles } from "../field";

const start: Point = { x: 61.75, y: 8, heading: "linear", startDeg: 90, endDeg: 90 };
const line = (id: string, x: number, y: number, heading: Partial<Point>, controlPoints = []): Line =>
  ({ id, endPoint: { x, y, ...heading } as Point, controlPoints, color: "#fff" }) as Line;

describe("findPathCollisions", () => {
  const shapes = getBiobuzzObstacles();

  it("lets a robot drive under the HIVE between the frame rails", () => {
    const hits = findPathCollisions(
      start,
      [line("a", 61.75, 120, { heading: "linear", startDeg: 90, endDeg: 90 })],
      shapes,
      16,
      16,
    );
    expect(hits).toEqual([]);
  });

  it("drives straight up the middle under both HIVES without touching the legs", () => {
    const hits = findPathCollisions(
      { x: 70.75, y: 8, heading: "linear", startDeg: 90, endDeg: 90 },
      [line("m", 70.75, 133.5, { heading: "linear", startDeg: 90, endDeg: 90 })],
      shapes,
      16,
      16,
    );
    expect(hits).toEqual([]);
  });

  it("flags a path that clears the rail but runs into an inward-leaning HIVE leg", () => {
    // x 48.2–64.2: inside the red rail's inner edge (48.02) but across the
    // audience-side leg, which leans in to x ≈ 51.5 at 18 in.
    const hits = findPathCollisions(
      { x: 56.2, y: 30, heading: "constant", degrees: 90 },
      [line("leg", 56.2, 70, { heading: "constant", degrees: 90 })],
      shapes,
      16,
      16,
    );
    expect(hits.map((h) => h.shapeId)).toEqual(["hive-leg-red-audience"]);
    expect(hits[0].shapeName).toBe("HIVE Leg · Red side (audience)");
    // Without the legs the same path was reported clear.
    const railsAndFlowers = shapes.filter((s) => !s.id.startsWith("hive-leg-"));
    expect(
      findPathCollisions(
        { x: 56.2, y: 30, heading: "constant", degrees: 90 },
        [line("leg", 56.2, 70, { heading: "constant", degrees: 90 })],
        railsAndFlowers,
        16,
        16,
      ),
    ).toEqual([]);
  });

  it("flags the blue rear leg for the rotated path", () => {
    const hits = findPathCollisions(
      { x: FIELD - 56.2, y: FIELD - 30, heading: "constant", degrees: -90 },
      [line("leg", FIELD - 56.2, FIELD - 70, { heading: "constant", degrees: -90 })],
      shapes,
      16,
      16,
    );
    expect(hits.map((h) => h.shapeId)).toEqual(["hive-leg-blue-rear"]);
  });

  it("flags crossing the red-side HIVE frame rail", () => {
    const hits = findPathCollisions(
      { x: 61.75, y: 70, heading: "constant", degrees: 180 },
      [line("b", 25, 70, { heading: "constant", degrees: 180 })],
      shapes,
      16,
      16,
    );
    expect(hits.map((h) => h.shapeId)).toEqual(["hive-frame-red"]);
    expect(hits[0].tStart).toBeGreaterThan(0);
    expect(hits[0].tEnd).toBeLessThan(1);
  });

  it("flags driving into the red-wall FLOWER", () => {
    const hits = findPathCollisions(
      { x: 30, y: 47, heading: "constant", degrees: 180 },
      [line("c", 6, 47, { heading: "constant", degrees: 180 })],
      shapes,
      16,
      16,
    );
    expect(hits.map((h) => h.shapeId)).toContain("flower-red");
  });

  it("detects overlap with concave user polygons", () => {
    const concave = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 5, y: 3 },
      { x: 0, y: 10 },
    ];
    expect(polygonsIntersect([{ x: 4, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 8 }, { x: 4, y: 8 }], concave)).toBe(false);
    expect(polygonsIntersect([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }], concave)).toBe(true);
  });
});
