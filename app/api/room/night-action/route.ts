import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getNextNightRole, compileNightResult, checkWinCondition } from "@/lib/game-engine";
import type { RoleName, Player, NightAction } from "@/types";

export async function POST(req: NextRequest) {
  const { roomId, role } = await req.json();
  const supabase = createRouteHandlerClient({ cookies });
  const { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).single();
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  const completed: RoleName[] = [...(room.completed_night_roles ?? []), role as RoleName];
  const { data: players } = await supabase.from("players").select("*").eq("room_id", roomId);
  const alive = (players ?? []).filter((p: Player) => p.is_alive);
  if (role === "Cupidon") {
    const { data: action } = await supabase.from("night_actions").select("*").eq("room_id", roomId).eq("night", room.night_number).eq("role", "Cupidon").single();
    if (action?.target_id && (action.result as { lover2?: string }).lover2) {
      const l1 = action.target_id; const l2 = (action.result as { lover2: string }).lover2;
      await supabase.from("rooms").update({ lovers: [l1, l2] }).eq("id", roomId);
      await supabase.from("players").update({ is_lover: true }).in("id", [l1, l2]);
    }
  }
  const nextRole = getNextNightRole(completed, alive);
  if (!nextRole) {
    const { data: actions } = await supabase.from("night_actions").select("*").eq("room_id", roomId).eq("night", room.night_number);
    const lovers = room.lovers as [string, string] | null;
    const { deaths, summary } = compileNightResult((actions ?? []) as NightAction[], players ?? [], lovers);
    if (deaths.length > 0) await supabase.from("players").update({ is_alive: false }).in("id", deaths);
    for (const did of deaths) { const p = (players ?? []).find((pl: Player) => pl.id === did); await supabase.from("events").insert({ room_id: roomId, night: room.night_number, type: "death", payload: { playerId: did, playerName: p?.name, message: `${p?.name} est mort(e) cette nuit.` } }); }
    const updated = (players ?? []).map((p: Player) => ({ ...p, is_alive: !deaths.includes(p.id) }));
    const winner = checkWinCondition(updated, lovers);
    if (winner) { await supabase.from("rooms").update({ status: "ended", winner, night_summary: summary, completed_night_roles: completed, day_number: room.day_number + 1 }).eq("id", roomId); }
    else { await supabase.from("rooms").update({ status: "day_summary", night_summary: summary, completed_night_roles: completed, day_number: room.day_number + 1 }).eq("id", roomId); }
    return NextResponse.json({ ok: true, summary, winner });
  }
  await supabase.from("rooms").update({ status: "night", current_phase_role: nextRole, completed_night_roles: completed }).eq("id", roomId);
  return NextResponse.json({ ok: true, nextRole });
}
