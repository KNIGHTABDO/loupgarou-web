// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { assignRoles, getNextNightRole } from "@/lib/game-engine";
import type { RoleName, Player } from "@/types";

export async function POST(req: NextRequest) {
  const { roomId, userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "Auth required" }, { status: 401 });
  const supabase = createServerClient();
  const { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).single();
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (room.host_id !== userId) return NextResponse.json({ error: "Host only" }, { status: 403 });
  const { data: players } = await supabase.from("players").select("*").eq("room_id", roomId);
  if (!players || players.length < 4) return NextResponse.json({ error: "Minimum 4 joueurs" }, { status: 400 });
  const config = room.config as Record<RoleName, number>;
  const totalRoles = Object.values(config).reduce((a: number, b) => a + (b as number), 0);
  if (totalRoles !== players.length) return NextResponse.json({ error: totalRoles + " roles pour " + players.length + " joueurs" }, { status: 400 });
  const roleMap = assignRoles(players.map((p: Player) => p.id), config);
  await Promise.all(Object.entries(roleMap).map(([pid, role]) => supabase.from("players").update({ role }).eq("id", pid)));
  const alivePlayers: Player[] = (players as Player[]).map((p) => ({ ...p, role: roleMap[p.id] as RoleName, is_alive: true }));
  const firstRole = getNextNightRole([], alivePlayers);
  await supabase.from("rooms").update({ status: "role_reveal", night_number: 1, current_phase_role: firstRole, completed_night_roles: [], day_number: 1 }).eq("id", roomId);
  await supabase.from("events").insert({ room_id: roomId, night: 1, type: "phase_change", payload: { message: "La partie commence! Regardez votre role secret." } });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  fetch(appUrl + "/api/room/generate-images", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId }),
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
