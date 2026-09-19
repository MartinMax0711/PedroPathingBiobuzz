/**
 * Resolve a bundled public asset (e.g. "/robot.png" or "fields/biobuzz.svg")
 * against Vite's base URL so the app also works when served from a sub-path
 * such as GitHub Pages (https://<user>.github.io/<repo>/).
 *
 * Settings keep the historical "/robot.png"-style identifiers; resolve them
 * here at the point of use. data:, blob: and absolute URLs pass through.
 */
export function assetUrl(path: string | undefined | null): string {
  if (!path) return "";
  if (/^(data:|blob:|https?:|\/\/)/i.test(path)) return path;
  const base = import.meta.env.BASE_URL || "/";
  return base.replace(/\/?$/, "/") + path.replace(/^\/+/, "");
}

/** URL of a built-in field map file in public/fields/. */
export function fieldMapUrl(fileName: string): string {
  return assetUrl(`fields/${fileName}`);
}
