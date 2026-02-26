import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { generateRoomCode } from "@/lib/game-engine";
import { DEFAULT_CONFIG } from "@/types";

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Auth required" }, { status: 401 });
  let code = generateRoomCode(); let attempts = 0;
  while (attempts < 10) {
    const { data: existing } = await supabase.from("rooms").select("id").eq("code", code).single();
    if (!existing) break;
    code = generateRoomCode(); attempts++;
  }
  const { data: room, error: roomErr } = await supabase.from("rooms").insert({ code, host_id: user.id, status: "lobby", config: DEFAULT_CONFIG }).select().single();
  if (roomErr) return NextResponse.json({ error: "Erreur creation salle" }, { status: 500 });
  await supabase.from("players").insert({ room_id: room.id, user_id: user.id, name: name.trim() });
  return NextResponse.json({ code, roomId: room.id });
}
