import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Loup-Garou — Jeu en Ligne",
    short_name: "Loup-Garou",
    description: "Le jeu de société Loup-Garou en ligne. 4 à 12 joueurs, temps réel.",
    start_url: "/",
    display: "standalone",
    background_color: "#07070f",
    theme_color: "#c9a84c",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
