// Modified for the BIOBUZZ Edition (FTC 2026-2027); based on Pedro-Pathing/Visualizer f54357e.
/**
 * Path colours that stay readable on the dark BIOBUZZ tiles (>= 4.5:1) and do
 * not look like alliance tape (red/blue), collision red or the grey frame.
 */
export const PATH_COLOR_PALETTE = [
  "#ffc516", // Pedro yellow (default)
  "#22d3ee", // cyan
  "#a3e635", // lime
  "#f472b6", // pink
  "#c084fc", // violet
  "#fb923c", // orange
  "#34d399", // emerald
  "#facc15", // amber
];

/** A random colour from PATH_COLOR_PALETTE (kept for upstream call sites). */
export function getRandomColor() {
  return PATH_COLOR_PALETTE[Math.floor(Math.random() * PATH_COLOR_PALETTE.length)];
}

/** The first palette colour not already used (cycles when all are taken). */
export function pickPathColor(used: (string | undefined)[] = []): string {
  const taken = new Set(used.filter(Boolean).map((c) => c!.toLowerCase()));
  return (
    PATH_COLOR_PALETTE.find((c) => !taken.has(c)) ??
    PATH_COLOR_PALETTE[taken.size % PATH_COLOR_PALETTE.length]
  );
}

/**
 * Apply an alpha to a CSS hex colour ("#rgb" / "#rrggbb") so fill and stroke
 * can use different opacities on one Two.js shape. Other colour formats are
 * returned unchanged.
 */
export function withAlpha(color: string | undefined, alpha: number): string {
  if (!color) return `rgba(0, 0, 0, ${alpha})`;
  const hex = color.trim().replace(/^#/, "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return color;
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  const n = parseInt(full, 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
