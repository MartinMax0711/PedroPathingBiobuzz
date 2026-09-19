<!--
  BIOBUZZ field overlay: tile coordinates, wall / zone callouts, AprilTag IDs,
  the G304 start-pose check and path-vs-obstacle collisions.

  Drawn in field inches (viewBox 0 0 141.5 141.5, stretched to the canvas like
  the d3 scales) with presentation attributes only, so the GIF exporter and
  the PNG export can serialize it without the page's CSS. Field y points up,
  SVG y points down: every y goes through Y().
-->
<script lang="ts">
  import type { BasePoint, Line, Point, SequenceItem, Settings, Shape } from "../../types";
  import type { PathCollision } from "../../biobuzz/collision";
  import {
    FIELD,
    CENTER,
    seam,
    TILE_COLUMNS,
    TILE_ROWS,
    ALLIANCE_COLORS,
    LOADING_ZONES,
    GARDENS,
    FLOWERS,
    HIVES,
    STAGED_PIECES,
    POLLEN_DIAMETER,
    HIVE_UNDERSIDE_HEIGHT,
    TAPE_WIDTH,
    robotFootprint,
    checkStartPose,
    polygonsOverlap,
    rectToPolygon,
    type Alliance,
    type Cell,
    type Flower,
    type Rect,
  } from "../../biobuzz/field";
  import { firstSequencedLine, startHeadingDeg } from "../../biobuzz/transform";
  import { getCurvePoint } from "../../utils/math";

  export let settings: Settings;
  export let startPoint: Point;
  export let lines: Line[] = [];
  export let sequence: SequenceItem[] = [];
  export let shapes: Shape[] = [];
  export let collisions: PathCollision[] = [];
  /** False in Multiple Paths mode, where the main robot and its start are hidden. */
  export let showMainRobot = true;
  /**
   * Other robots drawn on the field (Multiple Paths mode) at their start
   * poses; labels keep clear of them like they do of the main robot.
   */
  export let extraRobots: { x: number; y: number; heading: number }[] = [];
  /** Root <svg>, exposed so the GIF exporter can rasterize the overlay. */
  export let svgEl: SVGSVGElement | null = null;
  /** Rendered pixels per field inch; keeps text legible on small screens. */
  export let pxPerInch = 0;

  const FONT = "Poppins, ui-sans-serif, system-ui, sans-serif";
  const HALO = "#0b0f19";
  const OK = "#22c55e";
  const BAD = "#ef4444";
  const Y = (y: number) => FIELD - y;
  const r2 = (n: number) => Math.round(n * 100) / 100;

  type Box = Rect;
  type Poly = BasePoint[];

  interface Label {
    key: string;
    text: string;
    x: number;
    y: number;
    size: number;
    spacing: number;
    rotate: number;
    fill: string;
    weight: number;
  }

  // Typography scale (inches; ~5 px per inch on a laptop screen).
  const TILE_TEXT = { size: 2.3, spacing: 0, weight: 600 };
  const WALL_TEXT = { size: 1.85, spacing: 0.5, weight: 700 };
  const ZONE_TEXT = { size: 1.45, spacing: 0.24, weight: 700 };
  /** Minimum clearance between a wall label and a tile coordinate. */
  const LABEL_GAP = 3.5;
  /**
   * Clearance kept between a tile coordinate and the robot / FLOWERS / POLLEN:
   * along its wall, and (smaller, the bands already keep it off the wall)
   * away from it.
   */
  const TILE_PAD = 1;
  const TILE_PAD_ACROSS = 0.5;
  /** Clearance kept between a wall label and the robot / FLOWERS / POLLEN. */
  const WALL_PAD = 0.8;
  /**
   * A tile coordinate stays within this distance of its tile centre; if it
   * cannot, it is left out rather than drawn off-centre against an obstacle.
   */
  const MAX_TILE_SLIDE = 3;
  /** Extra padding added to robot footprints before they block labels. */
  const ROBOT_BLOCK_PAD = 2.2;

  /** Width estimate for Poppins caps/digits (advance ≈ 0.7 em, a little generous). */
  function textWidth(text: string, size: number, spacing: number) {
    return text.length * (size * 0.7 + spacing) - spacing;
  }

  const boxPoly = (b: Box): Poly => rectToPolygon(b);
  const padBox = (b: Box, px: number, py = px): Box => ({
    x0: b.x0 - px,
    x1: b.x1 + px,
    y0: b.y0 - py,
    y1: b.y1 + py,
  });
  const blocked = (b: Box, blockers: Poly[]) =>
    blockers.some((p) => polygonsOverlap(boxPoly(b), p));

  /** Slide a label along one axis to the free spot closest to `pref`. */
  function slide(
    pref: number,
    min: number,
    max: number,
    make: (c: number) => Box,
    blockers: Poly[] | ((b: Box) => boolean),
  ): number | null {
    if (min > max) return null;
    const isBlocked =
      typeof blockers === "function" ? blockers : (b: Box) => blocked(b, blockers);
    const span = Math.max(pref - min, max - pref);
    for (let d = 0; d <= span + 1e-6; d += 0.25) {
      for (const c of d === 0 ? [pref] : [pref + d, pref - d]) {
        if (c < min - 1e-6 || c > max + 1e-6) continue;
        if (!isBlocked(make(c))) return c;
      }
    }
    return null;
  }

  // Fixed field elements labels must not sit on.
  const pollenBoxes: Poly[] = STAGED_PIECES.filter((p) => p.kind === "pollen").map((p) =>
    boxPoly({
      x0: p.x - POLLEN_DIAMETER / 2,
      x1: p.x + POLLEN_DIAMETER / 2,
      y0: p.y - POLLEN_DIAMETER / 2,
      y1: p.y + POLLEN_DIAMETER / 2,
    }),
  );
  const flowerPolys: Poly[] = FLOWERS.map((f) => f.footprint);
  const zonePolys: Poly[] = [
    ...(["red", "blue"] as Alliance[]).map((a) => boxPoly(LOADING_ZONES[a])),
    ...(["red", "blue"] as Alliance[]).map((a) => boxPoly(GARDENS[a])),
  ];
  const minOf = (poly: Poly, k: "x" | "y") => Math.min(...poly.map((p) => p[k]));
  const maxOf = (poly: Poly, k: "x" | "y") => Math.max(...poly.map((p) => p[k]));

  // Band next to a wall that edge labels live in (depth scales with the text).
  const EDGE_IN = 0.6;
  const EDGE_DEPTH = 2.6;

  const scaled = (t: { size: number; spacing: number; weight: number }, ui: number) => ({
    size: t.size * ui,
    spacing: t.spacing * ui,
    weight: t.weight,
  });

  /**
   * Label bands along a wall (inches from the wall). Wall labels use the outer
   * band; on BIOBUZZ the tile coordinates get their own inner band, so they
   * never compete with AUDIENCE / RED ALLIANCE (or the GARDEN tape and POLLEN)
   * and stay centred on their tiles.
   */
  function bands(ui: number, biobuzz: boolean) {
    const outer = EDGE_IN + EDGE_DEPTH * ui;
    const tileIn = biobuzz ? outer + 0.4 : EDGE_IN;
    const tileOut = tileIn + (outer - EDGE_IN);
    return {
      wallIn: EDGE_IN,
      wallOut: outer,
      tileIn,
      tileOut,
      tileMid: (tileIn + tileOut) / 2,
      /** Half the width of a tile coordinate glyph. */
      tileHalf: (TILE_TEXT.size * ui * 0.7) / 2 + 0.2,
    };
  }

  function layoutEdgeLabels(
    biobuzz: boolean,
    showTiles: boolean,
    showWalls: boolean,
    robots: Poly[],
    centreLine: boolean,
    ui: number,
  ): Label[] {
    const EDGE_OUT = EDGE_IN + EDGE_DEPTH * ui;
    const EDGE_MID = (EDGE_IN + EDGE_OUT) / 2;
    const GAP = LABEL_GAP * ui;
    const band = bands(ui, biobuzz);
    const out: Label[] = [];
    // Wall label boxes: `placed` is padded by GAP, `placedTight` is not.
    const placed: Poly[] = [];
    const placedTight: Poly[] = [];
    const base: Poly[] = [...robots, ...(biobuzz ? [...flowerPolys, ...pollenBoxes] : [])];

    // Wall labels first: they are the most important landmarks.
    if (biobuzz && showWalls) {
      const s = scaled(WALL_TEXT, ui);
      // Keep a little air between wall labels and robots / field elements.
      const wallBlocked = (b: Box, extra: Poly[] = []) =>
        blocked(padBox(b, WALL_PAD), base) || blocked(b, [...zonePolys, ...extra]);
      const blockers = (b: Box) => wallBlocked(b);
      const push = (text: string, x: number, y: number, rotate: number, fill: string) => {
        out.push({ key: `wall-${text}`, text, x, y, rotate, fill, ...s });
      };

      // AUDIENCE: along the audience wall, between the red GARDEN and the FLOWER.
      const aw = textWidth("AUDIENCE", s.size, s.spacing);
      const audienceFlower = FLOWERS.find((f) => f.wall === "audience")!;
      const centreMark = centreLine
        ? [boxPoly({ x0: CENTER - 0.3, x1: CENTER + 0.3, y0: 0, y1: EDGE_OUT })]
        : [];
      const audienceBlockers = (b: Box) => wallBlocked(b, centreMark);
      const ax = slide(
        CENTER,
        GARDENS.red.x1 + 0.8 + aw / 2,
        minOf(audienceFlower.footprint, "x") - 0.8 - aw / 2,
        (c) => ({ x0: c - aw / 2 - 0.3, x1: c + aw / 2 + 0.3, y0: EDGE_IN, y1: EDGE_OUT }),
        audienceBlockers,
      );
      if (ax !== null) {
        push("AUDIENCE", ax, EDGE_MID, 0, "#e2e8f0");
        placed.push(
          boxPoly({ x0: ax - aw / 2 - GAP, x1: ax + aw / 2 + GAP, y0: EDGE_IN, y1: EDGE_OUT }),
        );
        placedTight.push(boxPoly({ x0: ax - aw / 2, x1: ax + aw / 2, y0: EDGE_IN, y1: EDGE_OUT }));
      }

      // Alliance walls: rotated so they read along the wall.
      const sides: [Alliance, number, number][] = [
        ["red", EDGE_MID, -90],
        ["blue", FIELD - EDGE_MID, 90],
      ];
      for (const [alliance, x, rotate] of sides) {
        const text = `${alliance.toUpperCase()} ALLIANCE`;
        const w = textWidth(text, s.size, s.spacing);
        const x0 = x - (EDGE_OUT - EDGE_IN) / 2;
        const x1 = x + (EDGE_OUT - EDGE_IN) / 2;
        const cy = slide(
          CENTER,
          3 + w / 2,
          FIELD - 3 - w / 2,
          (c) => ({ x0, x1, y0: c - w / 2 - 0.3, y1: c + w / 2 + 0.3 }),
          blockers,
        );
        if (cy !== null) {
          push(text, x, cy, rotate, ALLIANCE_COLORS[alliance].fill);
          placed.push(boxPoly({ x0, x1, y0: cy - w / 2 - GAP, y1: cy + w / 2 + GAP }));
          placedTight.push(boxPoly({ x0, x1, y0: cy - w / 2, y1: cy + w / 2 }));
        }
      }
    }

    if (showTiles) {
      const s = scaled(TILE_TEXT, ui);
      const half = band.tileHalf;
      // Stay near the tile centre with ~1 in of air to the robot and field
      // elements; keep clear of wall labels when possible; and leave a single
      // coordinate out when there is no room (the robot / FLOWER marks that
      // tile anyway) instead of pushing it off-centre against an obstacle.
      const fit = (
        pref: number,
        min: number,
        max: number,
        make: (c: number) => Box,
        pad: (b: Box) => Box,
      ) => {
        const lo = Math.max(min, pref - MAX_TILE_SLIDE);
        const hi = Math.min(max, pref + MAX_TILE_SLIDE);
        const hits = (walls: Poly[]) => (b: Box) => blocked(pad(b), base) || blocked(b, walls);
        return slide(pref, lo, hi, make, hits(placed)) ?? slide(pref, lo, hi, make, hits(placedTight));
      };
      TILE_COLUMNS.forEach((letter, i) => {
        const cx = fit(
          (seam(i) + seam(i + 1)) / 2,
          seam(i) + 1.2,
          seam(i + 1) - 1.2,
          (c) => ({ x0: c - half, x1: c + half, y0: band.tileIn, y1: band.tileOut }),
          (b) => padBox(b, TILE_PAD, TILE_PAD_ACROSS),
        );
        if (cx !== null) {
          out.push({ key: `col-${letter}`, text: letter, x: cx, y: band.tileMid, rotate: 0, fill: "#ffffff", ...s });
        }
      });
      TILE_ROWS.forEach((row, i) => {
        const cy = fit(
          (seam(i) + seam(i + 1)) / 2,
          seam(i) + 1.2,
          seam(i + 1) - 1.2,
          (c) => ({ x0: band.tileIn, x1: band.tileOut, y0: c - half, y1: c + half }),
          (b) => padBox(b, TILE_PAD_ACROSS, TILE_PAD),
        );
        if (cy !== null) {
          out.push({ key: `row-${row}`, text: row, x: band.tileMid, y: cy, rotate: 0, fill: "#ffffff", ...s });
        }
      });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Reactive state
  // ---------------------------------------------------------------------------

  $: isBiobuzz = settings?.fieldMap === "biobuzz.svg";
  // Sizes are tuned for ~6 px/in (a 1600×900 window); scale on other canvases.
  $: ui = pxPerInch > 0 ? Math.min(1.3, Math.max(0.85, 6 / pxPerInch)) : 1;
  $: robotLength = settings?.rWidth || 16;
  $: robotWidth = settings?.rHeight || 16;
  $: hasStart = !!startPoint && Number.isFinite(startPoint.x) && Number.isFinite(startPoint.y);
  $: startHeading = hasStart ? startHeadingDeg(startPoint, lines, sequence) : 0;
  $: robotBlockers = [
    ...(showMainRobot && hasStart ? [{ x: startPoint.x, y: startPoint.y, heading: startHeading }] : []),
    ...(extraRobots || []).filter(
      (r) => r && Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.heading),
    ),
  ].map((r) =>
    robotFootprint(r.x, r.y, r.heading, robotLength + ROBOT_BLOCK_PAD, robotWidth + ROBOT_BLOCK_PAD),
  );

  $: edgeLabels = layoutEdgeLabels(
    isBiobuzz,
    settings?.showTileLabels !== false,
    settings?.showFieldLabels !== false,
    robotBlockers,
    isBiobuzz && !!settings?.showZoneLabels,
    ui,
  );

  // G304 start check ----------------------------------------------------------
  $: showStart = isBiobuzz && showMainRobot && hasStart && settings?.showStartCheck !== false;
  $: startCheck = showStart
    ? checkStartPose(startPoint.x, startPoint.y, startHeading, robotLength, robotWidth)
    : null;
  $: startColor = startCheck?.ok ? OK : BAD;
  // Drawn a hair outside the robot image so the dashes are not hidden by it.
  $: startOutline = showStart
    ? robotFootprint(startPoint.x, startPoint.y, startHeading, robotLength + 0.7, robotWidth + 0.7)
    : [];
  $: startTag = showStart ? placeStartTag(startOutline, startPoint, lines, sequence, ui) : null;

  const TAG_H = 2.3;
  const TAG_W = 7.3;

  /** Put the G304 tag at a corner of the footprint that is off the first path. */
  function placeStartTag(
    outline: Poly,
    start: Point,
    allLines: Line[],
    seq: SequenceItem[],
    ui: number,
  ) {
    if (!outline.length) return null;
    const TAG_W_UI = TAG_W * ui;
    const TAG_H_UI = TAG_H * ui;
    const minX = minOf(outline, "x");
    const maxX = maxOf(outline, "x");
    const minY = minOf(outline, "y");
    const maxY = maxOf(outline, "y");
    const gap = 0.6;
    const candidates: Box[] = [
      { x0: minX, x1: minX + TAG_W_UI, y0: maxY + gap, y1: maxY + gap + TAG_H_UI },
      { x0: maxX - TAG_W_UI, x1: maxX, y0: maxY + gap, y1: maxY + gap + TAG_H_UI },
      { x0: minX, x1: minX + TAG_W_UI, y0: minY - gap - TAG_H_UI, y1: minY - gap },
      { x0: maxX - TAG_W_UI, x1: maxX, y0: minY - gap - TAG_H_UI, y1: minY - gap },
      { x0: maxX + gap, x1: maxX + gap + TAG_W_UI, y0: maxY - TAG_H_UI, y1: maxY },
      { x0: minX - gap - TAG_W_UI, x1: minX - gap, y0: maxY - TAG_H_UI, y1: maxY },
    ];
    // Where the robot drives first: keep the tag off that stretch of path.
    const first = firstSequencedLine(allLines, seq);
    const trail: BasePoint[] = [];
    if (first?.endPoint) {
      const curve = [start, ...(first.controlPoints || []), first.endPoint];
      for (let t = 0; t <= 0.5001; t += 0.05) trail.push(getCurvePoint(t, curve));
    }
    const inField = (b: Box) => b.x0 >= 0.3 && b.y0 >= 0.3 && b.x1 <= FIELD - 0.3 && b.y1 <= FIELD - 0.3;
    const onTrail = (b: Box) =>
      trail.some((p) => p.x > b.x0 - 0.6 && p.x < b.x1 + 0.6 && p.y > b.y0 - 0.6 && p.y < b.y1 + 0.6);
    const pick =
      candidates.find((b) => inField(b) && !onTrail(b)) ??
      candidates.find(inField) ??
      candidates[0];
    return pick;
  }

  // Zone callouts ---------------------------------------------------------------
  $: showZones = isBiobuzz && !!settings?.showZoneLabels;
  $: showTags = isBiobuzz && !!settings?.showAprilTags;
  $: zoneLabelSpots = zoneSpots(ui);

  /** Right edge of the POLLEN staged on the red GARDEN (the tape is free past it). */
  const redGardenPollenRight = Math.max(
    ...STAGED_PIECES.filter(
      (p) => p.kind === "pollen" && p.x <= GARDENS.red.x1 && p.y <= GARDENS.red.y1 + POLLEN_DIAMETER,
    ).map((p) => p.x + POLLEN_DIAMETER / 2),
    GARDENS.red.x0,
  );

  /**
   * Where the LOADING ZONE and GARDEN callouts go (red side; blue is the 180°
   * rotation). They stay out of the tile coordinate bands: GARDEN is written
   * on its own tape, past the POLLEN (so it never reads as "GARDEN A" next to
   * the column letter), and LOADING ZONE sits inside its zone past the row
   * numbers.
   */
  function zoneSpots(ui: number) {
    const band = bands(ui, true);
    const zoneHalf = (ZONE_TEXT.size * ui) / 2;
    const lz = LOADING_ZONES.red;
    const tapeInner = lz.x1 - TAPE_WIDTH;
    const lzX = Math.min(
      Math.max(lz.x0 + (lz.x1 - lz.x0) * 0.62, band.tileMid + band.tileHalf + 1.1 + zoneHalf),
      tapeInner - 0.2 - zoneHalf,
    );
    const g = GARDENS.red;
    const gardenX = (redGardenPollenRight + g.x1) / 2;
    const gardenY = (g.y0 + g.y1) / 2;
    return {
      red: { lzX, gardenX, gardenY },
      blue: { lzX: FIELD - lzX, gardenX: FIELD - gardenX, gardenY: FIELD - gardenY },
    };
  }

  const ALLIANCES: Alliance[] = ["red", "blue"];
  const cells: Cell[] = [...HIVES.red.cells, ...HIVES.blue.cells];
  const upCells: Cell[] = cells.filter((c) => c.upAtStart);
  /** Rear-most edge of the HIVE footprint (the HIVE callout sits just beyond). */
  const hiveTop = Math.max(...cells.map((c) => c.rect.y1));

  /** Anchor points inside a CELL: `far` = open end, `tag` = AprilTag cluster. */
  function cellAnchors(cell: Cell) {
    const cx = (cell.rect.x0 + cell.rect.x1) / 2;
    const audience = cell.side === "audience";
    const far = audience ? cell.rect.y0 + 2.6 : cell.rect.y1 - 2.6;
    const tag = cell.tagCenter ?? { x: cx, y: (cell.rect.y0 + cell.rect.y1) / 2 };
    return { cx, far, tag };
  }

  function flowerLabel(f: Flower) {
    const inset = 7.4;
    switch (f.wall) {
      case "audience":
        return { x: f.center.x, y: inset, anchor: "middle" };
      case "rear":
        return { x: f.center.x, y: FIELD - inset, anchor: "middle" };
      case "red":
        return { x: 6.9, y: f.center.y, anchor: "start" };
      default:
        return { x: FIELD - 6.9, y: f.center.y, anchor: "end" };
    }
  }

  // Collisions ------------------------------------------------------------------
  $: collisionShapes = (() => {
    const ids = new Set(collisions.map((c) => c.shapeId));
    return shapes.filter((s) => ids.has(s.id) && s.vertices.length >= 3);
  })();
  $: collisionFootprints = collisions.flatMap((c, ci) => {
    const n = c.samples.length;
    const stride = n > 24 ? 3 : 2;
    return c.samples.filter((_, i) => i % stride === 0 || i === n - 1).map((s, i) => ({
      // Index-based: duplicate obstacle ids in old files must not clash.
      key: `${ci}:${c.lineId}-${c.shapeId}-${i}`,
      corners: s.corners,
    }));
  });

  const pts = (poly: Poly) => poly.map((p) => `${r2(p.x)},${r2(Y(p.y))}`).join(" ");
</script>

<svg
  bind:this={svgEl}
  class="absolute top-0 left-0 w-full h-full rounded-lg pointer-events-none select-none z-[15]"
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 {FIELD} {FIELD}"
  preserveAspectRatio="none"
  aria-hidden="true"
  font-family={FONT}
  text-rendering="geometricPrecision"
>
  <!-- Alliance boundary (G304: robots start fully on their own side) -->
  {#if showZones}
    <line
      x1={CENTER}
      y1="0"
      x2={CENTER}
      y2={FIELD}
      stroke="#ffffff"
      stroke-opacity="0.32"
      stroke-width="0.22"
      stroke-dasharray="1.4 1.1"
    />
  {/if}

  <!-- Obstacles a path runs into -->
  {#each collisionShapes as shape, i (`${shape.id}:${i}`)}
    <polygon
      points={pts(shape.vertices)}
      fill="none"
      stroke={BAD}
      stroke-opacity="0.35"
      stroke-width="1.6"
      stroke-linejoin="round"
    />
    <polygon
      points={pts(shape.vertices)}
      fill={BAD}
      fill-opacity="0.22"
      stroke={BAD}
      stroke-width="0.45"
      stroke-linejoin="round"
    />
  {/each}
  {#each collisionFootprints as fp (fp.key)}
    <polygon
      points={pts(fp.corners)}
      fill={BAD}
      fill-opacity="0.07"
      stroke="#f87171"
      stroke-opacity="0.9"
      stroke-width="0.18"
      stroke-linejoin="round"
    />
  {/each}

  <!-- Zone callouts -->
  {#if showZones}
    <g
      font-size={ZONE_TEXT.size * ui}
      font-weight={ZONE_TEXT.weight}
      letter-spacing={ZONE_TEXT.spacing * ui}
      text-anchor="middle"
      dominant-baseline="central"
      stroke={HALO}
      stroke-opacity="0.75"
      stroke-width="0.42"
      stroke-linejoin="round"
      paint-order="stroke"
    >
      {#each ALLIANCES as alliance (alliance)}
        {@const lz = LOADING_ZONES[alliance]}
        {@const lx = zoneLabelSpots[alliance].lzX}
        {@const ly = (lz.y0 + lz.y1) / 2}
        {@const gx = zoneLabelSpots[alliance].gardenX}
        {@const gy = zoneLabelSpots[alliance].gardenY}
        <text
          x={lx}
          y={Y(ly)}
          dx={(ZONE_TEXT.spacing * ui) / 2}
          transform="rotate({alliance === 'red' ? -90 : 90} {lx} {Y(ly)})"
          fill={alliance === "red" ? "#fecaca" : "#bfdbfe"}>LOADING ZONE</text
        >
        <text
          x={gx}
          y={Y(gy)}
          dx={(ZONE_TEXT.spacing * ui) / 2}
          fill={alliance === "red" ? "#fecaca" : "#bfdbfe"}>GARDEN</text
        >
      {/each}

      {#each FLOWERS as flower (flower.id)}
        {@const at = flowerLabel(flower)}
        <text x={at.x} y={Y(at.y)} text-anchor={at.anchor} fill="#fde68a">FLOWER</text>
      {/each}

      <text x={CENTER} y={Y(hiveTop + 2.1 * ui)} dx={(ZONE_TEXT.spacing * ui) / 2} fill="#f1f5f9"
        >HIVE<tspan dx="0.9" fill="#cbd5e1" font-weight="500" letter-spacing="0.1"
          >({HIVE_UNDERSIDE_HEIGHT} in clearance)</tspan
        ></text
      >
    </g>

    <!-- "UP" marker on each CELL that faces up at the start of the MATCH -->
    {#each upCells as cell (cell.id)}
      {@const a = cellAnchors(cell)}
      <g transform="translate({a.cx} {Y(a.far)}) scale({ui})">
        <rect x="-2.55" y="-0.95" width="5.1" height="1.9" rx="0.95" fill="#f8fafc" fill-opacity="0.94" />
        <path
          d="M -1.75 0.3 L -1.2 -0.3 L -0.65 0.3"
          fill="none"
          stroke="#16a34a"
          stroke-width="0.34"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <text
          x="0.75"
          y="0"
          font-size="1.1"
          font-weight="700"
          letter-spacing="0.12"
          text-anchor="middle"
          dominant-baseline="central"
          fill="#0f172a">UP</text
        >
      </g>
    {/each}
  {/if}

  <!-- AprilTag IDs under each CELL -->
  {#if showTags}
    {#each cells as cell (cell.id)}
      {@const a = cellAnchors(cell)}
      {@const label = cell.aprilTags.join(" ")}
      {@const tw = textWidth(label, 1.15, 0.05)}
      {@const w = tw + 3.4}
      <g transform="translate({a.tag.x} {Y(a.tag.y)}) scale({ui})">
        <rect
          x={-w / 2}
          y="-1"
          width={w}
          height="2"
          rx="0.55"
          fill="#0b1220"
          fill-opacity="0.84"
          stroke="#ffffff"
          stroke-opacity="0.18"
          stroke-width="0.1"
        />
        <!-- tiny AprilTag glyph -->
        <g transform="translate({-w / 2 + 0.55} -0.6)">
          <rect width="1.2" height="1.2" fill="#f8fafc" />
          <rect x="0.2" y="0.2" width="0.8" height="0.8" fill="#0b1220" />
          <rect x="0.4" y="0.4" width="0.25" height="0.25" fill="#f8fafc" />
          <rect x="0.65" y="0.2" width="0.25" height="0.2" fill="#f8fafc" />
        </g>
        <text
          x={0.9}
          y="0"
          font-size="1.15"
          font-weight="600"
          letter-spacing="0.05"
          textLength={tw}
          lengthAdjust="spacingAndGlyphs"
          text-anchor="middle"
          dominant-baseline="central"
          fill="#e2e8f0">{label}</text
        >
      </g>
    {/each}
  {/if}

  <!-- G304 start check -->
  {#if showStart && startCheck && startTag}
    <polygon
      points={pts(startOutline)}
      fill={startColor}
      fill-opacity="0.08"
      stroke={startColor}
      stroke-width="0.32"
      stroke-dasharray="1.1 0.7"
      stroke-linejoin="round"
    />
    <!-- front edge -->
    <line
      x1={r2(startOutline[3].x)}
      y1={r2(Y(startOutline[3].y))}
      x2={r2(startOutline[0].x)}
      y2={r2(Y(startOutline[0].y))}
      stroke={startColor}
      stroke-width="0.5"
      stroke-linecap="round"
    />
    <g transform="translate({startTag.x0} {Y(startTag.y1)}) scale({ui})">
      <rect width={TAG_W} height={TAG_H} rx={TAG_H / 2} fill={startColor} fill-opacity="0.95" />
      <text
        x="0.9"
        y={TAG_H / 2}
        font-size="1.3"
        font-weight="700"
        letter-spacing="0.1"
        textLength="3.7"
        lengthAdjust="spacingAndGlyphs"
        dominant-baseline="central"
        fill="#ffffff">G304</text
      >
      {#if startCheck.ok}
        <path
          d="M 5.2 1.2 L 5.68 1.66 L 6.55 0.7"
          fill="none"
          stroke="#ffffff"
          stroke-width="0.32"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      {:else}
        <path
          d="M 5.45 0.78 L 6.25 1.52 M 6.25 0.78 L 5.45 1.52"
          fill="none"
          stroke="#ffffff"
          stroke-width="0.32"
          stroke-linecap="round"
        />
      {/if}
    </g>
  {/if}

  <!-- Wall and tile labels (on top so they stay legible) -->
  {#if edgeLabels.length}
    <g
      text-anchor="middle"
      dominant-baseline="central"
      stroke={HALO}
      stroke-width="0.5"
      stroke-linejoin="round"
      paint-order="stroke"
    >
      {#each edgeLabels as l (l.key)}
        <text
          x={r2(l.x)}
          y={r2(Y(l.y))}
          dx={l.spacing / 2}
          transform={l.rotate ? `rotate(${l.rotate} ${r2(l.x)} ${r2(Y(l.y))})` : undefined}
          font-size={l.size}
          font-weight={l.weight}
          letter-spacing={l.spacing || undefined}
          fill={l.fill}
          opacity={l.key.startsWith("wall") ? 0.9 : 0.5}
          stroke-opacity="0.85">{l.text}</text
        >
      {/each}
    </g>
  {/if}
</svg>
