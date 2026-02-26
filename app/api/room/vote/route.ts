import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { tallyVotes, checkWinCondition, getLoverCascade, getNextNightRole } from "@/lib/game-engine";
import type { Player } from "@/types";

export async function POST(req: NextRequest) {
  const { roomId } = await req.json();
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  const { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).single();
  if (!room || room.host_id !== user?.id) return NextResponse.json({ error: "Host only" }, { status: 403 });
  const { data: votes } = await supabase.from("votes").select("*").eq("room_id", roomId).eq("day", room.day_number);
  const { data: players } = await supabase.from("players").select("*").eq("room_id", roomId);
  if (!votes || !players) return NextResponse.json({ error: "Data error" }, { status: 500 });
  const alive = players.filter((p: Player) => p.is_alive);
  const { eliminated, tie } = tallyVotes(votes, alive);
  const lovers = room.lovers as [string, string] | null;
  const deaths: string[] = [];
  const summary: string[] = [];
  if (!tie && eliminated) {
    deaths.push(eliminated);
    const ep = players.find((p: Player) => p.id === eliminated);
    summary.push(`${ep?.name} a ete elimine(e)! Role: ${ep?.role}`);
    const c = getLoverCascade(eliminated, alive, lovers);
    if (c) { deaths.push(c); summary.push(`${players.find((p: Player) => p.id === c)?.name} est mort(e) de chagrin!`); }
  } else { summary.push("Egalite! Personne n'est elimine."); }
  if (deaths.length > 0) await supabase.from("players").update({ is_alive: false }).in("id", deaths);
  for (const did of deaths) { const p = players.find((pl: Player) => pl.id === did); await supabase.from("events").insert({ room_id: roomId, day: room.day_number, type: "death", payload: { playerId: did, playerName: p?.name, message: `${p?.name} a ete elimine(e).` } }); }
  const updated = players.map((p: Player) => ({ ...p, is_alive: deaths.includes(p.id) ? false : p.is_alive }));
  const winner = checkWinCondition(updated, lovers);
  if (winner) { await supabase.from("rooms").update({ status: "ended", winner }).eq("id", roomId); }
  else {
    const aliveNow = updated.filter((p: Player) => p.is_alive);
    const nextRole = getNextNightRole([], aliveNow);
    await supabase.from("rooms").update({ status: "night", night_number: room.night_number + 1, current_phase_role: nextRole, completed_night_roles: [], night_summary: [] }).eq("id", roomId);
  }
  return NextResponse.json({ ok: true, summary, winner });
}
