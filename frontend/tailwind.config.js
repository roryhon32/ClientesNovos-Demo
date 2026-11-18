/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--c-bg) / <alpha-value>)",
        sidebar: "rgb(var(--c-sidebar) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--c-surface) / <alpha-value>)",
          hover: "rgb(var(--c-surface-hover) / <alpha-value>)",
          elevated: "rgb(var(--c-surface-elevated) / <alpha-value>)",
        },
        tint: {
          DEFAULT: "rgb(var(--c-tint) / <alpha-value>)",
          hover: "rgb(var(--c-tint-hover) / <alpha-value>)",
          border: "rgb(var(--c-tint-border) / <alpha-value>)",
        },
        border: {
          DEFAULT: "rgb(var(--c-border) / <alpha-value>)",
          active: "rgb(var(--c-border-active) / <alpha-value>)",
          subtle: "rgb(var(--c-border-subtle) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "rgb(var(--c-primary) / <alpha-value>)",
          hover: "rgb(var(--c-primary-hover) / <alpha-value>)",
          glow: "var(--c-primary-glow)",
        },
        action: {
          DEFAULT: "rgb(var(--c-action) / <alpha-value>)",
          hover: "rgb(var(--c-action-hover) / <alpha-value>)",
        },
        navy: {
          DEFAULT: "rgb(var(--c-navy) / <alpha-value>)",
          mid: "rgb(var(--c-navy-mid) / <alpha-value>)",
          light: "rgb(var(--c-cyan) / <alpha-value>)",
        },
        cyan: {
          DEFAULT: "rgb(var(--c-cyan) / <alpha-value>)",
          hover: "rgb(var(--c-cyan-hover) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--c-accent) / <alpha-value>)",
          dark: "rgb(var(--c-accent-dark) / <alpha-value>)",
        },
        positive: {
          DEFAULT: "rgb(var(--c-positive) / <alpha-value>)",
          subtle: "var(--c-positive-subtle)",
        },
        negative: {
          DEFAULT: "rgb(var(--c-negative) / <alpha-value>)",
          subtle: "var(--c-negative-subtle)",
        },
        warning: {
          DEFAULT: "rgb(var(--c-warning) / <alpha-value>)",
          subtle: "var(--c-warning-subtle)",
        },
        text: {
          primary: "rgb(var(--c-text-primary) / <alpha-value>)",
          secondary: "rgb(var(--c-text-secondary) / <alpha-value>)",
          muted: "rgb(var(--c-text-muted) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ['"Work Sans"', '"Segoe UI"', 'Aptos', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Outfit"', '"Work Sans"', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        'neon-subtle': '0 2px 10px -2px rgba(10, 31, 61, 0.14)',
        'neon-pill': '0 2px 8px 0 rgba(10, 31, 61, 0.22)',
        'neon-card': '0 4px 16px -2px rgba(10, 31, 61, 0.10), 0 1px 2px rgba(10, 31, 61, 0.05)',
      },
      backgroundImage: {
        'subtle-radial': 'radial-gradient(ellipse at top, rgba(10, 31, 61, 0.06) 0%, transparent 70%)',
      },
    },
  },
  plugins: [],
};
