// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { generateRoomCode } from "@/lib/game-engine";
import { DEFAULT_CONFIG } from "@/types";

export async function POST(req: NextRequest) {
  const { name, userId } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  if (!userId) return NextResponse.json({ error: "Auth required" }, { status: 401 });
  const supabase = createServerClient();
  let code = generateRoomCode(); let attempts = 0;
  while (attempts < 10) {
    const { data: existing } = await supabase.from("rooms").select("id").eq("code", code).single();
    if (!existing) break;
    code = generateRoomCode(); attempts++;
  }
  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .insert({ code, host_id: userId, status: "lobby", config: DEFAULT_CONFIG })
    .select()
    .single();
  if (roomErr) return NextResponse.json({ error: "Erreur creation salle" }, { status: 500 });
  await supabase.from("players").insert({ room_id: room.id, user_id: userId, name: name.trim() });
  return NextResponse.json({ code, roomId: room.id });
}
