import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent";

const ROLE_PROMPTS: Record<string, string> = {
  "Loup-Garou": "A menacing werewolf in a dark medieval village at night, glowing red eyes, fur cloak, moonlight, dramatic dark fantasy art, cinematic lighting, 4k",
  "Villageois": "A brave medieval villager with a torch in dark forest, fearful but determined, medieval clothing, fantasy art style",
  "Voyante": "A mysterious medieval fortune teller with glowing crystal ball, purple robes, stars, mystical purple light, fantasy art",
  "Sorciere": "A dark medieval witch with glowing green potions, cauldron, purple black robes, enchanted forest, dramatic lighting",
  "Chasseur": "A rugged medieval hunter with crossbow drawn, dark forest, leather armor, intense expression, fantasy art",
  "Garde": "A noble medieval knight in shining armor with a large shield, castle background, blue magical glow, fantasy art",
  "Cupidon": "A romantic medieval cupid figure with golden bow and pink magical arrows, dreamy fantasy background, pink gold lighting",
  "Petite Fille": "A brave young girl in red hood spying through wooden planks at night, scared but curious, dark medieval village, cinematic",
};

async function generateImage(prompt: string): Promise<string | null> {
  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } }),
    });
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const img = parts?.find((p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData?.mimeType?.startsWith("image/"));
    return img?.inlineData?.data ?? null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const { roomId } = await req.json();
  const supabase = createRouteHandlerClient({ cookies });
  const { data: players } = await supabase.from("players").select("*").eq("room_id", roomId);
  if (!players) return NextResponse.json({ error: "No players" }, { status: 400 });
  const uniqueRoles = [...new Set(players.map((p: { role: string }) => p.role).filter(Boolean))];
  const roleImages: Record<string, string> = {};
  await Promise.allSettled(uniqueRoles.map(async (role) => {
    const prompt = ROLE_PROMPTS[role as string];
    if (!prompt) return;
    const b64 = await generateImage(prompt);
    if (!b64) return;
    const buf = Buffer.from(b64, "base64");
    const path = `role-cards/${roomId}/${role}.jpg`;
    const { data: up } = await supabase.storage.from("game-assets").upload(path, buf, { contentType: "image/jpeg", upsert: true });
    if (up) { const { data: u } = supabase.storage.from("game-assets").getPublicUrl(path); roleImages[role as string] = u.publicUrl; }
  }));
  for (const p of players) {
    if (p.role && roleImages[p.role]) await supabase.from("players").update({ role_card_url: roleImages[p.role] }).eq("id", p.id);
  }
  return NextResponse.json({ ok: true, roleImages });
}
