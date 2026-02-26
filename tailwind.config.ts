import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: { base: "#07070f", surface: "#0f0f1a", card: "#14141f", hover: "#1a1a2e", border: "#2a2a3e" },
        gold: { DEFAULT: "#c9a84c", light: "#e8c96a", dark: "#8b6914", glow: "rgba(201,168,76,0.25)" },
        wolves: { DEFAULT: "#dc2626", dim: "#7f1d1d", glow: "rgba(220,38,38,0.3)" },
        villagers: { DEFAULT: "#16a34a", dim: "#14532d", glow: "rgba(22,163,74,0.3)" },
        lovers: { DEFAULT: "#ec4899", dim: "#831843", glow: "rgba(236,72,153,0.3)" },
        role: { loup: "#dc2626", villageois: "#16a34a", voyante: "#9b59b6", sorciere: "#7c3aed", chasseur: "#92400e", garde: "#2563eb", cupidon: "#ec4899", petite: "#d97706" },
      },
      fontFamily: { cinzel: ["Cinzel", "serif"], body: ["Inter", "sans-serif"] },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "fade-up": "fadeUp 0.6s ease-out forwards",
        "flicker": "flicker 3s ease-in-out infinite",
        "pulse-gold": "pulseGold 2s ease-in-out infinite",
        "text-shimmer": "textShimmer 3s ease-in-out infinite",
        "card-flip": "cardFlip 0.7s ease-in-out forwards",
        "float": "float 6s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        fadeUp: { "0%": { opacity: "0", transform: "translateY(20px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        flicker: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.85" } },
        pulseGold: { "0%, 100%": { boxShadow: "0 0 20px rgba(201,168,76,0.2)" }, "50%": { boxShadow: "0 0 40px rgba(201,168,76,0.5)" } },
        textShimmer: { "0%": { backgroundPosition: "-200% center" }, "100%": { backgroundPosition: "200% center" } },
        cardFlip: { "0%": { transform: "rotateY(90deg)", opacity: "0" }, "100%": { transform: "rotateY(0deg)", opacity: "1" } },
        float: { "0%, 100%": { transform: "translateY(0px)" }, "50%": { transform: "translateY(-12px)" } },
      },
      boxShadow: {
        "gold": "0 0 30px rgba(201,168,76,0.3), 0 0 60px rgba(201,168,76,0.1)",
        "gold-sm": "0 0 12px rgba(201,168,76,0.25)",
        "wolves": "0 0 30px rgba(220,38,38,0.4), 0 0 60px rgba(220,38,38,0.1)",
        "card": "0 4px 24px rgba(0,0,0,0.6), 0 1px 4px rgba(0,0,0,0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
