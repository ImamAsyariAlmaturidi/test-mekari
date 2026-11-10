import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}", "./lib/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: { colors: { canvas: "#f7f8fa", ink: "#17191c", muted: "#747b84", line: "#e6e8eb", accent: "#167d68" } } },
  plugins: []
} satisfies Config;
