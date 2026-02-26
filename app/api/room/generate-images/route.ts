/**
 * /api/room/generate-images
 * Generates role base images using Nano Banana Pro (Gemini image generation).
 * Images are stored PERMANENTLY in Supabase Storage as base cards (idempotent).
 * Player name is composited client-side via Canvas API (see useRoleCard hook).
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY (server-only) — NOT the auth-helpers route client.
 * This route is called fire-and-forget from /api/room/start — no user auth needed.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent";

const ROLE_PROMPTS: Record<string, string> = {
  "Loup-Garou":
    "Ultra-detailed premium fantasy collectible card art. A fearsome werewolf in a dark medieval village at night — half-transformed nobleman, torn coat revealing grey fur, glowing crimson eyes, silver claws. Full blood moon behind. Gothic architecture, mist on cobblestones. CRITICAL: bottom 25% of image is a completely solid near-black (#0a0a12) flat zone — NO art. Portrait card, no text, no watermark.",
  Villageois:
    "Ultra-detailed premium fantasy collectible card art. A determined medieval peasant farmer holding a lit torch at edge of dark forest. Roughspun clothes, weathered face showing courage. Warm amber torch glow, ominous dark trees behind. CRITICAL: bottom 25% completely solid near-black (#0a0a12) — NO art. Portrait card, no text, no watermark.",
  Voyante:
    "Ultra-detailed premium fantasy collectible card art. A mystical seer gazing into a luminous crystal ball, violet star-embroidered robes, one eye glowing purple. Starry night, floating runes, purple aura. CRITICAL: bottom 25% completely solid near-black (#0a0a12) — NO art. Portrait card, no text, no watermark.",
  Sorciere:
    "Ultra-detailed premium fantasy collectible card art. A dark witch over a bubbling cauldron. Left hand: glowing green poison vial. Right hand: golden healing potion. Black hooded robes, purple trim, grimoire floating open, bats in shadows. CRITICAL: bottom 25% completely solid near-black (#0a0a12) — NO art. Portrait card, no text, no watermark.",
  Chasseur:
    "Ultra-detailed premium fantasy collectible card art. A rugged medieval hunter in leather armor, crossbow raised, steely eyes. Animal pelts, quiver of silver bolts, moonlit forest floor. Forest green and dark amber. CRITICAL: bottom 25% completely solid near-black (#0a0a12) — NO art. Portrait card, no text, no watermark.",
  Garde:
    "Ultra-detailed premium fantasy collectible card art. A noble knight in polished plate armor holding a tower shield, blue magical energy forming a protective dome, golden crescent emblem. Castle ramparts, starlit sky. CRITICAL: bottom 25% completely solid near-black (#0a0a12) — NO art. Portrait card, no text, no watermark.",
  Cupidon:
    "Ultra-detailed premium fantasy collectible card art. An ethereal angel with golden bow, two glowing pink arrows linked by a heart thread. Two silhouettes below drawn together by pink love energy. Dreamy clouds and stars, rose petals. CRITICAL: bottom 25% completely solid near-black (#0a0a12) — NO art. Portrait card, no text, no watermark.",
  "Petite Fille":
    "Ultra-detailed premium fantasy collectible card art. A brave young girl in a vivid red hooded cape, peeking through barn door gaps. Wide frightened eyes, finger to lips. Through the gaps: glowing red wolf eyes. Warm candlelight from behind. CRITICAL: bottom 25% completely solid near-black (#0a0a12) — NO art. Portrait card, no text, no watermark.",
};

const SCENE_PROMPTS: Record<string, string> = {
  "scenes/night-banner":
    "Wide cinematic 16:9 landscape. Full blood moon over gothic medieval village silhouette against deep purple-blue night sky. Mist, wolves howling, burning torches in windows. Dark fantasy, 4K, no text.",
  "scenes/day-banner":
    "Wide cinematic 16:9 landscape. Tense crowd of medieval villagers in sunlit village square, pointing accusingly. Morning golden light. 4K, no text.",
  "scenes/wolves-win":
    "Wide cinematic 16:9. Pack of triumphant werewolves howling at blood red moon over burning village. Crimson and black, ash falling. 4K, no text.",
  "scenes/villagers-win":
    "Wide cinematic 16:9. Triumphant medieval villagers celebrating at dawn. Golden sunrise, joyful crowd. 4K, no text.",
  "scenes/lovers-win":
    "Wide cinematic 16:9. Two lone figures silhouetted on cliff at dawn, magical pink and gold love light, rose petals. Romantic epic. 4K, no text.",
  "brand/logo":
    "Square game logo emblem. Werewolf head silhouette formed by crescent moon negative space. Circular ornate gold medieval badge, gothic flourishes. Village skyline on bottom arc. Deep black background, gold and silver only. No text, perfect symmetry. 4K.",
};

async function generateImage(prompt: string): Promise<Buffer | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    }),
  });
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string } }> } }>;
  };
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));
  return img ? Buffer.from(img.inlineData!.data, "base64") : null;
}

function getStoragePath(role: string): string {
  return `roles/${role.toLowerCase().replace(/ /g, "-").replace(/[éèê]/g, "e").replace(/[àâ]/g, "a").replace(/[ùû]/g, "u").replace(/[ôö]/g, "o").replace(/[îï]/g, "i").replace(/ç/g, "c")}.jpg`;
}

export async function POST(req: NextRequest) {
  // Accept { roles?, scenes? } or { roomId } (fire-and-forget from /start)
  const body = (await req.json()) as { roles?: string[]; scenes?: string[]; roomId?: string };
  const { roles, scenes } = body;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const results: Record<string, string | null> = {};
  const rolesToGenerate = roles ?? Object.keys(ROLE_PROMPTS);

  for (const role of rolesToGenerate) {
    const prompt = ROLE_PROMPTS[role];
    if (!prompt) continue;
    const path = getStoragePath(role);
    // Check if already exists — skip if so (idempotent)
    const { data: existing } = await supabase.storage.from("game-assets").list("roles", { search: path.split("/")[1] });
    if (existing && existing.length > 0) {
      results[role] = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/game-assets/${path}`;
      continue;
    }
    try {
      const buf = await generateImage(prompt);
      if (!buf) { results[role] = null; continue; }
      await supabase.storage.from("game-assets").upload(path, buf, { contentType: "image/jpeg", upsert: true });
      results[role] = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/game-assets/${path}`;
    } catch (e) { results[role] = null; console.error(role, e); }
  }

  if (scenes) {
    for (const sceneKey of scenes) {
      const prompt = SCENE_PROMPTS[sceneKey];
      if (!prompt) continue;
      const path = `${sceneKey}.jpg`;
      try {
        const buf = await generateImage(prompt);
        if (buf) {
          await supabase.storage.from("game-assets").upload(path, buf, { contentType: "image/jpeg", upsert: true });
          results[sceneKey] = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/game-assets/${path}`;
        } else { results[sceneKey] = null; }
      } catch (e) { results[sceneKey] = null; console.error(sceneKey, e); }
    }
  }

  return NextResponse.json({ ok: true, results });
}

// GET — trigger full generation of all assets at once
export async function GET() {
  const rolesToGenerate = Object.keys(ROLE_PROMPTS);
  const allScenes = Object.keys(SCENE_PROMPTS);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  // Fire and forget
  Promise.resolve().then(async () => {
    await fetch(`${baseUrl}/api/room/generate-images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: rolesToGenerate, scenes: allScenes }),
    });
  });
  return NextResponse.json({ ok: true, message: "Generation started. Check storage in ~2 minutes." });
}
