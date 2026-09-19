// Modified for the BIOBUZZ Edition (FTC 2026-2027); based on Pedro-Pathing/Visualizer f54357e.
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "selector",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx,svelte}"],
  theme: {
    extend: {
      fontFamily: {
        poppins: ["Poppins", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      scale: {
        98: "0.98",
        102: "1.02",
      },
      // Used across the sidebar and menus (duration-250); not in the default scale.
      transitionDuration: {
        250: "250ms",
      },
      animation: {
        modalf: "modalf 0.15s ease-in-out",
      },
      keyframes: {
        modalf: {
          "0%": { transform: "scale(0)" },
          "100%": { transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};
