// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getNextNightRole } from "@/lib/game-engine";
import type { Player, RoleName } from "@/types";

export async function POST(req: NextRequest) {
  const { roomId, action, botId, role, userId } = await req.json();
  const supabase = createServerClient();

  // advance_from_reveal: move room from role_reveal → night
  if (action === "advance_from_reveal") {
    const { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).single();
    if (!room || room.status !== "role_reveal") return NextResponse.json({ ok: true });
    await supabase.from("rooms").update({ status: "night" }).eq("id", roomId);
    await supabase.from("events").insert({
      room_id: roomId, night: room.night_number, type: "phase_change",
      payload: { message: "La nuit tombe sur le village…" },
    });
    return NextResponse.json({ ok: true });
  }

  // night_act: bot with given role takes action
  if (action === "night_act") {
    const { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).single();
    if (!room || room.status !== "night") return NextResponse.json({ ok: true });
    if (room.current_phase_role !== role) return NextResponse.json({ ok: true });

    const { data: players } = await supabase.from("players").select("*").eq("room_id", roomId);
    const alive = (players as Player[]).filter((p) => p.is_alive);
    const humans = alive.filter((p) => !p.is_bot);
    const wolves = alive.filter((p) => p.role === "Loup-Garou");

    // Pick action based on role
    let actionType = "pass";
    let targetId: string | null = null;
    let extra: Record<string, unknown> = {};

    if (role === "Loup-Garou") {
      // Kill a random non-wolf alive player
      const targets = alive.filter((p) => p.role !== "Loup-Garou");
      if (targets.length > 0) {
        const pick = targets[Math.floor(Math.random() * targets.length)];
        actionType = "kill"; targetId = pick.id;
      }
    } else if (role === "Voyante") {
      const targets = alive.filter((p) => p.id !== botId);
      if (targets.length > 0) {
        const pick = targets[Math.floor(Math.random() * targets.length)];
        actionType = "reveal"; targetId = pick.id;
      }
    } else if (role === "Sorciere") {
      actionType = "pass"; // bots don't use potions
    } else if (role === "Garde") {
      const targets = alive.filter((p) => p.id !== botId && p.id !== room.garde_last_protected);
      if (targets.length > 0) {
        const pick = targets[Math.floor(Math.random() * targets.length)];
        actionType = "protect"; targetId = pick.id;
      }
    } else if (role === "Cupidon" && room.night_number === 1) {
      const targets = alive.filter((p) => p.id !== botId);
      if (targets.length >= 2) {
        actionType = "link_lovers";
        targetId = targets[0].id;
        extra = { lover2: targets[1].id };
      }
    } else if (role === "Petite Fille") {
      actionType = "spy";
    }

    // Insert night action
    await supabase.from("night_actions").insert({
      room_id: roomId, night: room.night_number, role,
      action_type: actionType, actor_id: botId, target_id: targetId, result: extra,
    });

    // Advance night phase
    await fetch((process.env.NEXT_PUBLIC_APP_URL ?? "") + "/api/room/night-action", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, role }),
    });

    return NextResponse.json({ ok: true });
  }

  // vote: all bots vote for a random alive non-bot player, then host closes vote
  if (action === "vote") {
    const { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).single();
    if (!room || room.status !== "day_vote") return NextResponse.json({ ok: true });

    const { data: players } = await supabase.from("players").select("*").eq("room_id", roomId);
    const alive = (players as Player[]).filter((p) => p.is_alive);
    const bots = alive.filter((p) => p.is_bot);

    // Get already-voted bots
    const { data: existingVotes } = await supabase.from("votes").select("voter_id").eq("room_id", roomId).eq("day", room.day_number);
    const alreadyVoted = new Set((existingVotes ?? []).map((v) => v.voter_id));

    // Each bot that hasn't voted picks a random target (not themselves)
    const voteInserts = [];
    for (const bot of bots) {
      if (alreadyVoted.has(bot.id)) continue;
      const targets = alive.filter((p) => p.id !== bot.id);
      if (targets.length === 0) continue;
      const pick = targets[Math.floor(Math.random() * targets.length)];
      voteInserts.push({ room_id: roomId, day: room.day_number, voter_id: bot.id, target_id: pick.id });
    }
    if (voteInserts.length > 0) {
      await supabase.from("votes").upsert(voteInserts, { onConflict: "room_id,day,voter_id" });
    }

    // Close vote (tally)
    await fetch((process.env.NEXT_PUBLIC_APP_URL ?? "") + "/api/room/vote", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, userId }),
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
