// Modified for the BIOBUZZ Edition (FTC 2026-2027); based on Pedro-Pathing/Visualizer f54357e.
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: "dist",
    // Increase chunk size warning limit to 1.2 MB to avoid noisy warnings
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // The entry keeps a stable name (public/sw.js precaches it and serves
        // it network-first). Lazy chunks get a content hash so a cached copy
        // can never be paired with a newer entry after a deploy.
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name].[ext]`,
      },
    },
  },
  // Relative base: the build works at any path, e.g. GitHub Pages
  // https://<user>.github.io/PedroPathingBiobuzz/
  base: "./",
});
