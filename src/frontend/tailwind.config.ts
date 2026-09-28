import type { Config } from "tailwindcss";

// Netra look: light canvas, white bordered panels, navy accent, Public Sans.
// Values mirror the CSS variables in globals.css (hex here so opacity
// modifiers like bg-core/10 work).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // surfaces
        bg: "#f2f4f7",
        canvas: "#f2f4f7",
        surface: "#ffffff",
        "surface-2": "#f7f8fa",
        "surface-3": "#eef1f5",
        line: "#d9dee6",
        "line-strong": "#c3cad5",
        // text
        ink: "#17212f",
        muted: "#566173",
        dim: "#6b7585",
        // brand
        core: "#1b3a6b",
        "core-dim": "#15305a",
        accent: "#1b3a6b",
        "accent-soft": "#e8edf6",
        aug: "#5b3fa8",
        // risk colours are reserved for risk levels and review outcomes
        "risk-low": "#0b6b3a",
        "risk-mid": "#8f5200",
        "risk-high": "#b42318",
        "high-soft": "#fdecea",
        "medium-soft": "#fdf3dc",
        "low-soft": "#e3f4ea",
        // semantic tones for badges / alerts
        ok: "#0b6b3a",
        warn: "#8f5200",
        danger: "#b42318",
        info: "#1b5f8f",
        alert: "#a1400b",
        panel: "#ffffff",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      // two display weights only, like the mockup: 400 and 600
      fontWeight: {
        bold: "600",
        extrabold: "600",
      },
      borderRadius: {
        xl: "0.5rem",
        "2xl": "0.75rem",
      },
      boxShadow: {
        card: "0 0 #0000",
        pop: "0 12px 32px -12px rgba(23,33,47,0.22), 0 2px 6px rgba(23,33,47,0.08)",
        glow: "0 0 0 1px rgba(27,58,107,0.35)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          from: { opacity: "0", transform: "scale(0.98) translateY(3px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "dock-in": {
          from: { opacity: "0", transform: "translateX(-10px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 var(--accent-glow)" },
          "70%": { boxShadow: "0 0 0 8px transparent" },
          "100%": { boxShadow: "0 0 0 0 transparent" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s cubic-bezier(0.16,1,0.3,1)",
        "pop-in": "pop-in 0.11s cubic-bezier(0.22,1,0.36,1)",
        "dock-in": "dock-in 0.16s cubic-bezier(0.22,1,0.36,1)",
        shimmer: "shimmer 1.4s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
