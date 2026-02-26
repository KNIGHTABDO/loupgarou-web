import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loup-Garou — Jeu en Ligne",
  description: "Le jeu de société Loup-Garou en ligne. 4 à 12 joueurs, temps réel, aucun compte requis.",
  openGraph: {
    title: "Loup-Garou — Jeu en Ligne",
    description: "Trompez. Démasquez. Survivez.",
    images: ["/og-image.jpg"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Loup-Garou en Ligne",
    description: "Jouez au Loup-Garou avec vos amis en temps réel.",
  },
  icons: [
    { rel: "icon", url: "/favicon.svg", type: "image/svg+xml" },
    { rel: "apple-touch-icon", url: "/icons/icon-192.png" },
  ],
  manifest: "/manifest.webmanifest",
  themeColor: "#c9a84c",
  viewport: { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;900&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Loup-Garou" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
