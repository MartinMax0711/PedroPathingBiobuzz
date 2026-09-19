// Modified for the BIOBUZZ Edition (FTC 2026-2027); based on Pedro-Pathing/Visualizer f54357e.
import "./app.scss";
import App from "./App.svelte";

const app = new App({
  target: document.body!,
});

/**
 * Offline support. The service worker is only registered in production builds;
 * `BASE_URL` is "./" there, so it resolves next to index.html and works under a
 * GitHub Pages sub-path. In dev, any worker left over from a production preview
 * on the same origin is removed so Vite always serves fresh modules.
 */
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`)
        .catch((error) => console.error("Service worker registration failed:", error));
    });
  } else {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => registrations.forEach((r) => r.unregister()))
      .catch(() => {});
  }
}

export default app;
