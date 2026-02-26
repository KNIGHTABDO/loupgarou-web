// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { roomId } = await req.json();
  const supabase = createServerClient();
  const { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).single();
  if (!room || room.status !== "role_reveal") return NextResponse.json({ ok: true });
  await supabase.from("rooms").update({ status: "night" }).eq("id", roomId);
  await supabase.from("events").insert({
    room_id: roomId, night: room.night_number, type: "phase_change",
    payload: { message: "La nuit tombe sur le village… Fermez les yeux." },
  });
  return NextResponse.json({ ok: true });
}
