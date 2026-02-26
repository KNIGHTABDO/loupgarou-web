/**
 * /api/icons — Generates all app icons via Nano Banana Pro on first call.
 * Icons are SVG-first: the app works without this route.
 * Calling GET /api/icons triggers generation and returns icon URLs.
 */
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const ICON_PROMPT = "A square app icon for 'Loup-Garou' mobile game. A werewolf face silhouette formed by a crescent moon, centered on a deep black circular background. Ornate golden circular border with gothic medieval flourishes. Flat icon style with metallic gold, silver and deep black. Perfect symmetry, no text, suitable for app store icon. Ultra clean crisp digital art.";

export async function GET() {
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: "No API key" }, { status: 500 });
  const supabase = createRouteHandlerClient({ cookies });
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: ICON_PROMPT }] }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } }) }
    );
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const img = parts.find((p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData?.mimeType?.startsWith("image/"));
    if (!img) return NextResponse.json({ error: "Generation failed" }, { status: 500 });
    const buf = Buffer.from(img.inlineData.data, "base64");
    await supabase.storage.from("game-assets").upload("brand/icon.jpg", buf, { contentType: "image/jpeg", upsert: true });
    return NextResponse.json({ ok: true, url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/game-assets/brand/icon.jpg` });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
