import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loup-Garou — Jeu en Ligne",
  description: "Le jeu de société Loup-Garou en ligne. 4 à 12 joueurs, aucun compte requis.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
