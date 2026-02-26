"use client";
/**
 * useRoleCard — Composites a player's name and role label onto a pre-generated base image.
 * Returns a data URL of the final composited card ready to display as <img> or download.
 *
 * The base image layout (700×980) has:
 *   - Art area: 0–730px top
 *   - Text zone: 730–980px bottom (dark overlay, ready for text)
 *
 * Placeholder areas in the base image (pixel coords):
 *   - Role badge: centered at y=778, width 260, height 44 (rx 22) — write role name
 *   - Player name: centered at y=860, full width — write player name in large Cinzel
 *   - Subtitle/description: centered at y=920, full width — write short description
 */
import { useEffect, useRef, useState } from "react";

interface UseRoleCardOptions {
  baseImageUrl: string;  // Pre-generated Nano Banana Pro image URL
  playerName: string;
  roleName: string;
  roleColor: string;
  roleEmoji: string;
  isLover?: boolean;
  partnerId?: string | null;
  wolvesMates?: string[]; // For Loup-Garou: names of other wolves
}

const CARD_W = 700;
const CARD_H = 980;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

export function useRoleCard(opts: UseRoleCardOptions) {
  const { baseImageUrl, playerName, roleName, roleColor, roleEmoji, isLover, wolvesMates } = opts;
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setLoading(true);

    const canvas = document.createElement("canvas");
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    canvasRef.current = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    (async () => {
      try {
        // 1. Draw base image (pre-generated or SVG placeholder)
        try {
          const baseImg = await loadImage(baseImageUrl);
          ctx.drawImage(baseImg, 0, 0, CARD_W, CARD_H);
        } catch {
          // SVG placeholder — draw dark card
          const grad = ctx.createRadialGradient(CARD_W/2, 380, 0, CARD_W/2, 380, 400);
          grad.addColorStop(0, roleColor + "55");
          grad.addColorStop(1, "#07070f");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, CARD_W, CARD_H);
          // Draw emoji
          ctx.font = "200px serif";
          ctx.textAlign = "center";
          ctx.fillText(roleEmoji, CARD_W / 2, 450);
        }

        // 2. Dark overlay on text zone (bottom 250px)
        const overlay = ctx.createLinearGradient(0, 700, 0, CARD_H);
        overlay.addColorStop(0, "rgba(7,7,15,0)");
        overlay.addColorStop(0.15, "rgba(7,7,15,0.88)");
        overlay.addColorStop(1, "rgba(7,7,15,0.97)");
        ctx.fillStyle = overlay;
        ctx.fillRect(0, 700, CARD_W, CARD_H - 700);

        // 3. Role color separator line
        ctx.strokeStyle = roleColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(60, 734); ctx.lineTo(CARD_W - 60, 734);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // 4. Role badge pill (centered, y=756)
        const badgeW = 240; const badgeH = 44; const badgeX = (CARD_W - badgeW) / 2; const badgeY = 748;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 22);
        ctx.fillStyle = roleColor + "25";
        ctx.fill();
        ctx.strokeStyle = roleColor + "60";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Role name in badge
        ctx.fillStyle = roleColor;
        ctx.font = "bold 18px 'Cinzel', Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillText(`${roleEmoji}  ${roleName.toUpperCase()}`, CARD_W / 2, 776);

        // 5. Player name (large, centered, y=848)
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.font = "bold 52px 'Cinzel', Georgia, serif";
        ctx.textAlign = "center";
        // Truncate if too long
        const maxW = CARD_W - 80;
        let nameText = playerName;
        while (ctx.measureText(nameText).width > maxW && nameText.length > 1) {
          nameText = nameText.slice(0, -1);
        }
        if (nameText !== playerName) nameText += "…";
        // Subtle text shadow
        ctx.shadowColor = roleColor;
        ctx.shadowBlur = 20;
        ctx.fillText(nameText, CARD_W / 2, 848);
        ctx.shadowBlur = 0;

        // 6. Extra info line (wolves mates / lover indicator)
        if (wolvesMates && wolvesMates.length > 0) {
          ctx.fillStyle = "#dc262680";
          ctx.font = "italic 16px 'Cinzel', Georgia, serif";
          ctx.fillText(`Frères loups: ${wolvesMates.slice(0, 3).join(" · ")}`, CARD_W / 2, 896);
        } else if (isLover) {
          ctx.fillStyle = "#ec489980";
          ctx.font = "italic 16px 'Cinzel', Georgia, serif";
          ctx.fillText("💕  Vous êtes amoureux(se)", CARD_W / 2, 896);
        }

        // 7. Bottom decorative corners
        ctx.strokeStyle = roleColor + "60";
        ctx.lineWidth = 2;
        [[12, 12], [CARD_W - 12, 12], [12, CARD_H - 12], [CARD_W - 12, CARD_H - 12]].forEach(([x, y], i) => {
          const sx = i % 2 === 0 ? 1 : -1; const sy = i < 2 ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(x, y + sy * 48); ctx.lineTo(x, y); ctx.lineTo(x + sx * 48, y);
          ctx.stroke();
        });

        // 8. Card border glow
        ctx.strokeStyle = roleColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.roundRect(10, 10, CARD_W - 20, CARD_H - 20, 24);
        ctx.stroke();
        ctx.globalAlpha = 1;

        setDataUrl(canvas.toDataURL("image/jpeg", 0.92));
      } catch (e) {
        console.error("RoleCard compositing failed:", e);
        setDataUrl(baseImageUrl); // fallback to raw base
      } finally {
        setLoading(false);
      }
    })();
  }, [baseImageUrl, playerName, roleName, roleColor, roleEmoji, isLover, wolvesMates]);

  return { dataUrl, loading };
}
