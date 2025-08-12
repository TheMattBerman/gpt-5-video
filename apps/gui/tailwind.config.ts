import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/components/ui/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
        neutral: {
          50: "#f9fafb",
          100: "#f3f4f6",
          200: "#e5e7eb",
          700: "#374151",
          900: "#111827",
        },
        semantic: {
          yellow: { bg: "#FEF9C3", text: "#854D0E", border: "#FDE68A" },
          blue: { bg: "#EFF6FF", text: "#1E40AF", border: "#BFDBFE" },
          red: { bg: "#FEF2F2", text: "#991B1B", border: "#FECACA" },
          green: { bg: "#ECFDF5", text: "#065F46", border: "#A7F3D0" },
        },
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.02)",
        elevated:
          "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      transitionDuration: {
        150: "150ms",
        200: "200ms",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Inter",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "Noto Sans",
          "Apple Color Emoji",
          "Segoe UI Emoji",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "Courier New",
          "monospace",
        ],
      },
      maxWidth: {
        "content-3xl": "48rem",
        "content-4xl": "56rem",
        "content-5xl": "64rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
