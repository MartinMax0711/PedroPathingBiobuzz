// Modified for the BIOBUZZ Edition (FTC 2026-2027); based on Pedro-Pathing/Visualizer f54357e.
import type {
  BasePoint,
  Line,
  PathChain,
  Point,
  SequenceItem,
} from "../types";
import { normalizeDeg } from "../biobuzz/field";
import { startHeadingDeg } from "../biobuzz/transform";

/*
 * Code export for Pedro Pathing 2.x (com.pedropathing:ftc 2.0.x).
 *
 * The generated code only uses API that exists in 2.x:
 *   Follower, Pose, BezierLine, BezierCurve, PathChain, util.Timer and
 *   follower.pathBuilder().addPath(...)
 *     .setLinearHeadingInterpolation(start, end)
 *     .setConstantHeadingInterpolation(heading)
 *     .setTangentHeadingInterpolation() [.setReversed()]
 *     .build()
 *
 * Coordinates are written exactly as the visualizer shows them (inches, origin
 * bottom-left). Headings are degrees in the UI and radians in code, so every
 * angle goes through Math.toRadians(...), normalised to (-180, 180].
 *
 * The Java/Kotlin text is laid out here directly, so the output is
 * deterministic and no formatter has to be bundled for it.
 */

export type CodeExportMode = "full" | "class" | "coordinates";
export type CodeExportLanguage = "java" | "kotlin";

export interface CodeExportOptions {
  /** Play order from the sidebar. Decides the start heading and the AUTO routine. */
  sequence?: SequenceItem[];
  /** `@Autonomous(name = …)` shown on the Driver Station (full mode). */
  opModeName?: string;
  /** OpMode class name (full mode). */
  className?: string;
  /** Package of the generated file (full mode). */
  packageName?: string;
}

const DEFAULT_OPMODE_NAME = "BIOBUZZ Pedro Auto";
const DEFAULT_CLASS_NAME = "PedroAutonomous";
const DEFAULT_PACKAGE = "org.firstinspires.ftc.teamcode";

// Java + Kotlin hard keywords and literals: never valid as a field name.
const RESERVED = new Set([
  "abstract", "as", "assert", "boolean", "break", "byte", "case", "catch",
  "char", "class", "const", "continue", "default", "do", "double", "else",
  "enum", "extends", "false", "final", "finally", "float", "for", "fun",
  "goto", "if", "implements", "import", "in", "instanceof", "int",
  "interface", "is", "long", "native", "new", "null", "object", "package",
  "private", "protected", "public", "return", "short", "static", "strictfp",
  "super", "switch", "synchronized", "this", "throw", "throws", "transient",
  "true", "try", "typealias", "typeof", "val", "var", "void", "volatile",
  "when", "while", "yield", "record", "sealed", "permits",
]);

/** Names the generated OpMode/Paths class already uses. */
const TEMPLATE_NAMES = [
  "follower",
  "startPose",
  "paths",
  "Paths",
  "pathTimer",
  "opmodeTimer",
  "pathState",
];

/**
 * Simple type names the generated code refers to. A field with one of these
 * names hides the type (a chain called "Math" breaks `Math.toRadians(...)`), so
 * they are treated like keywords: "Math" becomes "MathPath".
 */
const SHADOWED_TYPE_NAMES = new Set([
  "Math",
  "Pose",
  "BezierLine",
  "BezierCurve",
  "PathChain",
  "Follower",
  "Timer",
  "Constants",
  "TelemetryManager",
  "PanelsTelemetry",
  "Configurable",
  "Autonomous",
  "OpMode",
]);

const isReservedName = (name: string) => RESERVED.has(name) || SHADOWED_TYPE_NAMES.has(name);

function sanitizeIdentifier(input: string | undefined, fallback: string): string {
  const cleaned = (input || "").replace(/[^a-zA-Z0-9]/g, "");
  if (!cleaned) return fallback;
  if (/^[0-9]/.test(cleaned)) return `${fallback}${cleaned}`;
  return cleaned;
}

/** Hands out unique, legal identifiers (two chains called "Score" become Score, Score_2). */
class IdentifierAllocator {
  private readonly used = new Set<string>();

  constructor(taken: string[] = []) {
    taken.forEach((name) => this.used.add(name));
  }

  allocate(preferred: string | undefined, fallback: string): string {
    let base = sanitizeIdentifier(preferred, fallback);
    if (isReservedName(base)) base = `${base}Path`;
    let name = base;
    let counter = 2;
    while (this.used.has(name)) name = `${base}_${counter++}`;
    this.used.add(name);
    return name;
  }
}

/** A number as a double literal valid in Java and Kotlin: 8 -> "8.0", 61.75 -> "61.75". */
export function formatExportNumber(value: number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0.0";
  let rounded = Math.round(numeric * 1000) / 1000;
  if (Object.is(rounded, -0)) rounded = 0;
  const text = String(rounded);
  return /[.eE]/.test(text) ? text : `${text}.0`;
}

const fmt = formatExportNumber;
const radians = (deg: number) => `Math.toRadians(${fmt(normalizeDeg(Number(deg) || 0))})`;

/** Text that is safe inside a `//` comment. */
function commentText(text: string): string {
  return text.replace(/[\r\n]+/g, " ").replace(/\*\//g, "* /").trim();
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

type HeadingSpec =
  | { kind: "linear"; startDeg: number; endDeg: number }
  | { kind: "constant"; deg: number }
  | { kind: "tangential"; reversed: boolean };

interface SegmentSpec {
  lineId: string;
  label: string;
  /** Start, control points, end (inches). */
  points: BasePoint[];
  heading: HeadingSpec;
}

interface ChainSpec {
  varName: string;
  label: string;
  segments: SegmentSpec[];
}

type RoutineStep =
  | { kind: "follow"; chainVar: string; label: string }
  | { kind: "wait"; seconds: number; label: string };

interface ExportModel {
  startPose: { x: number; y: number; headingDeg: number };
  chains: ChainSpec[];
  /** Pieces of a chain the sequence runs separately (e.g. a wait splits it). Full mode only. */
  routineChains: ChainSpec[];
  steps: RoutineStep[];
}

function headingSpec(point: Point): HeadingSpec {
  if (point.heading === "linear") {
    return {
      kind: "linear",
      startDeg: Number(point.startDeg) || 0,
      endDeg: Number(point.endDeg) || 0,
    };
  }
  if (point.heading === "constant") {
    return { kind: "constant", deg: Number(point.degrees) || 0 };
  }
  // The simulator only honours `reverse` for tangential heading, and a stale
  // flag can survive switching to linear/constant, so it is ignored there.
  return { kind: "tangential", reversed: !!point.reverse };
}

function describeSegments(segments: SegmentSpec[]): string {
  return segments.map((s) => s.label).join(" -> ");
}

function buildExportModel(
  startPoint: Point,
  lines: Line[],
  pathChains: PathChain[],
  sequence: SequenceItem[] | undefined,
): ExportModel {
  const linesWithIds = lines.map((line, idx) => ({
    ...line,
    id: line.id || `line-${idx + 1}`,
  }));

  // Each line starts where the previous line (array order) ends, as drawn.
  const segmentById = new Map<string, SegmentSpec>();
  linesWithIds.forEach((line, idx) => {
    const previous = idx === 0 ? startPoint : linesWithIds[idx - 1].endPoint;
    segmentById.set(line.id, {
      lineId: line.id,
      label: line.name?.trim() || `Path ${idx + 1}`,
      points: [previous, ...line.controlPoints, line.endPoint].map((p) => ({
        x: Number(p.x) || 0,
        y: Number(p.y) || 0,
      })),
      heading: headingSpec(line.endPoint),
    });
  });

  const names = new IdentifierAllocator(TEMPLATE_NAMES);

  const sourceChains: PathChain[] =
    pathChains.length > 0
      ? pathChains
      : linesWithIds.map((line, idx) => ({
          id: line.id,
          name: line.name || `Path ${idx + 1}`,
          color: "#22c55e",
          lineIds: [line.id],
        }));

  // Segments of a chain always run in path order (the order they are drawn and
  // played), whatever order they were added to the chain in.
  const pathOrder = new Map(linesWithIds.map((line, idx) => [line.id, idx]));
  const chained = new Set<string>();

  const chains: ChainSpec[] = [];
  sourceChains.forEach((chain, idx) => {
    const ids = Array.from(new Set(chain.lineIds || []))
      .filter((id) => segmentById.has(id))
      .sort((a, b) => pathOrder.get(a)! - pathOrder.get(b)!);
    if (ids.length === 0) return;
    ids.forEach((id) => chained.add(id));
    chains.push({
      varName: names.allocate(chain.name || `PathChain${idx + 1}`, `pathChain${idx + 1}`),
      label: chain.name?.trim() || `Chain ${idx + 1}`,
      segments: ids.map((id) => segmentById.get(id)!),
    });
  });

  // A path that is in no chain still gets exported, as a chain of its own, so
  // no export mode ever drops a path.
  linesWithIds.forEach((line, idx) => {
    if (chained.has(line.id)) return;
    const segment = segmentById.get(line.id)!;
    chains.push({
      varName: names.allocate(segment.label, `path${idx + 1}`),
      label: segment.label,
      segments: [segment],
    });
  });

  // --- AUTO routine from the sequence -------------------------------------
  const locate = new Map<string, { chain: number; pos: number }>();
  chains.forEach((chain, chainIdx) =>
    chain.segments.forEach((segment, pos) => {
      if (!locate.has(segment.lineId)) locate.set(segment.lineId, { chain: chainIdx, pos });
    }),
  );

  const order: SequenceItem[] =
    sequence && sequence.length > 0
      ? sequence
      : linesWithIds.map((line) => ({ kind: "path" as const, lineId: line.id }));

  const steps: RoutineStep[] = [];
  const routineChains: ChainSpec[] = [];
  const routineChainByKey = new Map<string, ChainSpec>();
  const partCount = new Map<number, number>();

  interface Run {
    chain: number; // -1 = line that is in no chain
    start: number;
    end: number;
    ids: string[];
  }
  const state: { run: Run | null } = { run: null };

  const flush = () => {
    const run = state.run;
    state.run = null;
    if (!run) return;

    if (run.chain >= 0) {
      const chain = chains[run.chain];
      if (run.start === 0 && run.end === chain.segments.length - 1) {
        steps.push({
          kind: "follow",
          chainVar: chain.varName,
          label: `${chain.label}: ${describeSegments(chain.segments)}`,
        });
        return;
      }
    }

    const key = run.ids.join("|");
    let part = routineChainByKey.get(key);
    if (!part) {
      const segments = run.ids.map((id) => segmentById.get(id)!);
      let varName: string;
      let label: string;
      if (run.chain >= 0) {
        const base = chains[run.chain];
        const k = (partCount.get(run.chain) ?? 0) + 1;
        partCount.set(run.chain, k);
        varName = names.allocate(`${base.varName}Part${k}`, `${base.varName}Part${k}`);
        label = `${base.label} (part ${k})`;
      } else {
        varName = names.allocate(segments[0].label, `path${routineChains.length + 1}`);
        label = segments[0].label;
      }
      part = { varName, label, segments };
      routineChainByKey.set(key, part);
      routineChains.push(part);
    }
    steps.push({
      kind: "follow",
      chainVar: part.varName,
      label: `${part.label}: ${describeSegments(part.segments)}`,
    });
  };

  for (const item of order) {
    if (item.kind === "wait") {
      // A 0 ms wait (the default for a new wait) does not stop the robot, so it
      // must not split a chain into stop-and-go pieces either.
      const ms = Number(item.durationMs);
      if (Number.isFinite(ms) && ms > 0) {
        flush();
        steps.push({ kind: "wait", seconds: ms / 1000, label: item.name?.trim() || "Wait" });
      }
      continue;
    }
    if (!segmentById.has(item.lineId)) continue;
    const loc = locate.get(item.lineId);
    const run = state.run;
    if (loc && run && run.chain === loc.chain && loc.pos === run.end + 1) {
      run.end = loc.pos;
      run.ids.push(item.lineId);
      continue;
    }
    flush();
    state.run = loc
      ? { chain: loc.chain, start: loc.pos, end: loc.pos, ids: [item.lineId] }
      : { chain: -1, start: 0, end: 0, ids: [item.lineId] };
  }
  flush();

  return {
    startPose: {
      x: Number(startPoint.x) || 0,
      y: Number(startPoint.y) || 0,
      headingDeg: normalizeDeg(startHeadingDeg(startPoint, linesWithIds, sequence)),
    },
    chains,
    routineChains,
    steps,
  };
}

// ---------------------------------------------------------------------------
// Shared emit helpers
// ---------------------------------------------------------------------------

interface Syntax {
  pose: (p: BasePoint) => string;
  newCurve: (type: "BezierLine" | "BezierCurve") => string;
}

const JAVA: Syntax = {
  pose: (p) => `new Pose(${fmt(p.x)}, ${fmt(p.y)})`,
  newCurve: (type) => `new ${type}`,
};

const KOTLIN: Syntax = {
  pose: (p) => `Pose(${fmt(p.x)}, ${fmt(p.y)})`,
  newCurve: (type) => type,
};

function headingCalls(heading: HeadingSpec): string[] {
  switch (heading.kind) {
    case "linear":
      return [
        `.setLinearHeadingInterpolation(${radians(heading.startDeg)}, ${radians(heading.endDeg)})`,
      ];
    case "constant":
      return [`.setConstantHeadingInterpolation(${radians(heading.deg)})`];
    case "tangential":
      return heading.reversed
        ? [".setTangentHeadingInterpolation()", ".setReversed()"]
        : [".setTangentHeadingInterpolation()"];
  }
}

/** `follower.pathBuilder()…build()` with continuation lines at `indent`. */
function builderLines(chain: ChainSpec, syntax: Syntax, indent: string): string[] {
  const out: string[] = [];
  chain.segments.forEach((segment) => {
    out.push(`${indent}// ${commentText(segment.label)}`);
    const type = segment.points.length > 2 ? "BezierCurve" : "BezierLine";
    const poses = segment.points.map(syntax.pose);
    if (poses.length <= 2) {
      out.push(`${indent}.addPath(${syntax.newCurve(type)}(${poses.join(", ")}))`);
    } else {
      out.push(`${indent}.addPath(`);
      out.push(`${indent}    ${syntax.newCurve(type)}(`);
      poses.forEach((pose, i) => {
        out.push(`${indent}        ${pose}${i < poses.length - 1 ? "," : ""}`);
      });
      out.push(`${indent}    )`);
      out.push(`${indent})`);
    }
    headingCalls(segment.heading).forEach((call) => out.push(`${indent}${call}`));
  });
  return out;
}

function startPoseComment(model: ExportModel): string {
  const { x, y, headingDeg } = model.startPose;
  return `Start pose: x ${fmt(x)} in, y ${fmt(y)} in, heading ${fmt(headingDeg)} deg (first path in the sequence).`;
}

function sanitizeClassName(input: string | undefined, fallback: string): string {
  const cleaned = (input || "").replace(/[^a-zA-Z0-9_]/g, "");
  if (!cleaned) return fallback;
  const name = /^[0-9]/.test(cleaned) ? `Auto${cleaned}` : cleaned;
  // The OpMode must not hide a type it uses, nor share its name with the nested `Paths` class.
  return RESERVED.has(name.toLowerCase()) || SHADOWED_TYPE_NAMES.has(name) || name === "Paths"
    ? `${name}Auto`
    : name;
}

function javaString(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ");
}

// ---------------------------------------------------------------------------
// Java
// ---------------------------------------------------------------------------

function javaChainAssignment(chain: ChainSpec, indent: string): string[] {
  return [
    `${indent}${chain.varName} = follower.pathBuilder()`,
    ...builderLines(chain, JAVA, `${indent}    `),
    `${indent}    .build();`,
  ];
}

function javaPathsClass(model: ExportModel, includeRoutineChains: boolean): string[] {
  const { x, y, headingDeg } = model.startPose;
  const all = includeRoutineChains ? [...model.chains, ...model.routineChains] : model.chains;
  const out: string[] = [
    "public static class Paths {",
    `    // ${startPoseComment(model)}`,
    `    public static final Pose startPose = new Pose(${fmt(x)}, ${fmt(y)}, ${radians(headingDeg)});`,
    "",
  ];
  model.chains.forEach((chain) => out.push(`    public PathChain ${chain.varName};`));
  if (includeRoutineChains && model.routineChains.length > 0) {
    out.push("    // Pieces of a chain the AUTO routine runs on their own (a wait splits the chain)");
    model.routineChains.forEach((chain) => out.push(`    public PathChain ${chain.varName};`));
  }
  out.push("", "    public Paths(Follower follower) {");
  all.forEach((chain, idx) => {
    if (idx > 0) out.push("");
    out.push(...javaChainAssignment(chain, "        "));
  });
  out.push("    }", "}");
  return out;
}

function javaRoutine(steps: RoutineStep[], indent: string): string[] {
  const out: string[] = [];
  let state = 0;
  for (const step of steps) {
    if (step.kind === "follow") {
      out.push(
        `${indent}case ${state}: // ${commentText(step.label)}`,
        `${indent}    follower.followPath(paths.${step.chainVar}, true);`,
        `${indent}    setPathState(${state + 1});`,
        `${indent}    break;`,
        `${indent}case ${state + 1}: // wait until ${step.chainVar} is finished`,
        `${indent}    if (!follower.isBusy()) {`,
        `${indent}        setPathState(${state + 2});`,
        `${indent}    }`,
        `${indent}    break;`,
      );
      state += 2;
    } else {
      out.push(
        `${indent}case ${state}: // ${commentText(step.label)} (${fmt(step.seconds)} s)`,
        `${indent}    if (pathTimer.getElapsedTimeSeconds() >= ${fmt(step.seconds)}) {`,
        `${indent}        setPathState(${state + 1});`,
        `${indent}    }`,
        `${indent}    break;`,
      );
      state += 1;
    }
  }
  out.push(`${indent}default: // AUTO routine finished`, `${indent}    break;`);
  return out;
}

function javaFullFile(model: ExportModel, options: CodeExportOptions): string {
  const className = sanitizeClassName(options.className, DEFAULT_CLASS_NAME);
  const opModeName = javaString(options.opModeName || DEFAULT_OPMODE_NAME);
  const pkg = options.packageName || DEFAULT_PACKAGE;
  const paths = javaPathsClass(model, true).map((line) => (line ? `    ${line}` : line));

  return [
    `package ${pkg};`,
    "",
    "import com.bylazar.configurables.annotations.Configurable;",
    "import com.bylazar.telemetry.PanelsTelemetry;",
    "import com.bylazar.telemetry.TelemetryManager;",
    "import com.pedropathing.follower.Follower;",
    "import com.pedropathing.geometry.BezierCurve;",
    "import com.pedropathing.geometry.BezierLine;",
    "import com.pedropathing.geometry.Pose;",
    "import com.pedropathing.paths.PathChain;",
    "import com.pedropathing.util.Timer;",
    "import com.qualcomm.robotcore.eventloop.opmode.Autonomous;",
    "import com.qualcomm.robotcore.eventloop.opmode.OpMode;",
    "import org.firstinspires.ftc.teamcode.pedroPathing.Constants;",
    "",
    "/*",
    " * Generated by Pedro Pathing Visualizer - BIOBUZZ Edition (FTC 2026-2027).",
    " * Pedro Pathing 2.x. Coordinates are inches with the origin at the bottom-left",
    " * corner (audience wall at the bottom, red alliance wall on the left).",
    " * AUTO lasts 30 s: add your mechanism actions to the states below.",
    " */",
    `@Autonomous(name = "${opModeName}", group = "Autonomous")`,
    "@Configurable // Panels",
    `public class ${className} extends OpMode {`,
    "    private TelemetryManager panelsTelemetry; // Panels telemetry",
    "    public Follower follower; // Pedro Pathing follower",
    "    private final Timer pathTimer = new Timer(); // time in the current state",
    "    private final Timer opmodeTimer = new Timer(); // time since START",
    "    private int pathState; // AUTO state machine",
    "    private Paths paths;",
    "",
    "    @Override",
    "    public void init() {",
    "        panelsTelemetry = PanelsTelemetry.INSTANCE.getTelemetry();",
    "",
    "        follower = Constants.createFollower(hardwareMap);",
    "        follower.setStartingPose(Paths.startPose);",
    "",
    "        paths = new Paths(follower); // Build paths",
    "",
    '        panelsTelemetry.debug("Status", "Initialized");',
    "        panelsTelemetry.update(telemetry);",
    "    }",
    "",
    "    @Override",
    "    public void start() {",
    "        opmodeTimer.resetTimer();",
    "        setPathState(0);",
    "    }",
    "",
    "    @Override",
    "    public void loop() {",
    "        follower.update(); // Update Pedro Pathing",
    "        autonomousPathUpdate(); // Update the AUTO state machine",
    "",
    "        // Log values to Panels and the Driver Station",
    '        panelsTelemetry.debug("Path State", pathState);',
    '        panelsTelemetry.debug("AUTO Time", opmodeTimer.getElapsedTimeSeconds());',
    '        panelsTelemetry.debug("X", follower.getPose().getX());',
    '        panelsTelemetry.debug("Y", follower.getPose().getY());',
    '        panelsTelemetry.debug("Heading", Math.toDegrees(follower.getPose().getHeading()));',
    "        panelsTelemetry.update(telemetry);",
    "    }",
    "",
    "    // AUTO routine, in the order of the visualizer's sequence (paths and waits).",
    "    public void autonomousPathUpdate() {",
    "        switch (pathState) {",
    ...javaRoutine(model.steps, "            "),
    "        }",
    "    }",
    "",
    "    // Switches state and restarts the state timer.",
    "    public void setPathState(int state) {",
    "        pathState = state;",
    "        pathTimer.resetTimer();",
    "    }",
    "",
    ...paths,
    "}",
    "",
  ].join("\n");
}

/**
 * Java for Pedro Pathing 2.x.
 * - "coordinates": the PathChain assignments only (paste into a constructor).
 * - "class": a `Paths` class with the start pose and every chain.
 * - "full": a complete iterative OpMode with a state machine that runs the
 *   sequence (paths and waits) in order.
 */
export async function generateJavaCode(
  startPoint: Point,
  lines: Line[],
  exportMode: CodeExportMode = "class",
  pathChains: PathChain[] = [],
  options: CodeExportOptions = {},
): Promise<string> {
  const model = buildExportModel(startPoint, lines, pathChains, options.sequence);
  const { x, y, headingDeg } = model.startPose;

  if (exportMode === "coordinates") {
    const out: string[] = [
      `// ${startPoseComment(model)}`,
      `// Pose startPose = new Pose(${fmt(x)}, ${fmt(y)}, ${radians(headingDeg)});`,
    ];
    model.chains.forEach((chain) => out.push("", ...javaChainAssignment(chain, "")));
    return `${out.join("\n")}\n`;
  }

  if (exportMode === "class") {
    return `${javaPathsClass(model, false).join("\n")}\n`;
  }

  return javaFullFile(model, options);
}

// ---------------------------------------------------------------------------
// Kotlin
// ---------------------------------------------------------------------------

function kotlinChainProperty(chain: ChainSpec, indent: string): string[] {
  return [
    `${indent}val ${chain.varName}: PathChain = follower.pathBuilder()`,
    ...builderLines(chain, KOTLIN, `${indent}    `),
    `${indent}    .build()`,
  ];
}

function kotlinPathsClass(model: ExportModel, includeRoutineChains: boolean): string[] {
  const { x, y, headingDeg } = model.startPose;
  const out: string[] = ["class Paths(follower: Follower) {"];
  model.chains.forEach((chain, idx) => {
    if (idx > 0) out.push("");
    out.push(...kotlinChainProperty(chain, "    "));
  });
  if (includeRoutineChains && model.routineChains.length > 0) {
    out.push("", "    // Pieces of a chain the AUTO routine runs on their own (a wait splits the chain)");
    model.routineChains.forEach((chain, idx) => {
      if (idx > 0) out.push("");
      out.push(...kotlinChainProperty(chain, "    "));
    });
  }
  if (model.chains.length > 0 || (includeRoutineChains && model.routineChains.length > 0)) {
    out.push("");
  }
  out.push(
    "    companion object {",
    `        // ${startPoseComment(model)}`,
    `        val startPose = Pose(${fmt(x)}, ${fmt(y)}, ${radians(headingDeg)})`,
    "    }",
    "}",
  );
  return out;
}

function kotlinRoutine(steps: RoutineStep[], indent: string): string[] {
  const out: string[] = [];
  let state = 0;
  for (const step of steps) {
    if (step.kind === "follow") {
      out.push(
        `${indent}${state} -> { // ${commentText(step.label)}`,
        `${indent}    follower.followPath(paths.${step.chainVar}, true)`,
        `${indent}    setPathState(${state + 1})`,
        `${indent}}`,
        `${indent}${state + 1} -> if (!follower.isBusy) setPathState(${state + 2}) // wait until ${step.chainVar} is finished`,
      );
      state += 2;
    } else {
      out.push(
        `${indent}${state} -> if (pathTimer.elapsedTimeSeconds >= ${fmt(step.seconds)}) setPathState(${state + 1}) // ${commentText(step.label)} (${fmt(step.seconds)} s)`,
      );
      state += 1;
    }
  }
  out.push(`${indent}else -> {} // AUTO routine finished`);
  return out;
}

function kotlinFullFile(model: ExportModel, options: CodeExportOptions): string {
  const className = sanitizeClassName(options.className, DEFAULT_CLASS_NAME);
  const opModeName = javaString(options.opModeName || DEFAULT_OPMODE_NAME).replace(/\$/g, "\\$");
  const pkg = options.packageName || DEFAULT_PACKAGE;
  const paths = kotlinPathsClass(model, true).map((line) => (line ? `    ${line}` : line));

  return [
    `package ${pkg}`,
    "",
    "import com.bylazar.configurables.annotations.Configurable",
    "import com.bylazar.telemetry.PanelsTelemetry",
    "import com.bylazar.telemetry.TelemetryManager",
    "import com.pedropathing.follower.Follower",
    "import com.pedropathing.geometry.BezierCurve",
    "import com.pedropathing.geometry.BezierLine",
    "import com.pedropathing.geometry.Pose",
    "import com.pedropathing.paths.PathChain",
    "import com.pedropathing.util.Timer",
    "import com.qualcomm.robotcore.eventloop.opmode.Autonomous",
    "import com.qualcomm.robotcore.eventloop.opmode.OpMode",
    "import org.firstinspires.ftc.teamcode.pedroPathing.Constants",
    "",
    "/*",
    " * Generated by Pedro Pathing Visualizer - BIOBUZZ Edition (FTC 2026-2027).",
    " * Pedro Pathing 2.x. Coordinates are inches with the origin at the bottom-left",
    " * corner (audience wall at the bottom, red alliance wall on the left).",
    " * AUTO lasts 30 s: add your mechanism actions to the states below.",
    " */",
    `@Autonomous(name = "${opModeName}", group = "Autonomous")`,
    "@Configurable // Panels",
    `class ${className} : OpMode() {`,
    "    private lateinit var panelsTelemetry: TelemetryManager // Panels telemetry",
    "    lateinit var follower: Follower // Pedro Pathing follower",
    "    private lateinit var paths: Paths",
    "    private val pathTimer = Timer() // time in the current state",
    "    private val opmodeTimer = Timer() // time since START",
    "    private var pathState = 0 // AUTO state machine",
    "",
    "    override fun init() {",
    "        panelsTelemetry = PanelsTelemetry.telemetry",
    "",
    "        follower = Constants.createFollower(hardwareMap)",
    "        follower.setStartingPose(Paths.startPose)",
    "",
    "        paths = Paths(follower) // Build paths",
    "",
    '        panelsTelemetry.debug("Status", "Initialized")',
    "        panelsTelemetry.update(telemetry)",
    "    }",
    "",
    "    override fun start() {",
    "        opmodeTimer.resetTimer()",
    "        setPathState(0)",
    "    }",
    "",
    "    override fun loop() {",
    "        follower.update() // Update Pedro Pathing",
    "        autonomousPathUpdate() // Update the AUTO state machine",
    "",
    "        // Log values to Panels and the Driver Station",
    '        panelsTelemetry.debug("Path State", pathState)',
    '        panelsTelemetry.debug("AUTO Time", opmodeTimer.elapsedTimeSeconds)',
    '        panelsTelemetry.debug("X", follower.pose.x)',
    '        panelsTelemetry.debug("Y", follower.pose.y)',
    '        panelsTelemetry.debug("Heading", Math.toDegrees(follower.pose.heading))',
    "        panelsTelemetry.update(telemetry)",
    "    }",
    "",
    "    // AUTO routine, in the order of the visualizer's sequence (paths and waits).",
    "    fun autonomousPathUpdate() {",
    "        when (pathState) {",
    ...kotlinRoutine(model.steps, "            "),
    "        }",
    "    }",
    "",
    "    // Switches state and restarts the state timer.",
    "    fun setPathState(state: Int) {",
    "        pathState = state",
    "        pathTimer.resetTimer()",
    "    }",
    "",
    ...paths,
    "}",
    "",
  ].join("\n");
}

/** Kotlin for Pedro Pathing 2.x; same modes as {@link generateJavaCode}. */
export async function generateKotlinCode(
  startPoint: Point,
  lines: Line[],
  exportMode: CodeExportMode = "class",
  pathChains: PathChain[] = [],
  options: CodeExportOptions = {},
): Promise<string> {
  const model = buildExportModel(startPoint, lines, pathChains, options.sequence);
  const { x, y, headingDeg } = model.startPose;

  if (exportMode === "coordinates") {
    const out: string[] = [
      `// ${startPoseComment(model)}`,
      `// val startPose = Pose(${fmt(x)}, ${fmt(y)}, ${radians(headingDeg)})`,
    ];
    model.chains.forEach((chain) => out.push("", ...kotlinChainProperty(chain, "")));
    return `${out.join("\n")}\n`;
  }

  if (exportMode === "class") {
    return `${kotlinPathsClass(model, false).join("\n")}\n`;
  }

  return kotlinFullFile(model, options);
}

// ---------------------------------------------------------------------------
// Optional Java formatting (only used by the Sequential Command export)
// ---------------------------------------------------------------------------

async function formatJava(source: string): Promise<string> {
  try {
    const [prettier, javaPlugin] = await Promise.all([
      import("prettier/standalone"),
      import("prettier-plugin-java"),
    ]);
    const plugin = (javaPlugin as any).default ?? javaPlugin;
    return await prettier.format(source, { parser: "java", plugins: [plugin] });
  } catch (error) {
    console.warn("Java formatting skipped:", error);
    return source;
  }
}

/**
 * Generate an array of waypoints (not sampled points) along the path
 */
export function generatePointsArray(startPoint: Point, lines: Line[]): string {
  const points: BasePoint[] = [];

  // Add start point
  points.push(startPoint);

  // Add all waypoints (end points and control points)
  lines.forEach((line) => {
    // Add control points for this line
    line.controlPoints.forEach((controlPoint) => {
      points.push(controlPoint);
    });

    // Add end point of this line
    points.push(line.endPoint);
  });

  // Format as string array, removing decimal places for whole numbers
  const pointsString = points
    .map((point) => {
      const x = Number.isInteger(point.x)
        ? point.x.toFixed(1)
        : point.x.toFixed(3);
      const y = Number.isInteger(point.y)
        ? point.y.toFixed(1)
        : point.y.toFixed(3);
      return `(${x}, ${y})`;
    })
    .join(", ");

  return `[${pointsString}]`;
}


/**
 * Generate Sequential Command code
 */
export async function generateSequentialCommandCode(
  startPoint: Point,
  lines: Line[],
  fileName: string | null = null,
  sequence?: SequenceItem[],
): Promise<string> {
  // Determine class name from file name or use default
  const baseName = fileName ? fileName.split(/[\\/]/).pop() || "" : "";
  const className = sanitizeClassName(
    baseName.replace(/\.pp$/i, "").replace(/[^a-zA-Z0-9]/g, "_"),
    "AutoPath",
  );

  // Collect all pose names including control points
  const allPoseDeclarations: string[] = [];
  const allPoseInitializations: string[] = [];

  // Track all pose variable names
  const poseVariableNames: Map<string, string> = new Map();

  // Add start point
  allPoseDeclarations.push("  private Pose startPoint;");
  poseVariableNames.set("startPoint", "startPoint");
  allPoseInitializations.push('    startPoint = pp.get("startPoint");');

  // Process each line
  lines.forEach((line, lineIdx) => {
    const endPointName = line.name
      ? line.name.replace(/[^a-zA-Z0-9]/g, "")
      : `point${lineIdx + 1}`;

    // Add end point declaration
    allPoseDeclarations.push(`  private Pose ${endPointName};`);
    poseVariableNames.set(`point${lineIdx + 1}`, endPointName);
    allPoseInitializations.push(
      `    ${endPointName} = pp.get(\"${endPointName}\");`,
    );

    // Add control points if they exist
    if (line.controlPoints && line.controlPoints.length > 0) {
      line.controlPoints.forEach((_, controlIdx) => {
        const controlPointName = `${endPointName}_control${controlIdx + 1}`;
        allPoseDeclarations.push(`  private Pose ${controlPointName};`);
        allPoseInitializations.push(
          `    ${controlPointName} = pp.get(\"${controlPointName}\");`,
        );
        // Store for use in path building
        poseVariableNames.set(
          `${endPointName}_control${controlIdx + 1}`,
          controlPointName,
        );
      });
    }
  });

  // Generate path chain declarations
  const pathChainDeclarations = lines
    .map((_, idx) => {
      const startPoseName =
        idx === 0
          ? "startPoint"
          : lines[idx - 1]?.name
            ? lines[idx - 1]!.name!.replace(/[^a-zA-Z0-9]/g, "")
            : `point${idx}`;
      const endPoseName = lines[idx].name
        ? lines[idx].name.replace(/[^a-zA-Z0-9]/g, "")
        : `point${idx + 1}`;
      const pathName = `${startPoseName}TO${endPoseName}`;
      return `  private PathChain ${pathName};`;
    })
    .join("\n");

  // Generate ProgressTracker field
  const progressTrackerField = `  private final ProgressTracker progressTracker;`;

  // Generate addCommands calls with event handling; iterate sequence if provided
  const commands: string[] = [];

  const defaultSequence: SequenceItem[] = lines.map((ln, idx) => ({
    kind: "path",
    lineId: ln.id || `line-${idx + 1}`,
  }));
  const seq = sequence && sequence.length ? sequence : defaultSequence;

  seq.forEach((item, idx) => {
    if (item.kind === "wait") {
      commands.push(`        new WaitCommand(${Math.max(0, Math.round(Number(item.durationMs) || 0))})`);
      return;
    }
    const lineIdx = lines.findIndex((l) => l.id === item.lineId);
    if (lineIdx < 0) {
      return; // skip if sequence references a missing line
    }
    const line = lines[lineIdx];
    if (!line) {
      return;
    }
    const startPoseName =
      lineIdx === 0
        ? "startPoint"
        : lines[lineIdx - 1]?.name
          ? lines[lineIdx - 1]!.name!.replace(/[^a-zA-Z0-9]/g, "")
          : `point${lineIdx}`;
    const endPoseName = line.name
      ? line.name.replace(/[^a-zA-Z0-9]/g, "")
      : `point${lineIdx + 1}`;
    const pathName = `${startPoseName}TO${endPoseName}`;
    const pathDisplayName = `${startPoseName}TO${endPoseName}`;

    // Event markers are a legacy field some older .pp files still carry.
    const eventMarkers = (
      line as Line & { eventMarkers?: { name: string; position: number }[] }
    ).eventMarkers;
    if (eventMarkers && eventMarkers.length > 0) {
      // Path has event markers - use reg.java style structure
      // First: InstantCommand to set up tracker
      commands.push(`        new InstantCommand(
            () -> {
              progressTracker.setCurrentChain(${pathName});
              progressTracker.setCurrentPathName("${pathDisplayName}");`);

      // Add event registrations
      eventMarkers.forEach((event) => {
        commands[commands.length - 1] += `
              progressTracker.registerEvent("${event.name}", ${event.position.toFixed(3)});`;
      });

      commands[commands.length - 1] += `
            })`;

      // Second: ParallelRaceGroup for following path with event handling
      commands.push(`        new ParallelRaceGroup(
            new FollowPathCommand(follower, ${pathName}),
            new SequentialCommandGroup(`);

      // Add WaitUntilCommand for each event
      eventMarkers.forEach((event, eventIdx) => {
        if (eventIdx > 0) commands[commands.length - 1] += ",";
        commands[commands.length - 1] += `
                new WaitUntilCommand(() -> progressTracker.shouldTriggerEvent("${event.name}")),
                new InstantCommand(
                    () -> {
                      progressTracker.executeEvent("${event.name}");
                    })`;
      });

      commands[commands.length - 1] += `
            ))`;
    } else {
      // No event markers - simple InstantCommand + FollowPathCommand
      commands.push(`        new InstantCommand(
            () -> {
              progressTracker.setCurrentChain(${pathName});
              progressTracker.setCurrentPathName("${pathDisplayName}");
            }),
        new FollowPathCommand(follower, ${pathName})`);
    }
  });

  // Generate path building
  const pathBuilders = lines
    .map((line, idx) => {
      const startPoseName =
        idx === 0
          ? "startPoint"
          : lines[idx - 1]?.name
            ? lines[idx - 1]!.name!.replace(/[^a-zA-Z0-9]/g, "")
            : `point${idx}`;
      const endPoseName = line.name
        ? line.name.replace(/[^a-zA-Z0-9]/g, "")
        : `point${idx + 1}`;
      const pathName = `${startPoseName}TO${endPoseName}`;

      const isCurve = line.controlPoints.length > 0;
      const curveType = isCurve ? "BezierCurve" : "BezierLine";

      // Build control points string
      let controlPointsStr = "";
      if (isCurve) {
        const controlPoints: string[] = [];
        line.controlPoints.forEach((_, cpIdx) => {
          const controlPointName = `${endPoseName}_control${cpIdx + 1}`;
          controlPoints.push(controlPointName);
        });
        controlPointsStr = controlPoints.join(", ") + ", ";
      }

      // Determine heading interpolation
      let headingConfig = "";
      if (line.endPoint.heading === "constant") {
        headingConfig = `setConstantHeadingInterpolation(${endPoseName}.getHeading())`;
      } else if (line.endPoint.heading === "linear") {
        headingConfig = `setLinearHeadingInterpolation(${startPoseName}.getHeading(), ${endPoseName}.getHeading())`;
      } else {
        headingConfig = `setTangentHeadingInterpolation()`;
      }

      // Build reverse config
      const reverseConfig = line.endPoint.reverse
        ? "\n            .setReversed()"
        : "";

      return `${pathName} =
        follower
            .pathBuilder()
            .addPath(new ${curveType}(${startPoseName}, ${controlPointsStr}${endPoseName}))
            .${headingConfig}${reverseConfig}
            .build();`;
    })
    .join("\n\n    ");

  const sequentialCommandCode = `
package org.firstinspires.ftc.teamcode.Commands.AutoCommands;

import com.pedropathing.follower.Follower;
import com.pedropathing.geometry.BezierCurve;
import com.pedropathing.geometry.BezierLine;
import com.pedropathing.geometry.Pose;
import com.pedropathing.paths.PathChain;
import com.qualcomm.robotcore.hardware.HardwareMap;
import com.seattlesolvers.solverslib.command.SequentialCommandGroup;
import com.seattlesolvers.solverslib.command.ParallelRaceGroup;
import com.seattlesolvers.solverslib.command.WaitUntilCommand;
import com.seattlesolvers.solverslib.command.WaitCommand;
import com.seattlesolvers.solverslib.command.InstantCommand;
import com.seattlesolvers.solverslib.pedroCommand.FollowPathCommand;
import org.firstinspires.ftc.robotcore.external.Telemetry;
import org.firstinspires.ftc.teamcode.Utils.Pathing.ProgressTracker;
import java.io.IOException;
import org.firstinspires.ftc.teamcode.Subsystems.Drivetrain;
import org.firstinspires.ftc.teamcode.Utils.PedroPathReader;

public class ${className} extends SequentialCommandGroup {

  private final Follower follower;
  ${progressTrackerField}

  // Poses
${allPoseDeclarations.join("\n")}

  // Path chains
${pathChainDeclarations}

  public ${className}(final Drivetrain drive, HardwareMap hw, Telemetry telemetry) throws IOException {
    this.follower = drive.getFollower();
    this.progressTracker = new ProgressTracker(follower, telemetry);

    PedroPathReader pp = new PedroPathReader("${fileName ? fileName.split(/[\\/]/).pop() + ".pp" || "AutoPath.pp" : "AutoPath.pp"}", hw.appContext);

    // Load poses
${allPoseInitializations.join("\n")}

    follower.setStartingPose(startPoint);

    buildPaths();

    addCommands(
${commands.join(",\n")});
  }

  public void buildPaths() {
    ${pathBuilders}
  }
}
`;

  return formatJava(sequentialCommandCode);
}
