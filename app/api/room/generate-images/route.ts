/**
 * /api/room/generate-images
 * Generates role base images using Nano Banana Pro (Gemini 2.0 Flash image generation).
 * Images are stored PERMANENTLY in Supabase Storage as base cards.
 * Only generates a role image if it doesn't already exist (idempotent).
 * Player name is composited client-side via Canvas API (see useRoleCard hook).
 */
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent";

/**
 * Role portrait prompts — designed to leave the bottom 250px as a clean dark overlay
 * for player name compositing via Canvas API.
 */
const ROLE_PROMPTS: Record<string, string> = {
  "Loup-Garou": "Ultra-detailed fantasy art portrait card. A fearsome werewolf standing in a dark medieval village at night. Half-transformed figure, torn nobleman coat revealing grey fur, glowing crimson eyes, elongated claws catching moonlight, silver full moon halo behind. Dark atmospheric mist, gothic architecture silhouettes. Rich deep reds and charcoal blacks. IMPORTANT: leave bottom quarter of image as clean very dark (near black) solid area — no art, just very dark gradient to black. Art style: premium collectible card art, dramatic cinematic lighting, ultra-detailed 4K, no text no watermark no border frame.",
  "Villageois": "Ultra-detailed fantasy art portrait card. A determined medieval peasant farmer holding a torch aloft, standing at edge of dark forest. Simple roughspun clothes, leather vest, weathered courageous face, warm orange torch glow, dark ominous trees behind. Earthy greens, warm ambers. IMPORTANT: bottom quarter must be very dark solid gradient to black for text overlay. Art style: premium collectible card art, 4K, no text no watermark.",
  "Voyante": "Ultra-detailed fantasy art portrait card. A mystical fortune teller gazing into a luminous crystal ball, violet star-embroidered robes, silver-streaked hair, one eye glowing purple. Starry night sky, floating runes, purple magical aura. IMPORTANT: bottom quarter must be very dark solid gradient to black for text overlay. Art style: premium collectible card art, 4K, no text no watermark.",
  "Sorciere": "Ultra-detailed fantasy art portrait card. A powerful dark witch standing over a bubbling cauldron in a candlelit stone tower. One hand holds glowing green poison vial, other holds shimmering gold healing potion. Black hooded robes with purple trim, ancient grimoire floating open, bats in shadows. IMPORTANT: bottom quarter must be very dark solid gradient to black for text overlay. Art style: premium collectible card art, 4K, no text no watermark.",
  "Chasseur": "Ultra-detailed fantasy art portrait card. A rugged medieval hunter in weathered leather armor, crossbow raised, steely expression, moonlit dark forest, quiver of silver bolts. Forest green and dark amber. IMPORTANT: bottom quarter must be very dark solid gradient to black for text overlay. Art style: premium collectible card art, 4K, no text no watermark.",
  "Garde": "Ultra-detailed fantasy art portrait card. A noble knight in polished plate armor holding a tower shield, blue magical energy forming protective dome, golden crescent emblem, castle ramparts under starlit sky. Royal blues, silver, gold. IMPORTANT: bottom quarter must be very dark solid gradient to black for text overlay. Art style: premium collectible card art, 4K, no text no watermark.",
  "Cupidon": "Ultra-detailed fantasy art portrait card. An ethereal angel figure with golden bow and two glowing pink arrows linked by a heart thread. Flowing white rose robes, white wings, two silhouettes below bound by pink love light. Dreamy clouds and stars. IMPORTANT: bottom quarter must be very dark solid gradient to black for text overlay. Art style: premium collectible card art, 4K, no text no watermark.",
  "Petite Fille": "Ultra-detailed fantasy art portrait card. A brave young girl in a red hooded cape, peeking through gaps in barn door planks. Wide frightened curious eyes, one finger to lips, wolves glowing in shadows beyond. Dark night, candlelight from behind illuminates red hood. IMPORTANT: bottom quarter must be very dark solid gradient to black for text overlay. Art style: premium collectible card art, 4K, no text no watermark.",
};

const SCENE_PROMPTS: Record<string, string> = {
  "scenes/night-banner": "Wide cinematic 16:9 landscape banner. Full moon rising over gothic medieval village silhouetted against deep purple-blue night sky. Mist rolling through cobblestone streets, wolves howling in shadows, burning torches in windows. Extremely atmospheric dark fantasy landscape art. 4K cinematic quality, no text no watermark.",
  "scenes/day-banner": "Wide cinematic 16:9 landscape banner. Tense crowd of medieval villagers in sunlit stone village square, pointing and arguing. Morning golden light, noose in background, accusatory faces. Warm amber and gold tones. 4K, no text no watermark.",
  "scenes/wolves-win": "Wide cinematic 16:9 win screen. Pack of triumphant werewolves howling at blood red moon over ruined burning village. Dramatic crimson and black, ash falling, wolf pack silhouettes on hill. Epic terrifying dark fantasy art. 4K, no text no watermark.",
  "scenes/villagers-win": "Wide cinematic 16:9 win screen. Triumphant medieval villagers celebrating at dawn, last wolf defeated. Golden sunrise over village, joyful victorious crowd. Epic hopeful fantasy art. 4K, no text no watermark.",
  "scenes/lovers-win": "Wide cinematic 16:9 win screen. Two lone figures silhouetted on cliff at dawn, only survivors, surrounded by magical pink and gold love light. Rose petals, stars fading, new dawn. Romantic epic atmosphere. 4K, no text no watermark.",
  "brand/logo": "A square game logo/emblem design. Central element: a majestic werewolf head silhouette formed by crescent moon shadow shapes. Surrounded by circular ornate golden medieval badge with gothic flourishes. Village silhouette on bottom arc. Deep black background, metallic gold and silver palette, blood red accents. No text, just the symbol. Ultra detailed perfect emblem art, dark fantasy, 4K.",
};

async function generateImage(prompt: string): Promise<Buffer | null> {
  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    }),
  });
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData?.mimeType?.startsWith("image/"));
  return img ? Buffer.from(img.inlineData.data, "base64") : null;
}

export async function POST(req: NextRequest) {
  const { roles, scenes } = await req.json() as { roles?: string[]; scenes?: string[] };
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }
  const supabase = createRouteHandlerClient({ cookies });
  const results: Record<string, string | null> = {};

  // Generate role base images
  const rolesToGenerate = roles ?? Object.keys(ROLE_PROMPTS);
  for (const role of rolesToGenerate) {
    const prompt = ROLE_PROMPTS[role];
    if (!prompt) continue;
    const path = `roles/${role.toLowerCase().replace(/ /g, "-").replace(/[éèê]/g, "e").replace(/è/g, "e")}.jpg`;
    // Skip if already exists
    const { data: exists } = await supabase.storage.from("game-assets").list(`roles`, { search: path.split("/")[1] });
    if (exists && exists.length > 0) {
      results[role] = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/game-assets/${path}`;
      continue;
    }
    try {
      const buf = await generateImage(prompt);
      if (!buf) { results[role] = null; continue; }
      const { data: up } = await supabase.storage.from("game-assets").upload(path, buf, { contentType: "image/jpeg", upsert: true });
      results[role] = up ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/game-assets/${path}` : null;
    } catch (e) { results[role] = null; console.error(role, e); }
  }

  // Generate scene images if requested
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
        }
      } catch (e) { results[sceneKey] = null; console.error(sceneKey, e); }
    }
  }

  return NextResponse.json({ ok: true, results });
}

// GET — trigger full generation of all assets at once (call once after deploy)
export async function GET() {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }
  const allRoles = Object.keys(ROLE_PROMPTS);
  const allScenes = Object.keys(SCENE_PROMPTS);
  // Fire and forget — returns immediately, generation happens async
  Promise.resolve().then(async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/room/generate-images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: allRoles, scenes: allScenes }),
    });
    const data = await res.json();
    console.log("[generate-images] Complete:", data);
  });
  return NextResponse.json({ ok: true, message: "Generation started. Check storage in ~2 minutes." });
}
