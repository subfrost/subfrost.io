import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: { center: true, padding: "1.5rem" },
    extend: {
      fontFamily: {
        satoshi: ["Satoshi", "system-ui", "sans-serif"],
      },
      colors: {
        // Brand frost palette (matches subfrost.io)
        brand: {
          blue: "hsl(215 49% 31%)",
          ice: "hsl(210 40% 96%)",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      typography: ({ theme }: { theme: (path: string) => string }) => ({
        invert: {
          css: {
            "--tw-prose-body": theme("colors.zinc[300]"),
            "--tw-prose-headings": theme("colors.white"),
            "--tw-prose-links": theme("colors.brand.ice"),
            "--tw-prose-bold": theme("colors.white"),
            "--tw-prose-quotes": theme("colors.zinc[200]"),
            "--tw-prose-quote-borders": theme("colors.brand.blue"),
            "--tw-prose-code": theme("colors.brand.ice"),
            "--tw-prose-pre-bg": "rgba(0,0,0,0.5)",
            "--tw-prose-hr": theme("colors.zinc[800]"),
            "--tw-prose-bullets": theme("colors.zinc[600]"),
          },
        },
      }),
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
}

export default config
