// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { generateRoomCode, assignRoles, getNextNightRole } from "@/lib/game-engine";
import type { RoleName, Player } from "@/types";

const BOT_NAMES = ["Merlin", "Isolde", "Lancelot", "Guenièvre", "Perceval", "Morgane", "Galahad"];

// 8 players: you + 7 bots
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
  let code = generateRoomCode();
  for (let i = 0; i < 10; i++) {
    const { data: ex } = await supabase.from("rooms").select("id").eq("code", code).single();
    if (!ex) break;
    code = generateRoomCode();
  }

  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .insert({ code, host_id: userId, status: "lobby", config: TEST_CONFIG })
    .select()
    .single();
  if (roomErr) return NextResponse.json({ error: "Erreur création salle: " + roomErr.message }, { status: 500 });

  // Add real player
  const { error: realPlayerErr } = await supabase.from("players").insert({
    room_id: room.id,
    user_id: userId,
    name: (playerName || "Toi").trim(),
    is_alive: true,
  });
  if (realPlayerErr) return NextResponse.json({ error: "Real player error: " + realPlayerErr.message }, { status: 500 });

  // Add 7 bots — use random valid UUIDs for user_id
  const botInserts = BOT_NAMES.map((botName) => ({
    room_id: room.id,
    user_id: crypto.randomUUID(),
    name: botName,
    is_alive: true,
    is_bot: true,
  }));
  const { error: botsErr } = await supabase.from("players").insert(botInserts);
  if (botsErr) return NextResponse.json({ error: "Bots error: " + botsErr.message }, { status: 500 });

  // Fetch all 8 players
  const { data: players, error: playersErr } = await supabase
    .from("players").select("*").eq("room_id", room.id);
  if (!players || playersErr) return NextResponse.json({ error: "Players fetch error" }, { status: 500 });
  if (players.length !== 8) return NextResponse.json({ error: "Expected 8 players, got " + players.length }, { status: 500 });

  // Assign roles
  const roleMap = assignRoles(players.map((p: Player) => p.id), TEST_CONFIG);
  await Promise.all(
    Object.entries(roleMap).map(([pid, role]) =>
      supabase.from("players").update({ role }).eq("id", pid)
    )
  );

  // Compute first night role
  const alivePlayers: Player[] = players.map((p: Player) => ({
    ...p,
    role: roleMap[p.id] as RoleName,
    is_alive: true,
  }));
  const firstRole = getNextNightRole([], alivePlayers);

  // Start game
  const { error: updateErr } = await supabase.from("rooms").update({
    status: "role_reveal",
    night_number: 1,
    day_number: 1,
    current_phase_role: firstRole,
    completed_night_roles: [],
  }).eq("id", room.id);
  if (updateErr) return NextResponse.json({ error: "Room update error: " + updateErr.message }, { status: 500 });

  await supabase.from("events").insert({
    room_id: room.id,
    night: 1,
    type: "phase_change",
    payload: { message: "Partie test créée! 7 bots vous rejoignent. Regardez votre rôle secret." },
  });

  return NextResponse.json({ code, roomId: room.id });
}
