import { describe, expect, it } from "vitest";
import type { Line, PathChain, Point, SequenceItem } from "../../types";
import {
  formatExportNumber,
  generateJavaCode,
  generateKotlinCode,
  generatePointsArray,
} from "../codeExporter";

// Whitespace- and comment-insensitive view of the generated code.
const squash = (code: string) => code.replace(/\/\/[^\n]*/g, "").replace(/\s+/g, "");

const start: Point = { x: 61.75, y: 8, heading: "linear", startDeg: 90, endDeg: 90 };

const lines: Line[] = [
  {
    id: "l1",
    name: "Leave start",
    color: "#f00",
    controlPoints: [],
    endPoint: { x: 61.75, y: 36, heading: "linear", startDeg: 90, endDeg: 135 },
  },
  {
    id: "l2",
    name: "To hive",
    color: "#0f0",
    controlPoints: [],
    endPoint: { x: 40, y: 60, heading: "linear", startDeg: 135, endDeg: 180 },
  },
  {
    id: "l3",
    name: "Back up",
    color: "#00f",
    controlPoints: [],
    endPoint: { x: 30, y: 40, heading: "tangential", reverse: true },
  },
  {
    id: "l4",
    name: "Hold heading",
    color: "#ff0",
    controlPoints: [],
    endPoint: { x: 30, y: 20, heading: "constant", degrees: -90 },
  },
  {
    id: "l5",
    name: "Curve home",
    color: "#0ff",
    controlPoints: [
      { x: 50, y: 10 },
      { x: 70, y: 30 },
    ],
    endPoint: { x: 90, y: 12.5, heading: "tangential", reverse: false },
  },
];

const chains: PathChain[] = [
  { id: "c1", name: "Score Preload", color: "#fff", lineIds: ["l1", "l2"] },
  { id: "c2", name: "Reverse", color: "#fff", lineIds: ["l3"] },
  { id: "c3", name: "Hold", color: "#fff", lineIds: ["l4"] },
  { id: "c4", name: "Park", color: "#fff", lineIds: ["l5"] },
];

const sequence: SequenceItem[] = [
  { kind: "path", lineId: "l1" },
  { kind: "path", lineId: "l2" },
  { kind: "wait", id: "w1", name: "Drop pollen", durationMs: 1500 },
  { kind: "path", lineId: "l3" },
  { kind: "path", lineId: "l4" },
  { kind: "path", lineId: "l5" },
];

describe("formatExportNumber", () => {
  it("always writes a double literal", () => {
    expect(formatExportNumber(8)).toBe("8.0");
    expect(formatExportNumber(61.75)).toBe("61.75");
    expect(formatExportNumber(12.34567)).toBe("12.346");
    expect(formatExportNumber(-0.0001)).toBe("0.0");
    expect(formatExportNumber(Number.NaN)).toBe("0.0");
  });
});

describe("generateJavaCode (Pedro Pathing 2.x)", () => {
  it("builds a 2-path chain with linear heading", async () => {
    const code = squash(await generateJavaCode(start, lines, "class", chains, { sequence }));
    expect(code).toContain(
      squash(`ScorePreload = follower.pathBuilder()
        .addPath(new BezierLine(new Pose(61.75, 8.0), new Pose(61.75, 36.0)))
        .setLinearHeadingInterpolation(Math.toRadians(90.0), Math.toRadians(135.0))
        .addPath(new BezierLine(new Pose(61.75, 36.0), new Pose(40.0, 60.0)))
        .setLinearHeadingInterpolation(Math.toRadians(135.0), Math.toRadians(180.0))
        .build();`),
    );
  });

  it("reverses a tangential path after setting the interpolation", async () => {
    const code = squash(await generateJavaCode(start, lines, "class", chains, { sequence }));
    expect(code).toContain(
      squash(`.addPath(new BezierLine(new Pose(40.0, 60.0), new Pose(30.0, 40.0)))
        .setTangentHeadingInterpolation()
        .setReversed()
        .build();`),
    );
  });

  it("writes a constant heading in radians, normalised", async () => {
    const code = squash(await generateJavaCode(start, lines, "class", chains, { sequence }));
    expect(code).toContain(squash(".setConstantHeadingInterpolation(Math.toRadians(-90.0))"));
  });

  it("writes a BezierCurve with both control points", async () => {
    const code = squash(await generateJavaCode(start, lines, "class", chains, { sequence }));
    expect(code).toContain(
      squash(`new BezierCurve(
        new Pose(30.0, 20.0),
        new Pose(50.0, 10.0),
        new Pose(70.0, 30.0),
        new Pose(90.0, 12.5)
      )`),
    );
    // No tangential path is marked reversed unless asked.
    expect(code.match(/\.setReversed\(\)/g)?.length).toBe(1);
  });

  it("ignores a stale reverse flag on non-tangential headings", async () => {
    const stale = [
      {
        ...lines[0],
        endPoint: { ...lines[0].endPoint, reverse: true },
      } as unknown as Line,
    ];
    const code = await generateJavaCode(start, stale, "class", [], {});
    expect(code).not.toContain("setReversed");
  });

  it("starts the full OpMode at the real start pose and heading", async () => {
    const code = await generateJavaCode(start, lines, "full", chains, { sequence });
    const flat = squash(code);
    expect(flat).toContain(
      squash("public static final Pose startPose = new Pose(61.75, 8.0, Math.toRadians(90.0));"),
    );
    expect(flat).toContain(squash("follower.setStartingPose(Paths.startPose);"));
    expect(code).not.toContain("new Pose(72, 8");
    expect(code).toContain('@Autonomous(name = "BIOBUZZ Pedro Auto", group = "Autonomous")');
    expect(code).toContain("import com.pedropathing.follower.Follower;");
    expect(code).toContain("import com.pedropathing.geometry.BezierCurve;");
    expect(code).toContain("import com.pedropathing.geometry.BezierLine;");
    expect(code).toContain("import com.pedropathing.geometry.Pose;");
    expect(code).toContain("import com.pedropathing.paths.PathChain;");
    expect(code).toContain("import com.pedropathing.util.Timer;");
  });

  it("uses the first sequenced path's heading for the start pose", async () => {
    const tangentFirst: Line[] = [
      {
        id: "t1",
        color: "#fff",
        controlPoints: [],
        endPoint: { x: 61.75, y: 30, heading: "tangential", reverse: true },
      },
    ];
    const code = squash(await generateJavaCode(start, tangentFirst, "full", [], {}));
    // Driving +y with the back first: heading 90 + 180 = -90.
    expect(code).toContain(squash("new Pose(61.75, 8.0, Math.toRadians(-90.0))"));
  });

  it("runs the sequence (paths and the wait) in the state machine", async () => {
    const code = await generateJavaCode(start, lines, "full", chains, { sequence });
    const flat = squash(code);
    expect(flat).toContain(squash("follower.followPath(paths.ScorePreload, true);"));
    expect(flat).toContain(squash("if (pathTimer.getElapsedTimeSeconds() >= 1.5)"));
    expect(flat).toContain(squash("follower.followPath(paths.Reverse, true);"));
    expect(flat).toContain(squash("follower.followPath(paths.Hold, true);"));
    expect(flat).toContain(squash("follower.followPath(paths.Park, true);"));
    expect(code.indexOf("paths.ScorePreload")).toBeLessThan(code.indexOf("1.5"));
    expect(code.indexOf("1.5")).toBeLessThan(code.indexOf("paths.Reverse,"));
    expect(code).toContain("if (!follower.isBusy())");
  });

  it("splits a chain the sequence interrupts with a wait", async () => {
    const one: PathChain[] = [
      { id: "main", name: "Main Chain", color: "#fff", lineIds: ["l1", "l2", "l3"] },
    ];
    const seq: SequenceItem[] = [
      { kind: "path", lineId: "l1" },
      { kind: "wait", id: "w", name: "Wait", durationMs: 500 },
      { kind: "path", lineId: "l2" },
      { kind: "path", lineId: "l3" },
    ];
    const code = await generateJavaCode(start, lines.slice(0, 3), "full", one, { sequence: seq });
    expect(code).toContain("public PathChain MainChain;");
    expect(code).toContain("follower.followPath(paths.MainChainPart1, true);");
    expect(code).toContain("follower.followPath(paths.MainChainPart2, true);");
    expect(code).not.toContain("follower.followPath(paths.MainChain, true);");
  });

  it("keeps field names unique and legal", async () => {
    const dupes: PathChain[] = [
      { id: "a", name: "Score", color: "#fff", lineIds: ["l1"] },
      { id: "b", name: "Score", color: "#fff", lineIds: ["l2"] },
      { id: "c", name: "class", color: "#fff", lineIds: ["l3"] },
      { id: "d", name: "2nd park", color: "#fff", lineIds: ["l4"] },
    ];
    const code = await generateJavaCode(start, lines.slice(0, 4), "class", dupes, {});
    expect(code).toContain("public PathChain Score;");
    expect(code).toContain("public PathChain Score_2;");
    expect(code).toContain("public PathChain classPath;");
    expect(code).toContain("public PathChain pathChain42ndpark;");
  });

  it("builds each chain in path order, not the order paths joined the chain", async () => {
    // Path 3 was moved up: lines are [l1, l3, l2] but the chain still lists l1, l2, l3.
    const a = { ...lines[0], id: "a", name: "Seg A" };
    const b = { ...lines[1], id: "b", name: "Seg B" };
    const c = { ...lines[2], id: "c", name: "Seg C" };
    const reordered: Line[] = [a, c, b];
    const chain: PathChain[] = [
      { id: "main", name: "Main Chain", color: "#fff", lineIds: ["a", "b", "c"] },
    ];
    const seq: SequenceItem[] = reordered.map((l) => ({ kind: "path", lineId: l.id! }));
    for (const mode of ["class", "coordinates", "full"] as const) {
      const code = await generateJavaCode(start, reordered, mode, chain, { sequence: seq });
      const order = ["// Seg A\n", "// Seg C\n", "// Seg B\n"].map((label) => code.indexOf(label));
      expect(order.every((i) => i >= 0)).toBe(true);
      expect(order[0]).toBeLessThan(order[1]);
      expect(order[1]).toBeLessThan(order[2]);
      // Each segment starts where the one before it ends.
      expect(squash(code)).toContain(
        squash(`.addPath(new BezierLine(new Pose(61.75, 8.0), new Pose(61.75, 36.0)))
          .setLinearHeadingInterpolation(Math.toRadians(90.0), Math.toRadians(135.0))
          .addPath(new BezierLine(new Pose(61.75, 36.0), new Pose(30.0, 40.0)))
          .setTangentHeadingInterpolation()
          .setReversed()
          .addPath(new BezierLine(new Pose(30.0, 40.0), new Pose(40.0, 60.0)))`),
      );
    }
    const full = await generateJavaCode(start, reordered, "full", chain, { sequence: seq });
    expect(full).toContain("follower.followPath(paths.MainChain, true);");
    expect(full).not.toContain("MainChainPart");
  });

  it("exports a path that is in no chain as a chain of its own", async () => {
    const chain: PathChain[] = [
      { id: "main", name: "Main Chain", color: "#fff", lineIds: ["l1"] },
    ];
    const two = lines.slice(0, 2);
    for (const mode of ["class", "coordinates", "full"] as const) {
      const code = await generateJavaCode(start, two, mode, chain, {});
      expect(code).toContain("// To hive");
      expect(squash(code)).toContain(
        squash("new BezierLine(new Pose(61.75, 36.0), new Pose(40.0, 60.0))"),
      );
    }
    expect(await generateJavaCode(start, two, "class", chain, {})).toContain(
      "public PathChain Tohive;",
    );
    const kotlin = await generateKotlinCode(start, two, "coordinates", chain, {});
    expect(kotlin).toContain("val Tohive: PathChain = follower.pathBuilder()");
  });

  it("still exports every path when all chains are empty", async () => {
    const empty: PathChain[] = [
      { id: "main", name: "Main Chain", color: "#fff", lineIds: [] },
      { id: "gone", name: "Gone", color: "#fff", lineIds: ["missing"] },
    ];
    const one = [{ ...lines[0], name: undefined }];
    for (const mode of ["class", "coordinates"] as const) {
      const code = await generateJavaCode(start, one, mode, empty, {});
      expect(code).toContain("Path1 = follower.pathBuilder()");
      expect(code.match(/\.addPath\(/g)?.length).toBe(1);
      expect(code).not.toContain("MainChain");
    }
  });

  it("does not split a chain at a 0 ms wait", async () => {
    const chain: PathChain[] = [
      { id: "main", name: "Main Chain", color: "#fff", lineIds: ["l1", "l2"] },
    ];
    const seq: SequenceItem[] = [
      { kind: "path", lineId: "l1" },
      { kind: "wait", id: "w", name: "Wait", durationMs: 0 },
      { kind: "path", lineId: "l2" },
    ];
    const code = await generateJavaCode(start, lines.slice(0, 2), "full", chain, { sequence: seq });
    expect(code).toContain("follower.followPath(paths.MainChain, true);");
    expect(code).not.toContain("MainChainPart");
    expect(code).not.toContain("getElapsedTimeSeconds() >=");
  });

  it("never names a field after a type the code uses", async () => {
    const shadowing: PathChain[] = [
      { id: "a", name: "Math", color: "#fff", lineIds: ["l1"] },
      { id: "b", name: "Pose", color: "#fff", lineIds: ["l2"] },
      { id: "c", name: "Timer", color: "#fff", lineIds: ["l3"] },
    ];
    const code = await generateJavaCode(start, lines.slice(0, 3), "full", shadowing, {
      className: "Pose",
    });
    expect(code).toContain("public PathChain MathPath;");
    expect(code).toContain("public PathChain PosePath;");
    expect(code).toContain("public PathChain TimerPath;");
    expect(code).not.toMatch(/PathChain (Math|Pose|Timer);/);
    expect(code).toContain("public class PoseAuto extends OpMode {");
    const kotlin = await generateKotlinCode(start, lines.slice(0, 3), "class", shadowing, {});
    expect(kotlin).toContain("val MathPath: PathChain");
  });

  it("keeps coordinates mode paste-ready", async () => {
    const code = await generateJavaCode(start, lines, "coordinates", chains, { sequence });
    expect(code.startsWith("// Start pose")).toBe(true);
    expect(code).not.toContain("class Paths");
    expect(squash(code)).toContain(squash("ScorePreload = follower.pathBuilder()"));
  });
});

describe("generateKotlinCode (Pedro Pathing 2.x)", () => {
  it("writes Kotlin syntax with double literals", async () => {
    const code = await generateKotlinCode(start, lines, "full", chains, { sequence });
    const flat = squash(code);
    expect(flat).toContain(squash("val startPose = Pose(61.75, 8.0, Math.toRadians(90.0))"));
    expect(flat).toContain(squash("val ScorePreload: PathChain = follower.pathBuilder()"));
    expect(flat).toContain(squash(".addPath(BezierLine(Pose(61.75, 8.0), Pose(61.75, 36.0)))"));
    expect(flat).toContain(squash(".setTangentHeadingInterpolation() .setReversed()"));
    expect(flat).toContain(squash("follower.setStartingPose(Paths.startPose)"));
    expect(flat).toContain(squash("follower.followPath(paths.ScorePreload, true)"));
    expect(code).toContain("class PedroAutonomous : OpMode()");
    expect(code).not.toContain("new Pose");
    expect(code).not.toMatch(/;\s*$/m);
  });
});

describe("generatePointsArray", () => {
  it("lists start, control and end points", () => {
    expect(generatePointsArray(start, [lines[4]])).toBe(
      "[(61.750, 8.0), (50.0, 10.0), (70.0, 30.0), (90.0, 12.500)]",
    );
  });
});
