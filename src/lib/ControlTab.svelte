<!-- Modified for the BIOBUZZ Edition (FTC 2026-2027); based on Pedro-Pathing/Visualizer f54357e. -->
<script lang="ts">
  import type {
    Point,
    Line,
    BasePoint,
    Settings,
    Shape,
    SequenceItem,
    PathChain,
  } from "../types";
  import _ from "lodash";
  import { pickPathColor } from "../utils";
  import { DEFAULT_PATH_COLOR } from "../config/defaults";
  import ObstaclesSection from "./components/ObstaclesSection.svelte";
  import RobotPositionDisplay from "./components/RobotPositionDisplay.svelte";
  import StartingPointSection from "./components/StartingPointSection.svelte";
  import PathLineSection from "./components/PathLineSection.svelte";
  import PlaybackControls from "./components/PlaybackControls.svelte";
  import WaitRow from "./components/WaitRow.svelte";
  import { calculatePathTime } from "../utils";
  import { findPathCollisions, type PathCollision } from "../biobuzz/collision";

  export let percent: number;
  export let playing: boolean;
  export let play: () => any;
  export let pause: () => any;
  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let pathChains: PathChain[] = [];
  export let robotWidth: number = 16;
  export let robotHeight: number = 16;
  export let robotXY: BasePoint;
  export let robotHeading: number;
  export let x: d3.ScaleLinear<number, number, number>;
  export let y: d3.ScaleLinear<number, number, number>;
  export let settings: Settings;
  export let handleSeek: (percent: number) => void;
  export let loopAnimation: boolean;
  export let optimizeLine: (lineId: string, targetControlPointIndex?: number) => void;
  export let optimizingLineIds: Record<string, boolean> = {};

  export let shapes: Shape[];
  export let recordChange: () => void;
  /** Robot-footprint overlaps between paths and obstacles (computed in App). */
  export let collisions: PathCollision[] = [];

  $: collisionsByLine = collisions.reduce((map, c) => {
    const list = map.get(c.lineId);
    if (list) list.push(c);
    else map.set(c.lineId, [c]);
    return map;
  }, new Map<string, PathCollision[]>());

  $: autoLimitSeconds = settings?.autoPeriodSeconds ?? 30;

  const makeChainId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const defaultChainName = "Main Chain";

  let selectedChainId = "";
  let chainNameDraft = "";
  let chainColorDraft = DEFAULT_PATH_COLOR;
  let selectedChain: PathChain | null = null;
  let previousSelectedChainId = "";
  let chainOptions: Array<{ id: string; name: string; color: string }> = [];

  const getChainById = (chainId: string): PathChain | null =>
    pathChains.find((chain) => chain.id === chainId) || null;

  function getLinePrimaryChainId(lineId: string): string {
    for (const chain of pathChains) {
      if ((chain.lineIds || []).includes(lineId)) return chain.id;
    }
    return pathChains[0]?.id || "";
  }

  function syncLineColorsToChains() {
    const chainColorById = new Map(pathChains.map((chain) => [chain.id, chain.color || DEFAULT_PATH_COLOR]));
    let changed = false;
    const nextLines = lines.map((line) => {
      const ownerId = getLinePrimaryChainId(line.id || "");
      const targetColor = chainColorById.get(ownerId) || line.color;
      if (line.color !== targetColor) {
        changed = true;
        return { ...line, color: targetColor };
      }
      return line;
    });
    if (changed) {
      lines = nextLines;
    }
  }

  function ensureDefaultChain() {
    if (pathChains.length === 0) {
      pathChains = [
        {
          id: makeChainId(),
          name: defaultChainName,
          color: DEFAULT_PATH_COLOR,
          lineIds: lines.map((ln) => ln.id!).filter(Boolean),
        },
      ];
      selectedChainId = pathChains[0]?.id || "";
      return;
    }

    if (!selectedChainId || !pathChains.some((c) => c.id === selectedChainId)) {
      selectedChainId = pathChains[0]?.id || "";
    }
  }

  /**
   * The colour a chain should have. Missing colours get the default (first
   * chain) or the next unused palette colour. When every path of a chain is
   * drawn in one colour that the chain does not have (e.g. a fresh project:
   * Path 1 is BIOBUZZ yellow but the default chain was created with another
   * colour), the chain adopts the drawn colour, so adding a path never
   * repaints the paths already on the field.
   */
  function chainColor(chain: PathChain, index: number, all: PathChain[]): string {
    const lineColors = new Set(
      (chain.lineIds || [])
        .map((id) => lines.find((l) => l.id === id)?.color)
        .filter(Boolean) as string[],
    );
    if (lineColors.size === 1) {
      const [drawn] = lineColors;
      if (!chain.color || drawn.toLowerCase() !== chain.color.toLowerCase()) return drawn;
    }
    if (chain.color) return chain.color;
    return index === 0
      ? DEFAULT_PATH_COLOR
      : pickPathColor(all.filter((_, i) => i !== index).map((c) => c.color));
  }

  $: {
    lines; // re-check chain colours when the paths change too
    const normalized = pathChains.map((chain, index, all) => ({
      ...chain,
      color: chainColor(chain, index, all),
      lineIds: chain.lineIds || [],
    }));
    if (JSON.stringify(normalized) !== JSON.stringify(pathChains)) {
      pathChains = normalized;
    }
  }

  $: ensureDefaultChain();

  $: selectedChain =
    pathChains.find((chain) => chain.id === selectedChainId) || pathChains[0] || null;

  $: if (selectedChainId !== previousSelectedChainId) {
    chainNameDraft = selectedChain?.name || "";
    previousSelectedChainId = selectedChainId;
  }

  // The swatch always shows the chain's current colour (it can change without
  // the picker: undo, file load, a chain adopting its paths' colour).
  $: chainColorDraft = selectedChain?.color || DEFAULT_PATH_COLOR;

  /** Put a new path in the first chain. The caller records the undo step. */
  function ensureLineInDefaultChain(lineId: string) {
    if (!lineId || !pathChains.length) return;
    assignLineToChain(lineId, pathChains[0].id, false);
  }

  function removeLineFromChains(lineId: string) {
    if (!lineId) return;
    const updated = pathChains.map((chain) => ({
        ...chain,
        lineIds: chain.lineIds.filter((id) => id !== lineId),
      }));
    pathChains = updated;
    ensureDefaultChain();
    syncLineColorsToChains();
  }

  /**
   * Move a path into a chain. `record` = false when the caller changes more
   * (inserting, reordering) and records a single undo step at the end.
   */
  function assignLineToChain(lineId: string, chainId: string, record = true) {
    if (!lineId || !chainId) return;
    pathChains = pathChains.map((chain) => ({
      ...chain,
      lineIds: chain.lineIds.filter((id) => id !== lineId),
    }));

    const target = getChainById(chainId);
    if (!target) return;

    pathChains = pathChains.map((chain) => {
      if (chain.id !== chainId) return chain;
      return {
        ...chain,
        lineIds: Array.from(new Set([...(chain.lineIds || []), lineId])),
      };
    });

    syncLineColorsToChains();
    if (record) recordChange?.();
  }

  /** Next palette colour that no chain uses yet. */
  const nextChainColor = () => pickPathColor(pathChains.map((chain) => chain.color));

  function addPathChain() {
    const newChain: PathChain = {
      id: makeChainId(),
      name: `Chain ${pathChains.length + 1}`,
      color: nextChainColor(),
      lineIds: [],
    };
    pathChains = [...pathChains, newChain];
    selectedChainId = newChain.id;
    recordChange?.();
  }

  function duplicateSelectedPathChain() {
    if (!selectedChain) return;

    const sourceLineIds = selectedChain.lineIds || [];
    const selectedLineSet = new Set(sourceLineIds);
    const lineLookup = new Map(lines.map((line) => [line.id, line]));
    const idMap = new Map<string, string>();
    const clonedLines: Line[] = [];

    // Keep duplication order aligned with timeline, then append any non-sequenced lines.
    const orderedSourceIds: string[] = [];
    sequence.forEach((item) => {
      if (item.kind === "path" && selectedLineSet.has(item.lineId)) {
        orderedSourceIds.push(item.lineId);
      }
    });
    sourceLineIds.forEach((lineId) => {
      if (!orderedSourceIds.includes(lineId)) {
        orderedSourceIds.push(lineId);
      }
    });

    orderedSourceIds.forEach((sourceId, index) => {
      const sourceLine = lineLookup.get(sourceId);
      if (!sourceLine) return;
      const clone = JSON.parse(JSON.stringify(sourceLine)) as Line;
      const newLineId = makeId();
      clone.id = newLineId;
      clone.name = `${sourceLine.name || `Path ${lines.length + index + 1}`} Copy`;
      idMap.set(sourceId, newLineId);
      clonedLines.push(clone);
    });

    const newSequence: SequenceItem[] = [];
    sequence.forEach((item) => {
      newSequence.push(item);
      if (item.kind === "path") {
        const clonedId = idMap.get(item.lineId);
        if (clonedId) {
          newSequence.push({ kind: "path", lineId: clonedId });
        }
      }
    });

    // If chain contains lines currently not present in the timeline, append their clones.
    orderedSourceIds.forEach((sourceId) => {
      const inSequence = sequence.some((item) => item.kind === "path" && item.lineId === sourceId);
      const clonedId = idMap.get(sourceId);
      if (!inSequence && clonedId) {
        newSequence.push({ kind: "path", lineId: clonedId });
      }
    });

    lines = [...lines, ...clonedLines];
    sequence = newSequence;
    syncLinesToSequence(newSequence);

    const duplicateChain: PathChain = {
      id: makeChainId(),
      name: `${selectedChain.name} Copy`,
      color: nextChainColor(),
      lineIds: orderedSourceIds.map((sourceId) => idMap.get(sourceId)).filter(Boolean) as string[],
    };

    const selectedIndex = pathChains.findIndex((chain) => chain.id === selectedChain.id);
    if (selectedIndex >= 0) {
      pathChains = [
        ...pathChains.slice(0, selectedIndex + 1),
        duplicateChain,
        ...pathChains.slice(selectedIndex + 1),
      ];
    } else {
      pathChains = [...pathChains, duplicateChain];
    }

    selectedChainId = duplicateChain.id;
    syncLineColorsToChains();
    recordChange?.();
  }

  function removeSelectedPathChain() {
    if (!selectedChain || pathChains.length <= 1) return;
    const fallbackChainId = pathChains.find((chain) => chain.id !== selectedChain.id)?.id;
    const orphanedLines = [...(selectedChain.lineIds || [])];
    pathChains = pathChains.filter((chain) => chain.id !== selectedChain.id);

    if (fallbackChainId) {
      orphanedLines.forEach((lineId) => assignLineToChain(lineId, fallbackChainId, false));
    }

    selectedChainId = pathChains[0]?.id || "";
    syncLineColorsToChains();
    recordChange?.();
  }

  function updateSelectedChainName() {
    if (!selectedChain) return;
    const nextName = chainNameDraft.trim();
    if (!nextName) return;
    pathChains = pathChains.map((chain) =>
      chain.id === selectedChain.id ? { ...chain, name: nextName } : chain,
    );
    recordChange?.();
  }

  function updateSelectedChainColor() {
    if (!selectedChain) return;
    pathChains = pathChains.map((chain) =>
      chain.id === selectedChain.id ? { ...chain, color: chainColorDraft } : chain,
    );
    syncLineColorsToChains();
    recordChange?.();
  }

  $: chainOptions = pathChains.map((chain) => ({
    id: chain.id,
    name: chain.name,
    color: chain.color || DEFAULT_PATH_COLOR,
  }));

  $: syncLineColorsToChains();

  // Reference exported but unused props to silence Svelte unused-export warnings

  $: robotWidth;
  $: robotHeight;

  // Compute timeline markers for the UI (start of each travel segment)
  $: timePrediction = calculatePathTime(startPoint, lines, settings, sequence);
  $: markers = (() => {
    const _markers: { percent: number; color: string; name: string }[] = [];
    if (
      !timePrediction ||
      !timePrediction.timeline ||
      timePrediction.totalTime <= 0
    )
      return _markers;

    timePrediction.timeline.forEach((ev) => {
      if ((ev as any).type === "travel") {
        const end = (ev as any).endTime as number;
        const pct = (end / timePrediction.totalTime) * 100;
        const lineIndex = (ev as any).lineIndex as number;
        const line = lines[lineIndex];
        const color = line?.color || "#ffffff";
        const name = line?.name || `Path ${lineIndex + 1}`;
        _markers.push({ percent: pct, color, name });
      }
    });

    return _markers;
  })();


  // State for collapsed sections
  let collapsedSections = {
    obstacles: shapes.map(() => true),
    lines: lines.map(() => false),
    controlPoints: lines.map(() => true), // Start with control points collapsed
  };

  // Collapsed state for obstacles (default collapsed)
  let collapsedObstacles = shapes.map(() => true);

  // Reactive statements to update UI state when lines or shapes change from file load
  $: if (lines.length !== collapsedSections.lines.length) {
    collapsedSections = {
      obstacles: collapsedSections.obstacles ?? shapes.map(() => true),
      lines: lines.map(() => false),
      controlPoints: lines.map(() => true),
    };
  }

  // Keep obstacle collapse state aligned with shapes list
  $: if (shapes.length !== collapsedObstacles.length) {
    collapsedObstacles = shapes.map(() => true);
  }

  $: if (!collapsedSections.obstacles || shapes.length !== collapsedSections.obstacles.length) {
    collapsedSections = {
      ...collapsedSections,
      obstacles: shapes.map(() => true),
    };
  }

  const FIELD_MIN = 8;
  const FIELD_MAX = 133.5;
  const NEW_POINT_REACH = 24;
  const clampRound = (n: number) =>
    Math.round(Math.min(FIELD_MAX, Math.max(FIELD_MIN, n)) * 10) / 10;

  /**
   * End point for a new path: within ±24 in of where the path starts (rounded
   * to 0.1 in), trying up to 20 spots and keeping the first one where the
   * robot footprint clears every obstacle, also on the way on to `next` when
   * the new path is inserted before another point. Falls back to the last try.
   */
  function newEndPoint(from: BasePoint, next?: BasePoint): Point {
    const length = Number(settings?.rWidth) || robotWidth || 16;
    const width = Number(settings?.rHeight) || robotHeight || 16;
    const fx = Number(from?.x);
    const fy = Number(from?.y);
    const origin = {
      x: Number.isFinite(fx) ? fx : 72,
      y: Number.isFinite(fy) ? fy : 72,
    };
    const asLine = (end: BasePoint): Line => ({
      id: "candidate",
      color: "",
      controlPoints: [],
      endPoint: { x: end.x, y: end.y, heading: "tangential", reverse: false },
    });
    let candidate: BasePoint = { x: clampRound(origin.x), y: clampRound(origin.y) };
    for (let attempt = 0; attempt < 20; attempt++) {
      candidate = {
        x: clampRound(origin.x + _.random(-NEW_POINT_REACH, NEW_POINT_REACH, true)),
        y: clampRound(origin.y + _.random(-NEW_POINT_REACH, NEW_POINT_REACH, true)),
      };
      // Too short a path is hard to see and grab.
      if (Math.hypot(candidate.x - origin.x, candidate.y - origin.y) < 8) continue;
      const segments = next ? [asLine(candidate), asLine(next)] : [asLine(candidate)];
      if (findPathCollisions(origin as Point, segments, shapes, length, width).length === 0) break;
    }
    return { ...candidate, heading: "tangential", reverse: false };
  }

  /** Colour for a new path: it joins the first chain, so it takes that colour. */
  const newLineColor = () =>
    pathChains[0]?.color || pickPathColor(lines.map((line) => line.color));

  const makeId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  function getWait(i: any) {
    return i as any;
  }

  function insertLineAfter(seqIndex: number) {
    const seqItem = sequence[seqIndex];
    if (!seqItem || seqItem.kind !== "path") return;
    const lineIndex = lines.findIndex((l) => l.id === seqItem.lineId);
    const currentLine = lines[lineIndex];

    // Find the next path item in the sequence after seqIndex
    let nextPathSeqIndex = -1;
    for (let i = seqIndex + 1; i < sequence.length; i++) {
      if (sequence[i].kind === "path") {
        nextPathSeqIndex = i;
        break;
      }
    }

    // If there is no next path in sequence, fall back to addLine behavior (append new randomized point)
    let newPoint: Point | null = null;
    if (nextPathSeqIndex !== -1) {
      const nextLineId = (sequence[nextPathSeqIndex] as any).lineId;
      const nextLine = lines.find((l) => l.id === nextLineId);
      if (
        nextLine &&
        nextLine.endPoint &&
        currentLine &&
        currentLine.endPoint
      ) {
        const a = currentLine.endPoint;
        const b = nextLine.endPoint;
        const midX = (Number(a.x) + Number(b.x)) / 2;
        const midY = (Number(a.y) + Number(b.y)) / 2;
        newPoint = {
          x: midX,
          y: midY,
          heading: "tangential",
          reverse: false,
        };
      }
    }

    if (!newPoint) {
      // fallback: random nearby point from current end
      if (currentLine && currentLine.endPoint) {
        newPoint = {
          x: (currentLine.endPoint.x ?? 72) + _.random(-12, 12),
          y: (currentLine.endPoint.y ?? 72) + _.random(-12, 12),
          heading: "tangential",
          reverse: false,
        };
      } else {
        newPoint = {
          x: _.random(0, 141.5),
          y: _.random(0, 141.5),
          heading: "tangential",
          reverse: false,
        };
      }
    }

    const newLine = {
      id: makeId(),
      endPoint: newPoint,
      controlPoints: [],
      color: newLineColor(),
      name: `Path ${lines.length + 1}`,
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };

    // Insert the new line after the current one and a sequence item after current seq index
    const newLines = [...lines];
    newLines.splice(lineIndex + 1, 0, newLine);
    lines = newLines;

    const newSeq = [...sequence];
    newSeq.splice(seqIndex + 1, 0, { kind: "path", lineId: newLine.id! });
    sequence = newSeq;
    ensureLineInDefaultChain(newLine.id!);

    collapsedSections.lines.splice(lineIndex + 1, 0, false);
    collapsedSections.controlPoints.splice(lineIndex + 1, 0, true);

    // Force reactivity
    collapsedSections = { ...collapsedSections };
    recordChange?.();
  }

  // Insert a midpoint between this path and the next path in sequence
  function insertMidpointAfter(seqIndex: number) {
    const seqItem = sequence[seqIndex];
    if (!seqItem || seqItem.kind !== "path") return;
    const lineIndex = lines.findIndex((l) => l.id === seqItem.lineId);
    const currentLine = lines[lineIndex];

    // Find the next path in sequence
    let nextPathSeqIndex = -1;
    for (let i = seqIndex + 1; i < sequence.length; i++) {
      if (sequence[i].kind === "path") {
        nextPathSeqIndex = i;
        break;
      }
    }

    if (nextPathSeqIndex === -1) {
      // no next path -> do nothing or fallback
      return;
    }

    const nextLineId = (sequence[nextPathSeqIndex] as any).lineId;
    const nextLine = lines.find((l) => l.id === nextLineId);
    if (!currentLine || !nextLine) return;

    const a = currentLine.endPoint;
    const b = nextLine.endPoint;
    const midX = (Number(a.x) + Number(b.x)) / 2;
    const midY = (Number(a.y) + Number(b.y)) / 2;

    const newLine: Line = {
      id: makeId(),
      endPoint: {
        x: midX,
        y: midY,
        heading: "tangential",
        reverse: false,
      },
      controlPoints: [],
      color: newLineColor(),
      name: `Path ${lines.length + 1}`,
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };

    // Insert into lines right after current line index
    const newLines = [...lines];
    newLines.splice(lineIndex + 1, 0, newLine);
    lines = newLines;

    // Insert into sequence right after seqIndex
    const newSeq = [...sequence];
    newSeq.splice(seqIndex + 1, 0, { kind: "path", lineId: newLine.id! });
    sequence = newSeq;
    ensureLineInDefaultChain(newLine.id!);

    collapsedSections.lines.splice(lineIndex + 1, 0, false);
    collapsedSections.controlPoints.splice(lineIndex + 1, 0, true);

    collapsedSections = { ...collapsedSections };
    recordChange();
  }

  function removeLine(idx: number) {
    const removedId = lines[idx]?.id;
    let _lns = lines;
    lines.splice(idx, 1);
    lines = _lns;
    if (removedId) {
      sequence = sequence.filter(
        (s) => s.kind === "wait" || s.lineId !== removedId,
      );
      removeLineFromChains(removedId);
    }
    collapsedSections.lines.splice(idx, 1);
    collapsedSections.controlPoints.splice(idx, 1);
    recordChange();
  }

  function addLine() {
    // The new path is appended, so it starts where the last path ends.
    const from = lines.length ? lines[lines.length - 1].endPoint : startPoint;
    const newLine: Line = {
      id: makeId(),
      name: `Path ${lines.length + 1}`,
      endPoint: newEndPoint(from),
      controlPoints: [],
      color: newLineColor(),
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };
    lines = [...lines, newLine];
    sequence = [...sequence, { kind: "path", lineId: newLine.id! }];
    ensureLineInDefaultChain(newLine.id!);
    collapsedSections.lines.push(false);
    collapsedSections.controlPoints.push(true);
    recordChange();
  }

  // Add a control point to the line represented by `seqIndex` in the sequence
  function addControlPointToLine(seqIndex: number) {
    const seqItem = sequence[seqIndex];
    if (!seqItem || seqItem.kind !== "path") return;
    const lineIndex = lines.findIndex((l) => l.id === seqItem.lineId);
    if (lineIndex === -1) return;
    const line = lines[lineIndex];
    line.controlPoints = line.controlPoints || [];
    const prevPt = lineIndex === 0 ? startPoint : lines[lineIndex - 1].endPoint;
    const endPt = line.endPoint || { x: 72, y: 72 };
    const mx = ((prevPt?.x ?? 72) + (endPt?.x ?? 72)) / 2;
    const my = ((prevPt?.y ?? 72) + (endPt?.y ?? 72)) / 2;
    line.controlPoints.push({
      x: mx + _.random(-4, 4),
      y: my + _.random(-4, 4),
    });
    collapsedSections.controlPoints[lineIndex] = false;
    lines = [...lines];
    collapsedSections = { ...collapsedSections };
    recordChange?.();
  }

  // Add a control point to the last path in `lines` (fallback: create a new line)
  function addControlPointToLastLine() {
    if (!lines || lines.length === 0) {
      // No lines exist: create a new line instead
      addLine();
      return;
    }

    // Prefer adding to the first line whose control points are expanded (user is focusing it)
    let targetIdx = collapsedSections.controlPoints.findIndex(
      (v) => v === false,
    );
    if (targetIdx === -1) targetIdx = lines.length - 1;

    const line = lines[targetIdx];
    line.controlPoints = line.controlPoints || [];
    // Insert a control point near the line midpoint for convenience
    const prevPt = targetIdx === 0 ? startPoint : lines[targetIdx - 1].endPoint;
    const endPt = line.endPoint || { x: 72, y: 72 };
    const mx = ((prevPt?.x ?? 72) + (endPt?.x ?? 72)) / 2;
    const my = ((prevPt?.y ?? 72) + (endPt?.y ?? 72)) / 2;
    line.controlPoints.push({
      x: mx + _.random(-4, 4),
      y: my + _.random(-4, 4),
    });
    // Ensure control points UI is expanded for this line
    collapsedSections.controlPoints[targetIdx] = false;
    lines = [...lines];
    collapsedSections = { ...collapsedSections };
    recordChange?.();
  }

  function addWait() {
    const wait = {
      kind: "wait",
      id: makeId(),
      name: "Wait",
      durationMs: 0,
      locked: false,
    } as SequenceItem;
    sequence = [...sequence, wait];
    recordChange?.();
  }

  function addWaitAtStart() {
    const wait = {
      kind: "wait",
      id: makeId(),
      name: "Wait",
      durationMs: 0,
      locked: false,
    } as SequenceItem;
    sequence = [wait, ...sequence];
    recordChange?.();
  }

  function addPathAtStart() {
    const newLine: Line = {
      id: makeId(),
      name: `Path ${lines.length + 1}`,
      endPoint: newEndPoint(startPoint, lines[0]?.endPoint),
      controlPoints: [],
      color: newLineColor(),
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };
    lines = [newLine, ...lines];
    sequence = [{ kind: "path", lineId: newLine.id! }, ...sequence];
    ensureLineInDefaultChain(newLine.id!);
    collapsedSections.lines = [false, ...collapsedSections.lines];
    collapsedSections.controlPoints = [
      true,
      ...collapsedSections.controlPoints,
    ];
    recordChange();
  }

  function insertWaitAfter(seqIndex: number) {
    const newSeq = [...sequence];
    newSeq.splice(seqIndex + 1, 0, {
      kind: "wait",
      id: makeId(),
      name: "Wait",
      durationMs: 0,
      locked: false,
    });
    sequence = newSeq;
    recordChange?.();
  }

  function insertPathAfter(seqIndex: number) {
    // In play order the new path starts at the last path end before it and
    // leads on to the next path's end.
    const pathIdsBefore = sequence
      .slice(0, seqIndex + 1)
      .filter((item) => item.kind === "path")
      .map((item) => (item as { lineId: string }).lineId);
    const prevLine = lines.find((l) => l.id === pathIdsBefore[pathIdsBefore.length - 1]);
    const nextItem = sequence
      .slice(seqIndex + 1)
      .find((item) => item.kind === "path") as { lineId: string } | undefined;
    const nextLine = nextItem ? lines.find((l) => l.id === nextItem.lineId) : undefined;

    const newLine: Line = {
      id: makeId(),
      name: `Path ${lines.length + 1}`,
      endPoint: newEndPoint(prevLine?.endPoint ?? startPoint, nextLine?.endPoint),
      controlPoints: [],
      color: newLineColor(),
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };

    // Add the new line to the lines array (with its UI state)
    lines = [...lines, newLine];
    collapsedSections.lines.push(false);
    collapsedSections.controlPoints.push(true);

    // Insert the new path in the sequence after the wait
    const newSeq = [...sequence];
    newSeq.splice(seqIndex + 1, 0, { kind: "path", lineId: newLine.id! });
    sequence = newSeq;
    ensureLineInDefaultChain(newLine.id!);

    // Keep `lines` in play order: the field drawing chains each path from the
    // previous entry in `lines`, while timing follows `sequence`.
    syncLinesToSequence(newSeq);
    recordChange();
  }

  function syncLinesToSequence(newSeq: SequenceItem[]) {
    const pathOrder = newSeq
      .filter((item) => item.kind === "path")
      .map((item) => item.lineId);

    const indexedLines = lines.map((line, idx) => ({
      line,
      collapsed: collapsedSections.lines[idx],
      control: collapsedSections.controlPoints[idx],
    }));

    const byId = new Map(indexedLines.map((entry) => [entry.line.id, entry]));
    const reordered: typeof indexedLines = [];

    pathOrder.forEach((id) => {
      const entry = byId.get(id);
      if (entry) {
        reordered.push(entry);
        byId.delete(id);
      }
    });

    // Append any lines that are not currently in the sequence to preserve data
    reordered.push(...byId.values());

    lines = reordered.map((entry) => entry.line);
    collapsedSections = {
      ...collapsedSections,
      lines: reordered.map((entry) => entry.collapsed ?? false),
      controlPoints: reordered.map((entry) => entry.control ?? true),
    };
    // No collapsedEventMarkers to update
  }

  function moveSequenceItem(seqIndex: number, delta: number) {
    const targetIndex = seqIndex + delta;
    if (targetIndex < 0 || targetIndex >= sequence.length) return;

    // Prevent moving if either the source or target is a locked path or a locked wait
    const isLockedSequenceItem = (index: number) => {
      const it = sequence[index];
      if (!it) return false;
      if (it.kind === "path") {
        const ln = lines.find((l) => l.id === it.lineId);
        return ln?.locked ?? false;
      }
      // wait
      if (it.kind === "wait") {
        return (it as any).locked ?? false;
      }
      return false;
    };

    if (isLockedSequenceItem(seqIndex) || isLockedSequenceItem(targetIndex))
      return;

    const newSeq = [...sequence];
    const [item] = newSeq.splice(seqIndex, 1);
    newSeq.splice(targetIndex, 0, item);
    sequence = newSeq;

    syncLinesToSequence(newSeq);
    recordChange?.();
  }
</script>

<div class="flex-1 flex flex-col justify-start items-center gap-2 h-full">
  <div
    class="flex flex-col justify-start items-start w-full rounded-lg bg-neutral-50 dark:bg-neutral-900 shadow-md p-4 overflow-y-scroll overflow-x-hidden h-full gap-6"
  >
    <ObstaclesSection bind:shapes bind:collapsedObstacles {recordChange} />

    <RobotPositionDisplay {robotXY} {robotHeading} {x} {y} />

    <StartingPointSection
      bind:startPoint
      bind:lines
      {sequence}
      {settings}
      {recordChange}
      autoTime={timePrediction?.totalTime ?? 0}
      {autoLimitSeconds}
    />

    <div class="w-full rounded-md border border-neutral-200 dark:border-neutral-700 p-3 bg-white dark:bg-neutral-800">
      <div class="flex items-center gap-2 mb-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-300">Path Chains</p>
        <select
          bind:value={selectedChainId}
          class="flex-1 px-2 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900"
        >
          {#each pathChains as chain (chain.id)}
            <option value={chain.id}>{chain.name} ({(chain.lineIds || []).length})</option>
          {/each}
        </select>
        <button on:click={addPathChain} class="px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">New</button>
        <button on:click={duplicateSelectedPathChain} class="px-2 py-1 text-xs rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">Duplicate</button>
        <button
          on:click={removeSelectedPathChain}
          disabled={pathChains.length <= 1}
          class="px-2 py-1 text-xs rounded bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200 disabled:opacity-40"
        >
          Remove
        </button>
      </div>

      {#if selectedChain}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
          <div class="flex items-center gap-2">
            <input
              type="text"
              bind:value={chainNameDraft}
              on:input={updateSelectedChainName}
              class="flex-1 px-2 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900"
              placeholder="Chain name"
            />
          </div>

          <div class="flex items-center gap-2">
            <input
              type="color"
              bind:value={chainColorDraft}
              on:input={updateSelectedChainColor}
              class="w-10 h-8 rounded border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900"
              title="Path chain color"
            />
            <span class="text-xs text-neutral-500 dark:text-neutral-400">Path color</span>
          </div>
        </div>
      {/if}
    </div>

    <!-- Unified sequence render: paths and waits -->
    {#each sequence as item, sIdx}
      <div class="w-full">
        {#if item.kind === "path"}
          {#each lines.filter((l) => l.id === item.lineId) as ln (ln.id)}
            <PathLineSection
              bind:line={ln}
              idx={lines.findIndex((l) => l.id === ln.id)}
              bind:lines
              bind:collapsed={
                collapsedSections.lines[lines.findIndex((l) => l.id === ln.id)]
              }
              bind:collapsedControlPoints={
                collapsedSections.controlPoints[
                  lines.findIndex((l) => l.id === ln.id)
                ]
              }
              onRemove={() =>
                removeLine(lines.findIndex((l) => l.id === ln.id))}
              onInsertAfter={() => addControlPointToLine(sIdx)}
              onInsertMidpoint={() => insertMidpointAfter(sIdx)}
              onAddWaitAfter={() => insertWaitAfter(sIdx)}
              onMoveUp={() => moveSequenceItem(sIdx, -1)}
              onMoveDown={() => moveSequenceItem(sIdx, 1)}
              canMoveUp={sIdx !== 0}
              canMoveDown={sIdx !== sequence.length - 1}
              optimizeLine={optimizeLine}
              optimizing={optimizingLineIds?.[ln.id ?? ""] ?? false}
              chainOptions={chainOptions}
              selectedChainId={getLinePrimaryChainId(ln.id || "")}
              onChainChange={(chainId) => assignLineToChain(ln.id || "", chainId)}
              collisions={collisionsByLine.get(ln.id ?? "") ?? []}
              {recordChange}
            />
          {/each}
        {:else}
          <WaitRow
            name={getWait(item).name}
            durationMs={getWait(item).durationMs}
            locked={getWait(item).locked ?? false}
            onToggleLock={() => {
              const newSeq = [...sequence];
              newSeq[sIdx] = {
                ...getWait(item),
                locked: !(getWait(item).locked ?? false),
              };
              sequence = newSeq;
              recordChange?.();
            }}
            onChange={(newName, newDuration) => {
              const newSeq = [...sequence];
              newSeq[sIdx] = {
                ...getWait(item),
                name: newName,
                durationMs: Math.max(0, Number(newDuration) || 0),
              };
              sequence = newSeq;
              recordChange?.();
            }}
            onRemove={() => {
              const newSeq = [...sequence];
              newSeq.splice(sIdx, 1);
              sequence = newSeq;
              recordChange?.();
            }}
            onInsertAfter={() => {
              const newSeq = [...sequence];
              newSeq.splice(sIdx + 1, 0, {
                kind: "wait",
                id: makeId(),
                name: "Wait",
                durationMs: 0,
                locked: false,
              });
              sequence = newSeq;
              recordChange?.();
            }}
            onAddPathAfter={() => insertPathAfter(sIdx)}
            onMoveUp={() => moveSequenceItem(sIdx, -1)}
            onMoveDown={() => moveSequenceItem(sIdx, 1)}
            canMoveUp={sIdx !== 0}
            canMoveDown={sIdx !== sequence.length - 1}
          />
        {/if}
      </div>
    {/each}

    <!-- Add Line Button -->
    <div class="flex flex-row items-center gap-4">
      <button
        on:click={addLine}
        class="font-semibold text-green-500 text-sm flex flex-row justify-start items-center gap-1"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width={2}
          stroke="currentColor"
          class="size-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
        <p>Add Path</p>
      </button>

      <button
        on:click={addWait}
        class="font-semibold text-[#E1461B] text-sm flex flex-row justify-start items-center gap-1"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="size-5"
        >
          <circle cx="12" cy="12" r="9" />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 7v5l3 2"
          />
        </svg>
        <p>Add Wait</p>
      </button>
    </div>
  </div>

  <PlaybackControls
    bind:playing
    {play}
    {pause}
    bind:percent
    {handleSeek}
    bind:loopAnimation
    {markers}
    totalTime={timePrediction?.totalTime ?? 0}
    {autoLimitSeconds}
  />
</div>
