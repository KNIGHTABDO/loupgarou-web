// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { generateRoomCode, assignRoles, getNextNightRole } from "@/lib/game-engine";
import type { RoleName, Player } from "@/types";

// Bot names and configuration
const BOT_NAMES = ["Merlin", "Isolde", "Lancelot", "Guenièvre", "Perceval", "Morgane", "Galahad", "Arthur", "Viviane", "Tristan", "Elaine", "Gauvain"];

// Role config for 8 players (balanced test game)
const TEST_CONFIG: Record<RoleName, number> = {
  "Loup-Garou": 2,
  "Villageois": 2,
  "Voyante": 1,
  "Sorciere": 1,
  "Chasseur": 1,
  "Cupidon": 0,
  "Garde": 1,
  "Petite Fille": 0,
};

export async function POST(req: NextRequest) {
  const { userId, playerName } = await req.json();
  if (!userId) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const supabase = createServerClient();

  // Create room
  let code = generateRoomCode(); let attempts = 0;
  while (attempts < 10) {
    const { data: existing } = await supabase.from("rooms").select("id").eq("code", code).single();
    if (!existing) break;
    code = generateRoomCode(); attempts++;
  }

  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .insert({ code, host_id: userId, status: "lobby", config: TEST_CONFIG })
    .select()
    .single();
  if (roomErr) return NextResponse.json({ error: "Erreur création salle" }, { status: 500 });

  // Add the real player first
  await supabase.from("players").insert({ room_id: room.id, user_id: userId, name: playerName?.trim() || "Toi" });

  // Add 7 bots (fake user IDs)
  const botNames = BOT_NAMES.slice(0, 7);
  const botInserts = botNames.map((botName, i) => ({
    room_id: room.id,
    user_id: "bot-" + room.id.slice(0, 8) + "-" + i,
    name: botName,
    is_bot: true,
  }));
  await supabase.from("players").insert(botInserts);

  // Fetch all players and start the game immediately
  const { data: players } = await supabase.from("players").select("*").eq("room_id", room.id);
  if (!players) return NextResponse.json({ error: "Players error" }, { status: 500 });

  const roleMap = assignRoles(players.map((p: Player) => p.id), TEST_CONFIG);
  await Promise.all(Object.entries(roleMap).map(([pid, role]) => supabase.from("players").update({ role }).eq("id", pid)));

  const alivePlayers: Player[] = (players as Player[]).map((p) => ({
    ...p,
    role: roleMap[p.id] as RoleName,
    is_alive: true,
  }));
  const firstRole = getNextNightRole([], alivePlayers);

  await supabase.from("rooms").update({
    status: "role_reveal",
    night_number: 1,
    day_number: 1,
    current_phase_role: firstRole,
    completed_night_roles: [],
  }).eq("id", room.id);

  await supabase.from("events").insert({
    room_id: room.id,
    night: 1,
    type: "phase_change",
    payload: { message: "Partie test créée! 7 bots vous attendent. Regardez votre rôle secret." },
  });

  return NextResponse.json({ code, roomId: room.id });
}
