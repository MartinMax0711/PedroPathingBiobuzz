/**
 * Generates public/fields/biobuzz.svg – a detailed top-down BIOBUZZ field
 * drawn from the geometry in src/biobuzz/field.ts (1 SVG unit = 1 inch).
 *
 *   npm run field:build
 *
 * Requires Node ≥ 22.18 (built-in TypeScript type stripping).
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALLIANCE_COLORS,
  CELL_WIDTH,
  CENTER,
  FIELD,
  FLOWERS,
  FLOWER_CHAMFER,
  FLOWER_DEPTH,
  FLOWER_RING_OFFSET,
  FLOWER_WIDTH,
  GARDENS,
  HIVES,
  HIVE_FRAME_RAILS,
  HIVE_LEGS,
  LOADING_ZONES,
  NECTAR_DIAMETER,
  POLLEN_DIAMETER,
  STAGED_PIECES,
  TAPE_WIDTH,
  TILE,
  type Alliance,
  type Cell,
  type Flower,
  type Rect,
} from "../src/biobuzz/field.ts";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../public/fields/biobuzz.svg");
const PX = 2048; // intrinsic raster size used when drawn onto a canvas (GIF export)
const CROSSBAR = 1.5; // top crossbar tube width

const f = (n: number) => (Math.round(n * 1000) / 1000).toString();
/** Field y (up) → SVG y (down). */
const Y = (y: number) => FIELD - y;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rect = (r: Rect, attrs: string) =>
  `<rect x="${f(r.x0)}" y="${f(Y(r.y1))}" width="${f(r.x1 - r.x0)}" height="${f(r.y1 - r.y0)}" ${attrs}/>`;

const poly = (pts: { x: number; y: number }[], attrs: string) =>
  `<polygon points="${pts.map((p) => `${f(p.x)},${f(Y(p.y))}`).join(" ")}" ${attrs}/>`;

// ---------------------------------------------------------------------------
// defs
// ---------------------------------------------------------------------------

function defs(): string {
  const r = rng(2027);
  const specks: string[] = [];
  // Very faint foam texture: kept sparse so GIF exports stay small.
  for (let i = 0; i < 28; i++) {
    const light = r() > 0.55;
    specks.push(
      `<circle cx="${f(r() * 6)}" cy="${f(r() * 6)}" r="${f(0.04 + r() * 0.04)}" fill="${light ? "#ffffff" : "#000000"}" opacity="${f(light ? 0.035 + r() * 0.03 : 0.08 + r() * 0.06)}"/>`,
    );
  }
  const ball = (id: string, hi: string, mid: string, lo: string) => `
    <radialGradient id="${id}" cx="0.36" cy="0.32" r="0.75">
      <stop offset="0" stop-color="${hi}"/>
      <stop offset="0.45" stop-color="${mid}"/>
      <stop offset="1" stop-color="${lo}"/>
    </radialGradient>`;
  return `<defs>
    <pattern id="speckle" width="6" height="6" patternUnits="userSpaceOnUse">${specks.join("")}</pattern>
    <radialGradient id="tileSheen" cx="0.3" cy="0.25" r="0.95">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.045"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.06"/>
    </radialGradient>
    <linearGradient id="wallShadeV" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="wallShadeH" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="tapeSheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.16"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.12"/>
    </linearGradient>
    <linearGradient id="metalV" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#6b7078"/>
      <stop offset="0.35" stop-color="#d9dde2"/>
      <stop offset="0.6" stop-color="#aab0b8"/>
      <stop offset="1" stop-color="#5d626a"/>
    </linearGradient>
    <linearGradient id="metalH" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6b7078"/>
      <stop offset="0.35" stop-color="#e3e6ea"/>
      <stop offset="0.6" stop-color="#b3b9c0"/>
      <stop offset="1" stop-color="#5d626a"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7cf6b"/>
      <stop offset="0.55" stop-color="#e7a93b"/>
      <stop offset="1" stop-color="#b87a1c"/>
    </linearGradient>
    <radialGradient id="pipe" cx="0.35" cy="0.35" r="0.8">
      <stop offset="0" stop-color="#b7ec8f"/>
      <stop offset="0.5" stop-color="#5fb536"/>
      <stop offset="1" stop-color="#2f6a17"/>
    </radialGradient>
    <linearGradient id="signYellow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe066"/>
      <stop offset="1" stop-color="#e8b400"/>
    </linearGradient>
    <linearGradient id="cellOpenUp" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#eef1f5"/>
      <stop offset="1" stop-color="#a9b2be"/>
    </linearGradient>
    <linearGradient id="cellOpenDown" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b8c0ca"/>
      <stop offset="1" stop-color="#eef1f5"/>
    </linearGradient>
    <linearGradient id="cellClosedUp" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a3f47"/>
      <stop offset="1" stop-color="#555b65"/>
    </linearGradient>
    <linearGradient id="cellClosedDown" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#555b65"/>
      <stop offset="1" stop-color="#3a3f47"/>
    </linearGradient>
    <pattern id="hatch" width="1.4" height="1.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="0.35" height="1.4" fill="#000" opacity="0.18"/>
    </pattern>
    ${ball("pollenGrad", "#fff7b3", "#ffd21f", "#c79300")}
    ${ball("nectarRed", "#ff9d9d", "#e3262b", "#8f1014")}
    ${ball("nectarBlue", "#9db7ff", "#2553e6", "#0f2a8a")}
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="0.9"/>
    </filter>
    <filter id="dropShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0.35" dy="0.45" stdDeviation="0.35" flood-color="#000" flood-opacity="0.55"/>
    </filter>
  </defs>`;
}

// ---------------------------------------------------------------------------
// Tiles, seams, walls
// ---------------------------------------------------------------------------

function tiles(): string {
  const out: string[] = [];
  for (let c = 0; c < 6; c++) {
    for (let r = 0; r < 6; r++) {
      const shade = (c + r) % 2 === 0 ? "#2b2d32" : "#292b30";
      const x = c * TILE;
      const y = r * TILE;
      out.push(
        `<rect x="${f(x)}" y="${f(y)}" width="${f(TILE)}" height="${f(TILE)}" fill="${shade}"/>`,
        `<rect x="${f(x)}" y="${f(y)}" width="${f(TILE)}" height="${f(TILE)}" fill="url(#tileSheen)"/>`,
      );
    }
  }
  out.push(`<rect width="${FIELD}" height="${FIELD}" fill="url(#speckle)"/>`);
  return `<g id="tiles">${out.join("")}</g>`;
}

/** Interlocking tab seam between tiles (square-wave), `vertical` at position p. */
function seamPath(p: number, vertical: boolean): string {
  const teeth = 12; // per tile edge
  const step = TILE / teeth;
  const amp = 0.24;
  let d = "";
  const pt = (along: number, off: number) =>
    vertical ? `${f(p + off)},${f(along)}` : `${f(along)},${f(p + off)}`;
  d += `M${pt(0, 0)}`;
  for (let i = 0; i < teeth * 6; i++) {
    const a0 = i * step;
    const a1 = a0 + step;
    const side = i % 2 === 0 ? amp : -amp;
    // skip the wave near tile corners to keep intersections clean
    const nearCorner = i % teeth === 0 || i % teeth === teeth - 1;
    if (nearCorner) {
      d += `L${pt(a1, 0)}`;
    } else {
      const inset = step * 0.18;
      d += `L${pt(a0 + inset, 0)}L${pt(a0 + inset, side)}L${pt(a1 - inset, side)}L${pt(a1 - inset, 0)}L${pt(a1, 0)}`;
    }
  }
  return d;
}

function seams(): string {
  const paths: string[] = [];
  for (let k = 1; k < 6; k++) {
    for (const vertical of [true, false]) {
      const d = seamPath(k * TILE, vertical);
      const p = f(k * TILE);
      const line = vertical
        ? `x1="${p}" y1="0" x2="${p}" y2="${FIELD}"`
        : `x1="0" y1="${p}" x2="${FIELD}" y2="${p}"`;
      paths.push(
        // solid seam with the interlocking tabs as a subtle texture on top
        `<line ${line} stroke="#0f1013" stroke-width="0.2"/>`,
        `<path d="${d}" fill="none" stroke="#141519" stroke-width="0.09" stroke-linejoin="miter" opacity="0.9"/>`,
        `<path d="${d}" fill="none" stroke="#474a52" stroke-width="0.04" transform="translate(0.08 0.08)" opacity="0.45"/>`,
      );
    }
  }
  return `<g id="seams">${paths.join("")}</g>`;
}

function wallShade(): string {
  const w = 1.6;
  return `<g id="wall-shade" pointer-events="none">
    <rect x="0" y="0" width="${FIELD}" height="${w}" fill="url(#wallShadeV)"/>
    <rect x="0" y="${f(FIELD - w)}" width="${FIELD}" height="${w}" fill="url(#wallShadeV)" transform="rotate(180 ${f(CENTER)} ${f(FIELD - w / 2)})"/>
    <rect x="0" y="0" width="${w}" height="${FIELD}" fill="url(#wallShadeH)"/>
    <rect x="${f(FIELD - w)}" y="0" width="${w}" height="${FIELD}" fill="url(#wallShadeH)" transform="rotate(180 ${f(FIELD - w / 2)} ${f(CENTER)})"/>
  </g>`;
}

// ---------------------------------------------------------------------------
// Tape: loading zones + gardens
// ---------------------------------------------------------------------------

function tapeStrip(r: Rect, color: string): string {
  return rect(r, `fill="${color}"`) + rect(r, `fill="url(#tapeSheen)"`);
}

function loadingZone(alliance: Alliance): string {
  const z = LOADING_ZONES[alliance];
  const c = ALLIANCE_COLORS[alliance].tape;
  const t = TAPE_WIDTH;
  const strips: Rect[] =
    alliance === "red"
      ? [
          { x0: z.x0, x1: z.x1, y0: z.y0, y1: z.y0 + t },
          { x0: z.x0, x1: z.x1, y0: z.y1 - t, y1: z.y1 },
          { x0: z.x1 - t, x1: z.x1, y0: z.y0 + t, y1: z.y1 - t },
        ]
      : [
          { x0: z.x0, x1: z.x1, y0: z.y0, y1: z.y0 + t },
          { x0: z.x0, x1: z.x1, y0: z.y1 - t, y1: z.y1 },
          { x0: z.x0, x1: z.x0 + t, y0: z.y0 + t, y1: z.y1 - t },
        ];
  const tint = rect(z, `fill="${c}" opacity="0.07"`);
  return `<g id="loading-zone-${alliance}">${tint}${strips.map((s) => tapeStrip(s, c)).join("")}</g>`;
}

function garden(alliance: Alliance): string {
  const g = GARDENS[alliance];
  const c = ALLIANCE_COLORS[alliance].tape;
  const mid = (g.y0 + g.y1) / 2;
  // two strips of 1 in tape laid side by side
  return `<g id="garden-${alliance}">${tapeStrip(g, c)}${rect(
    { x0: g.x0, x1: g.x1, y0: mid - 0.03, y1: mid + 0.03 },
    `fill="#000" opacity="0.25"`,
  )}</g>`;
}

// ---------------------------------------------------------------------------
// Scoring elements
// ---------------------------------------------------------------------------

function ballSvg(x: number, y: number, d: number, fill: string, holes = true): string {
  const r = d / 2;
  const cy = Y(y);
  let s = `<circle cx="${f(x)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}" stroke="#000" stroke-opacity="0.45" stroke-width="0.12"/>`;
  if (holes) {
    const hr = r * 0.16;
    const o = r * 0.52;
    const pts = [
      [0, 0],
      [o, 0],
      [-o, 0],
      [0, o],
      [0, -o],
    ];
    s += pts
      .map(
        ([dx, dy]) =>
          `<circle cx="${f(x + dx)}" cy="${f(cy + dy)}" r="${f(hr)}" fill="#000" opacity="0.22"/>`,
      )
      .join("");
  }
  s += `<ellipse cx="${f(x - r * 0.32)}" cy="${f(cy - r * 0.36)}" rx="${f(r * 0.3)}" ry="${f(r * 0.2)}" fill="#fff" opacity="0.45" transform="rotate(-30 ${f(x - r * 0.32)} ${f(cy - r * 0.36)})"/>`;
  return s;
}

function stagedPieces(filter: (p: (typeof STAGED_PIECES)[number]) => boolean): string {
  return STAGED_PIECES.filter(filter)
    .map((p) =>
      p.kind === "pollen"
        ? ballSvg(p.x, p.y, POLLEN_DIAMETER, "url(#pollenGrad)")
        : ballSvg(p.x, p.y, NECTAR_DIAMETER, p.alliance === "red" ? "url(#nectarRed)" : "url(#nectarBlue)"),
    )
    .join("");
}

// ---------------------------------------------------------------------------
// FLOWERS
// ---------------------------------------------------------------------------

function flower(fl: Flower): string {
  // Draw in a local frame (u along the wall, v into the field) via a transform.
  const angle = Math.atan2(-fl.inward.y, fl.inward.x) * (180 / Math.PI); // SVG angle of +v
  const base = { x: fl.center.x - fl.inward.x * FLOWER_RING_OFFSET, y: fl.center.y - fl.inward.y * FLOWER_RING_OFFSET };
  // local: +x = into field (v), +y = along wall (u) — rotate so +x aligns with inward
  const tf = `translate(${f(base.x)} ${f(Y(base.y))}) rotate(${f(angle)})`;
  // Base plate = the modelled footprint (obstacle + G304.D check), so the art
  // never shows the FLOWER bigger than what the checks use.
  const w = FLOWER_WIDTH / 2;
  const D = FLOWER_DEPTH;
  const ch = FLOWER_CHAMFER;
  const plate = `M0,${f(-w)} L${f(D - ch)},${f(-w)} L${f(D)},${f(-(w - ch))} L${f(D)},${f(w - ch)} L${f(D - ch)},${f(w)} L0,${f(w)} Z`;
  // Stems and bolt holes sit on the plate, scaled from the original 6.4 × 5.6 art.
  const su = w / 3.2;
  const sv = D / 5.6;
  const holes = [
    [1.1, -2.5],
    [1.1, 2.5],
    [4.6, -1.1],
    [4.6, 1.1],
  ].map(([v, u]) => [v * sv, u * su]);
  const pipes = [
    [1.15, -2.35],
    [1.15, 2.35],
    [4.55, -1.35],
    [4.55, 1.35],
  ].map(([v, u]) => [v * sv, u * su]);
  const pipeR = 0.52 * Math.min(su, sv);
  const c = FLOWER_RING_OFFSET;
  // Ring + purple backstop (drawn at their original size: 3.15 in toward the
  // wall, 2.55 in into the field and ±2.95 in along it from the ring centre),
  // scaled about the ring centre to stay on the plate: not past the wall,
  // inside the field-side edge and the plate's width.
  const k = Math.min(1, (c + 0.05) / 3.15, (D - c - 0.3) / 2.55, (w - 0.45) / 2.95);
  const ring = `translate(${f(c * (1 - k))} 0) scale(${f(k)})`;
  return `<g id="${fl.id}" transform="${tf}">
    <g filter="url(#dropShadow)">
      <rect x="0" y="-0.85" width="1.4" height="1.7" fill="#8c9199" stroke="#3f434a" stroke-width="0.1"/>
      <path d="${plate}" fill="url(#gold)" stroke="#8a5a12" stroke-width="0.14" stroke-linejoin="round"/>
      ${holes.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="0.15" fill="#6b4410" opacity="0.7"/>`).join("")}
      ${pipes.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(pipeR)}" fill="url(#pipe)" stroke="#1f4a0e" stroke-width="0.08"/>`).join("")}
      <g transform="${ring}">
        <circle cx="${c}" cy="0" r="2.55" fill="#1b1c1f" stroke="#050506" stroke-width="0.12"/>
        <circle cx="${c}" cy="0" r="2.0" fill="#0c0d0f"/>
        <path d="M${f(c - 0.2)},-2.95 A2.95,2.95 0 0 0 ${f(c - 0.2)},2.95 L${f(c + 0.35)},2.4 A2.45,2.45 0 0 1 ${f(c + 0.35)},-2.4 Z" fill="#7c4dcc" stroke="#3e2170" stroke-width="0.1" opacity="0.95"/>
        ${[-2.1, -0.7, 0.7, 2.1].map((yy) => `<circle cx="${f(c - 2.45 + Math.abs(yy) * 0.28)}" cy="${f(yy)}" r="0.13" fill="#e9dcff" opacity="0.8"/>`).join("")}
      </g>
    </g>
    ${ballSvgLocal(c, 0)}
  </g>`;
}

/** Pollen seen through the FLOWER top ring (drawn in the flower's local frame). */
function ballSvgLocal(x: number, y: number): string {
  const r = POLLEN_DIAMETER / 2 * 0.92;
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="url(#pollenGrad)" stroke="#000" stroke-opacity="0.45" stroke-width="0.1"/>
    ${[
      [0, 0],
      [0.68, 0],
      [-0.68, 0],
      [0, 0.68],
      [0, -0.68],
    ]
      .map(([dx, dy]) => `<circle cx="${f(x + dx)}" cy="${f(y + dy)}" r="0.2" fill="#000" opacity="0.22"/>`)
      .join("")}
    <ellipse cx="${f(x - 0.4)}" cy="${f(y - 0.45)}" rx="0.38" ry="0.25" fill="#fff" opacity="0.45"/>`;
}

// ---------------------------------------------------------------------------
// HIVE Structure
// ---------------------------------------------------------------------------

/** Pentagon "house" outline of a CELL frame in plan view; peak toward `dir`. */
function housePath(x0: number, x1: number, yBase: number, yPeak: number): string {
  const shoulder = yBase + (yPeak - yBase) * 0.55;
  const cx = (x0 + x1) / 2;
  const r = 0.6;
  const s = Math.sign(yPeak - yBase);
  return [
    `M${f(x0 + r)},${f(Y(yBase))}`,
    `L${f(x1 - r)},${f(Y(yBase))}`,
    `Q${f(x1)},${f(Y(yBase))} ${f(x1)},${f(Y(yBase + s * r))}`,
    `L${f(x1)},${f(Y(shoulder))}`,
    `L${f(cx)},${f(Y(yPeak))}`,
    `L${f(x0)},${f(Y(shoulder))}`,
    `L${f(x0)},${f(Y(yBase + s * r))}`,
    `Q${f(x0)},${f(Y(yBase))} ${f(x0 + r)},${f(Y(yBase))}`,
    "Z",
  ].join(" ");
}

function cell(c: Cell): string {
  const col = ALLIANCE_COLORS[c.alliance].tape;
  const dark = c.alliance === "red" ? "#8e1418" : "#11307f";
  // Red HIVE CELL peaks point toward +y, blue toward −y (180° symmetric).
  const dir = c.alliance === "red" ? 1 : -1;
  const { x0, x1, y0, y1 } = c.rect;
  const depth = y1 - y0;
  const frontBase = dir > 0 ? y0 : y1;
  const up = c.upAtStart;
  // Two pentagon frames (front + back of the prism) offset along y.
  const offset = depth * 0.34;
  const backBase = frontBase + dir * offset;
  const peakFront = frontBase + dir * (depth - offset);
  const peakBack = frontBase + dir * depth;
  const front = housePath(x0, x1, frontBase, peakFront);
  const back = housePath(x0 + 0.25, x1 - 0.25, backBase, peakBack);
  const fillOpen = dir > 0 ? "url(#cellOpenUp)" : "url(#cellOpenDown)";
  const fillClosed = dir > 0 ? "url(#cellClosedUp)" : "url(#cellClosedDown)";
  const body = up
    ? `<path d="${back}" fill="${fillOpen}" opacity="0.9"/>
       <path d="${front}" fill="${fillOpen}" opacity="0.85"/>
       <path d="${front}" fill="#fff" opacity="0.08"/>`
    : `<path d="${back}" fill="${fillClosed}"/>
       <path d="${front}" fill="${fillClosed}"/>
       <path d="${front}" fill="url(#hatch)"/>`;
  // side rails joining the two frames
  const rails = [x0, x1]
    .map(
      (x) =>
        `<line x1="${f(x)}" y1="${f(Y(frontBase + dir * 0.6))}" x2="${f(x + (x === x0 ? 0.25 : -0.25))}" y2="${f(Y(backBase + dir * 0.6))}" stroke="${col}" stroke-width="0.7" stroke-linecap="round"/>`,
    )
    .join("");
  const frameOpacity = up ? 1 : 0.8;
  return `<g id="${c.id}" opacity="${frameOpacity}">
    ${body}
    <path d="${back}" fill="none" stroke="${dark}" stroke-width="0.75" stroke-linejoin="round"/>
    ${rails}
    <path d="${front}" fill="none" stroke="${col}" stroke-width="0.95" stroke-linejoin="round"/>
    <path d="${front}" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="0.18" stroke-linejoin="round" transform="translate(-0.12 -0.12)"/>
    ${[0.25, 0.5, 0.75]
      .map((t) => {
        const x = x0 + (x1 - x0) * t;
        return `<circle cx="${f(x)}" cy="${f(Y(frontBase))}" r="0.13" fill="#fff" opacity="0.55"/>`;
      })
      .join("")}
  </g>`;
}

/** Plan-view line of an A-frame leg, from its foot up to its HIVE pivot. */
const legLine = (leg: (typeof HIVE_LEGS)[number], attrs: string) =>
  `<line x1="${f(leg.foot.x)}" y1="${f(Y(leg.foot.y))}" x2="${f(leg.top.x)}" y2="${f(Y(leg.top.y))}" ${attrs}/>`;

function hive(): string {
  const out: string[] = [];
  const [left, right] = HIVE_FRAME_RAILS;
  const y0 = left.y0;
  const y1 = left.y1;
  // soft ground shadow of the elevated HIVES
  out.push(
    `<rect x="${f(left.x0 + 1)}" y="${f(Y(y1 + 3.5))}" width="${f(right.x1 - left.x0)}" height="${f(y1 - y0 + 9)}" rx="4" fill="#000" opacity="0.28" filter="url(#softShadow)"/>`,
  );
  // floor foot bars + feet
  for (const r of HIVE_FRAME_RAILS) {
    const cx = (r.x0 + r.x1) / 2;
    out.push(`<g filter="url(#dropShadow)">`);
    out.push(rect(r, `fill="url(#metalV)" stroke="#3b3f45" stroke-width="0.1"`));
    for (const fy of [r.y0, r.y1]) {
      out.push(
        `<rect x="${f(cx - 1.35)}" y="${f(Y(fy) - 1.35)}" width="2.7" height="2.7" rx="0.3" fill="#2a2d32" stroke="#101114" stroke-width="0.1"/>`,
        `<circle cx="${f(cx - 0.8)}" cy="${f(Y(fy) - 0.8)}" r="0.2" fill="#9aa0a8"/>`,
        `<circle cx="${f(cx + 0.8)}" cy="${f(Y(fy) + 0.8)}" r="0.2" fill="#9aa0a8"/>`,
      );
    }
    out.push(`</g>`);
  }
  // A-frame legs: from each foot they lean inward (in x and y) up to the top
  // frame corner holding the pivot of the HIVE on that side (Fig 9-8, 9-17).
  out.push(
    `<g id="hive-legs" filter="url(#dropShadow)" stroke-linecap="round">`,
    ...HIVE_LEGS.map((leg) =>
      [
        legLine(leg, `stroke="#3b3f45" stroke-width="1.45"`),
        legLine(leg, `stroke="#a7adb5" stroke-width="1.2"`),
        legLine(leg, `stroke="#eef0f3" stroke-opacity="0.75" stroke-width="0.32" transform="translate(-0.2 -0.2)"`),
      ].join(""),
    ),
    `</g>`,
  );
  // HIVE cells beneath the crossbar
  for (const a of ["red", "blue"] as Alliance[]) {
    const h = HIVES[a];
    // pivot arms (V-bar) joining the two cells through the pivot
    const armX = h.pivot.x;
    out.push(
      `<g filter="url(#dropShadow)">`,
      `<rect x="${f(armX - 0.55)}" y="${f(Y(h.cells[1].rect.y0 + 0.5))}" width="1.1" height="${f(h.cells[1].rect.y0 - h.cells[0].rect.y1 - 1)}" fill="url(#metalV)" stroke="#3b3f45" stroke-width="0.08"/>`,
      ...h.cells.map((c) => cell(c)),
      `</g>`,
    );
  }
  // the legs stay visible through the translucent CELL panels
  out.push(
    `<g id="hive-legs-through" stroke-linecap="round" pointer-events="none">`,
    ...HIVE_LEGS.map(
      (leg) =>
        legLine(leg, `stroke="#1d2025" stroke-opacity="0.3" stroke-width="1.1"`) +
        legLine(leg, `stroke="#eef0f3" stroke-opacity="0.35" stroke-width="0.3"`),
    ),
    `</g>`,
  );
  // crossbar between the two pivots + BIOBUZZ sign panels + apex brackets (top-most)
  const pivots = [HIVES.red.pivot, HIVES.blue.pivot];
  const cb: Rect = {
    x0: HIVES.red.pivot.x - 1.5,
    x1: HIVES.blue.pivot.x + 1.5,
    y0: CENTER - CROSSBAR / 2,
    y1: CENTER + CROSSBAR / 2,
  };
  const signW = 28;
  const sx0 = CENTER - signW / 2;
  out.push(`<g filter="url(#dropShadow)">`);
  for (const side of [1, -1]) {
    const sy0 = side > 0 ? cb.y1 : cb.y0 - 1.7;
    const sy1 = sy0 + 1.7;
    out.push(
      rect({ x0: sx0, x1: sx0 + signW, y0: sy0, y1: sy1 }, `fill="url(#signYellow)" stroke="#8a6a00" stroke-width="0.08"`),
      honeycomb(sx0 + 3.4, (sy0 + sy1) / 2),
      honeycomb(sx0 + signW - 3.4, (sy0 + sy1) / 2),
      `<text x="${f(CENTER)}" y="${f(Y((sy0 + sy1) / 2) + 0.42)}" text-anchor="middle" font-family="'Arial Black','Helvetica Neue',Arial,sans-serif" font-weight="900" font-size="1.2" letter-spacing="0.08" fill="#1c1a12"${side < 0 ? ` transform="rotate(180 ${f(CENTER)} ${f(Y((sy0 + sy1) / 2))})"` : ""}>BIOBUZZ</text>`,
    );
  }
  out.push(rect(cb, `fill="url(#metalH)" stroke="#3b3f45" stroke-width="0.1"`));
  // apex brackets: where the two legs of a side frame meet at the pivot
  for (const p of pivots) {
    out.push(
      `<rect x="${f(p.x - 1.7)}" y="${f(Y(p.y) - 1.4)}" width="3.4" height="2.8" rx="0.4" fill="#24272c" stroke="#0e0f11" stroke-width="0.1"/>`,
      ...[
        [-1.25, -0.95],
        [1.25, -0.95],
        [-1.25, 0.95],
        [1.25, 0.95],
      ].map(
        ([dx, dy]) => `<circle cx="${f(p.x + dx)}" cy="${f(Y(p.y) + dy)}" r="0.17" fill="#9aa0a8"/>`,
      ),
    );
  }
  for (const a of ["red", "blue"] as Alliance[]) {
    const p = HIVES[a].pivot;
    out.push(
      `<circle cx="${f(p.x)}" cy="${f(Y(p.y))}" r="1.35" fill="#2a2d32" stroke="#0e0f11" stroke-width="0.12"/>`,
      `<circle cx="${f(p.x)}" cy="${f(Y(p.y))}" r="0.55" fill="#c9ced4" stroke="#6b7078" stroke-width="0.08"/>`,
      // dampers either side of the pivot
      `<rect x="${f(p.x - 0.45)}" y="${f(Y(p.y + 3.2))}" width="0.9" height="1.1" rx="0.2" fill="#111" />`,
      `<rect x="${f(p.x - 0.45)}" y="${f(Y(p.y - 2.1))}" width="0.9" height="1.1" rx="0.2" fill="#111" />`,
    );
  }
  out.push(`</g>`);
  // pre-staged NECTAR in the upward cells (drawn above the cell frames)
  out.push(stagedPieces((p) => p.kind === "nectar"));
  return `<g id="hive">${out.join("")}</g>`;
}

function honeycomb(cx: number, cyField: number): string {
  const cy = Y(cyField);
  const hex = (x: number, y: number, s: number) => {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      return `${f(x + s * Math.cos(a))},${f(y + s * Math.sin(a))}`;
    });
    return `<polygon points="${pts.join(" ")}" fill="none" stroke="#6b5200" stroke-width="0.07"/>`;
  };
  return hex(cx, cy - 0.35, 0.34) + hex(cx - 0.3, cy + 0.18, 0.34) + hex(cx + 0.3, cy + 0.18, 0.34);
}

// ---------------------------------------------------------------------------

function build(): string {
  const body = [
    tiles(),
    seams(),
    wallShade(),
    loadingZone("red"),
    loadingZone("blue"),
    garden("red"),
    garden("blue"),
    `<g id="garden-pollen">${stagedPieces((p) => p.kind === "pollen")}</g>`,
    `<g id="flowers">${FLOWERS.map(flower).join("")}</g>`,
    hive(),
    `<rect x="0.1" y="0.1" width="${f(FIELD - 0.2)}" height="${f(FIELD - 0.2)}" fill="none" stroke="#0b0c0e" stroke-width="0.2"/>`,
  ].join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- BIOBUZZ field (FTC 2026-2027) for the Pedro Pathing Visualizer.
     Generated by scripts/generate-biobuzz-field.ts from src/biobuzz/field.ts — do not edit by hand.
     1 unit = 1 inch; origin top-left of the SVG (field y is flipped). Cell width ${CELL_WIDTH} in. -->
<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}" viewBox="0 0 ${FIELD} ${FIELD}" preserveAspectRatio="none" shape-rendering="geometricPrecision">
<title>BIOBUZZ field</title>
${defs()}
${body}
</svg>
`;
}

writeFileSync(OUT, build());
console.log(`wrote ${OUT}`);
