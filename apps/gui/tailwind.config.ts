import type { Config } from "tailwindcss";

export default {
  content: ["./src/pages/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: []
} satisfies Config;

