/**
 * A size that grows with the window instead of jumping at a breakpoint:
 * `min` px at `lo`, `max` px at `hi`, in proportion in between, clamped outside.
 */
const fluid = (unit, lo, hi) => (min, max) => {
  const slope = (max - min) / (hi - lo);
  const base = min - slope * lo;
  const sign = base < 0 ? '-' : '+';
  return `clamp(${min}px, calc(${+(slope * 100).toFixed(4)}${unit} ${sign} ${+Math.abs(base).toFixed(2)}px), ${max}px)`;
};
/** By the window's height: 600px (a laptop browser with tabs and bookmarks) to 950px. */
const fluidH = fluid('vh', 600, 950);
/** By the window's width: 1024px (a tablet) to 1440px. */
const fluidW = fluid('vw', 1024, 1440);

const pairs = (list, f, prefix) => Object.fromEntries(list.map(([a, b]) => [`${prefix}-${a}-${b}`, f(a, b)]));
const FLUID_SPACING = {
  ...pairs([
    [0, 4], [0, 8], [0, 16], [2, 16], [2, 24], [4, 6], [4, 8], [4, 12], [4, 16], [4, 24], [5, 16], [6, 12], [6, 16], [6, 20], [6, 24], [8, 12], [8, 16], [8, 20], [8, 24],
    [10, 16], [10, 20], [10, 24], [10, 32], [12, 16], [12, 32], [14, 20], [28, 40], [56, 80],
  ], fluidH, 'fl'),
  ...pairs([[4, 10], [6, 12], [8, 12], [8, 16], [10, 12], [12, 16], [12, 20], [16, 20], [16, 24]], fluidW, 'flw'),
};
const FLUID_FONT = {
  ...pairs([[16, 20], [16, 24], [22, 34], [28, 36], [30, 36], [32, 60], [34, 60], [44, 60]], fluidH, 'fl'),
};

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        ws: {
          bg: "hsl(var(--ws-bg))",
          surface: "hsl(var(--ws-surface))",
          surface2: "hsl(var(--ws-surface-2))",
          ink: "hsl(var(--ws-ink))",
          soft: "hsl(var(--ws-ink-soft))",
          accent: "hsl(var(--ws-accent))",
          accentSoft: "hsl(var(--ws-accent-soft))",
          blue: "hsl(var(--ws-blue))",
          blueSoft: "hsl(var(--ws-blue-soft))",
          teal: "hsl(var(--ws-teal))",
          success: "hsl(var(--ws-success))",
          danger: "hsl(var(--ws-danger))",
        },
        block: {
          unit: "var(--block-unit)",
          "unit-dark": "var(--block-unit-dark)",
          ten: "var(--block-ten)",
          "ten-dark": "var(--block-ten-dark)",
          hundred: "var(--block-hundred)",
          "hundred-dark": "var(--block-hundred-dark)",
          thousand: "var(--block-thousand)",
          "thousand-dark": "var(--block-thousand-dark)",
        },
      },
      fontFamily: {
        display: ["Rubik", "Heebo", "sans-serif"],
        body: ["Heebo", "Assistant", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      transitionDuration: {
        '2500': '2500ms',
      },
      // Fluid sizes (owner, 28.9.2026: "רספונסיבי ככל שניתן לכל גודל מסך").
      // No steps by screen size: `p-fl-14-32` is 14px in a window 600px tall,
      // 32px in one 950px tall, and in between in proportion (see fluidH).
      // `px-flw-12-20` does the same by width, 1024px to 1440px (fluidW).
      spacing: FLUID_SPACING,
      fontSize: FLUID_FONT,
    },
  },
  plugins: [require("tailwindcss-animate")],
}

