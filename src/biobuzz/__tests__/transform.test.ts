import { describe, expect, it } from "vitest";
import type { Line, Point, SequenceItem } from "../../types";
import { getDefaultLines, getDefaultStartPoint } from "../../config/defaults";
import { findPathCollisions } from "../collision";
import { checkStartPose, getBiobuzzObstacles, getStartPresets } from "../field";
import { applyStartPose, rotateProject180, startHeadingDeg } from "../transform";

const start: Point = { x: 61.75, y: 8, heading: "linear", startDeg: 90, endDeg: 90 };
const lines: Line[] = [
  {
    id: "a",
    endPoint: { x: 58, y: 30, heading: "linear", startDeg: 90, endDeg: 135 },
    controlPoints: [{ x: 60, y: 20 }],
    color: "#fff",
  },
  { id: "b", endPoint: { x: 30, y: 40, heading: "constant", degrees: -90 }, controlPoints: [], color: "#fff" },
  { id: "c", endPoint: { x: 20, y: 60, heading: "tangential", reverse: true }, controlPoints: [], color: "#fff" },
];
const sequence: SequenceItem[] = lines.map((l) => ({ kind: "path", lineId: l.id! }));

describe("rotateProject180", () => {
  it("maps red paths onto blue and back", () => {
    const r = rotateProject180(start, lines);
    expect(r.startPoint).toMatchObject({ x: 79.75, y: 133.5, startDeg: -90, endDeg: -90 });
    expect(r.lines[0].endPoint).toMatchObject({ x: 83.5, y: 111.5, startDeg: -90, endDeg: -45 });
    expect(r.lines[0].controlPoints[0]).toEqual({ x: 81.5, y: 121.5 });
    expect(r.lines[1].endPoint).toMatchObject({ degrees: 90 });
    expect(r.lines[2].endPoint).toMatchObject({ heading: "tangential", reverse: true });
    const back = rotateProject180(r.startPoint, r.lines);
    expect(back.startPoint).toMatchObject({ x: start.x, y: start.y, startDeg: 90 });
    expect(back.lines).toEqual(lines);
  });

  it("switching alliance twice keeps coordinates with more than 3 decimals", () => {
    const precise: Line[] = [
      {
        id: "p",
        endPoint: { x: 78.9365, y: 30.1, heading: "linear", startDeg: 90, endDeg: 90 },
        controlPoints: [{ x: 78.9365, y: 19.0515 }],
        color: "#fff",
      },
    ];
    const r = rotateProject180(start, precise);
    expect(r.lines[0].controlPoints[0]).toEqual({ x: 62.5635, y: 122.4485 });
    const back = rotateProject180(r.startPoint, r.lines);
    expect(back.lines).toEqual(precise);
  });
});

describe("applyStartPose", () => {
  it("moves the start and aims the first path's start heading", () => {
    const r = applyStartPose(start, lines, sequence, { x: 8, y: 70.75, headingDeg: 0 });
    expect(r.startPoint).toMatchObject({ x: 8, y: 70.75 });
    expect(r.lines[0].endPoint).toMatchObject({ startDeg: 0, endDeg: 135 });
    expect(r.lines[1]).toBe(lines[1]);
    expect(startHeadingDeg(r.startPoint, r.lines, sequence)).toBe(0);
  });

  it("turns a tangential first path into a linear one that starts at the preset heading", () => {
    const tangential: Line[] = [
      { ...lines[2], id: "t", endPoint: { x: 40, y: 90, heading: "tangential", reverse: false } },
      lines[1],
    ];
    const seq: SequenceItem[] = tangential.map((l) => ({ kind: "path", lineId: l.id! }));
    const pose = getStartPresets(16, 16).find((p) => p.id === "red-alliance-wall")!;
    const r = applyStartPose(start, tangential, seq, pose);
    const ep = r.lines[0].endPoint;
    expect(ep).toMatchObject({ x: 40, y: 90, heading: "linear", startDeg: 0 });
    // Ends with the heading the tangential path had from the new start.
    const tangent = (Math.atan2(90 - pose.y, 40 - pose.x) * 180) / Math.PI;
    expect(ep.heading === "linear" && ep.endDeg).toBeCloseTo(tangent, 3);
    expect("reverse" in ep).toBe(false);
    // The robot now really starts at the preset heading, which is legal.
    const h = startHeadingDeg(r.startPoint, r.lines, seq);
    expect(h).toBe(0);
    expect(checkStartPose(pose.x, pose.y, h, 16, 16).ok).toBe(true);
  });

  it("keeps a tangential first path whose tangent already matches the preset", () => {
    const straight: Line[] = [
      { id: "s", endPoint: { x: 8, y: 70.75, heading: "tangential", reverse: false }, controlPoints: [{ x: 30, y: 70.75 }], color: "#fff" },
      lines[1],
    ];
    const seq: SequenceItem[] = straight.map((l) => ({ kind: "path", lineId: l.id! }));
    const r = applyStartPose(start, straight, seq, { x: 8, y: 70.75, headingDeg: 0 });
    expect(r.lines[0]).toBe(straight[0]);
  });

  it("keeps a heading-holding first path straight", () => {
    const holding: Line[] = [
      { ...lines[0], endPoint: { x: 58, y: 30, heading: "linear", startDeg: 90, endDeg: 90 } },
      ...lines.slice(1),
    ];
    const r = applyStartPose(start, holding, sequence, { x: 79.75, y: 133.5, headingDeg: -90 });
    expect(r.lines[0].endPoint).toMatchObject({ startDeg: -90, endDeg: -90 });
  });
});

describe("applyStartPose on the default single path", () => {
  const presets = getStartPresets(16, 16);
  const obstacles = getBiobuzzObstacles();

  it("moves the default 'drive forward 22 in' path with every preset", () => {
    for (const preset of presets) {
      const sp = getDefaultStartPoint(16, 16);
      const ls = getDefaultLines(16, 16);
      const seq: SequenceItem[] = [{ kind: "path", lineId: ls[0].id! }];
      const r = applyStartPose(sp, ls, seq, preset);
      const ep = r.lines[0].endPoint;
      const h = (preset.headingDeg * Math.PI) / 180;
      expect(ep.x, preset.id).toBeCloseTo(preset.x + 22 * Math.cos(h), 6);
      expect(ep.y, preset.id).toBeCloseTo(preset.y + 22 * Math.sin(h), 6);
      expect(ep).toMatchObject({
        heading: "linear",
        startDeg: preset.headingDeg,
        endDeg: preset.headingDeg,
      });
      expect(r.lines[0].id).toBe(ls[0].id);
      expect(findPathCollisions(r.startPoint, r.lines, obstacles, 16, 16), preset.id).toEqual([]);
      expect(startHeadingDeg(r.startPoint, r.lines, seq)).toBe(preset.headingDeg);
    }
  });

  it("keeps following when presets are chained (and after switching alliance)", () => {
    let sp = getDefaultStartPoint(16, 16);
    let ls = getDefaultLines(16, 16);
    const seq: SequenceItem[] = [{ kind: "path", lineId: ls[0].id! }];
    for (const preset of [...presets, ...presets.slice().reverse()]) {
      ({ startPoint: sp, lines: ls } = applyStartPose(sp, ls, seq, preset));
      const dx = ls[0].endPoint.x - sp.x;
      const dy = ls[0].endPoint.y - sp.y;
      expect(Math.hypot(dx, dy), preset.id).toBeCloseTo(22, 6);
      expect(findPathCollisions(sp, ls, obstacles, 16, 16), preset.id).toEqual([]);
    }
    ({ startPoint: sp, lines: ls } = rotateProject180(sp, ls));
    const next = applyStartPose(sp, ls, seq, presets[2]);
    expect(Math.hypot(next.lines[0].endPoint.x - presets[2].x, next.lines[0].endPoint.y - presets[2].y)).toBeCloseTo(22, 6);
  });

  it("keeps the path's heading mode when it follows the start", () => {
    const sp = getDefaultStartPoint(16, 16);
    const base = getDefaultLines(16, 16)[0];
    const pose = presets.find((p) => p.id === "blue-rear-center")!;
    const constant: Line = { ...base, endPoint: { x: base.endPoint.x, y: base.endPoint.y, heading: "constant", degrees: 90 } };
    const c = applyStartPose(sp, [constant], undefined, pose).lines[0].endPoint;
    expect(c).toMatchObject({ heading: "constant", degrees: -90, x: pose.x, y: pose.y - 22 });
    const tangential: Line = { ...base, endPoint: { x: base.endPoint.x, y: base.endPoint.y, heading: "tangential", reverse: false } };
    const t = applyStartPose(sp, [tangential], undefined, pose).lines[0].endPoint;
    expect(t).toMatchObject({ heading: "tangential", reverse: false, x: pose.x, y: pose.y - 22 });
    // A turning linear path keeps its end heading.
    const turning: Line = { ...base, endPoint: { x: base.endPoint.x, y: base.endPoint.y, heading: "linear", startDeg: 90, endDeg: 45 } };
    const l = applyStartPose(sp, [turning], undefined, pose).lines[0].endPoint;
    expect(l).toMatchObject({ heading: "linear", startDeg: -90, endDeg: 45, x: pose.x, y: pose.y - 22 });
  });

  it("leaves other paths where they are", () => {
    const sp = getDefaultStartPoint(16, 16);
    const base = getDefaultLines(16, 16)[0];
    const pose = presets.find((p) => p.id === "blue-alliance-wall")!;
    type Pose = { x: number; y: number; headingDeg: number };
    const run = (ls: Line[], p: Pose = pose) => applyStartPose(sp, ls, undefined, p).lines[0].endPoint;
    // Not straight ahead of the start.
    expect(run([{ ...base, endPoint: { ...base.endPoint, x: 70 } }])).toMatchObject({ x: 70, y: 30 });
    // Has a control point.
    expect(run([{ ...base, controlPoints: [{ x: 61.75, y: 20 }] }])).toMatchObject({ x: 61.75, y: 30 });
    // Longer than 48 in.
    expect(run([{ ...base, endPoint: { ...base.endPoint, y: 60 } }])).toMatchObject({ x: 61.75, y: 60 });
    // Locked path.
    expect(run([{ ...base, locked: true }])).toMatchObject({ x: 61.75, y: 30 });
    // More than one path.
    const two = applyStartPose(sp, [base, { ...base, id: "b" }], undefined, pose);
    expect(two.lines[0].endPoint).toMatchObject({ x: 61.75, y: 30 });
    // Heading-only edit at the same position: the path stays put.
    const turned = run([base], { x: sp.x, y: sp.y, headingDeg: 45 });
    expect(turned).toMatchObject({ x: 61.75, y: 30, startDeg: 45, endDeg: 45 });
  });
});
