import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const { name, code } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  if (!code?.trim()) return NextResponse.json({ error: "Code requis" }, { status: 400 });
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Auth failed" }, { status: 401 });
  const { data: room } = await supabase.from("rooms").select("*").eq("code", code.toUpperCase()).single();
  if (!room) return NextResponse.json({ error: "Salle introuvable" }, { status: 404 });
  if (room.status !== "lobby") return NextResponse.json({ error: "La partie a deja commence" }, { status: 400 });
  const { count } = await supabase.from("players").select("id", { count: "exact", head: true }).eq("room_id", room.id);
  if ((count ?? 0) >= 12) return NextResponse.json({ error: "Salle pleine (max 12)" }, { status: 400 });
  const { data: existing } = await supabase.from("players").select("id").eq("room_id", room.id).eq("user_id", user.id).single();
  if (!existing) await supabase.from("players").insert({ room_id: room.id, user_id: user.id, name: name.trim() });
  return NextResponse.json({ code: room.code, roomId: room.id });
}
