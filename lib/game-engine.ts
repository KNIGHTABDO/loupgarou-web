import type { Player, RoleName, NightAction, Vote, Winner, RoomStatus } from "@/types";
import { NIGHT_ORDER } from "@/types";

export function checkWinCondition(players: Player[], lovers: [string, string] | null): Winner {
  const alive = players.filter((p) => p.is_alive);
  const wolves = alive.filter((p) => p.role === "Loup-Garou");
  const villagers = alive.filter((p) => p.role !== "Loup-Garou");
  if (wolves.length === 0) return "villagers";
  if (wolves.length >= villagers.length) return "wolves";
  if (lovers && alive.length === 2) {
    const aliveIds = new Set(alive.map((p) => p.id));
    if (aliveIds.has(lovers[0]) && aliveIds.has(lovers[1])) return "lovers";
  }
  return null;
}

export function getLoverCascade(victimId: string, players: Player[], lovers: [string, string] | null): string | null {
  if (!lovers) return null;
  const [l1, l2] = lovers;
  if (victimId !== l1 && victimId !== l2) return null;
  const otherId = victimId === l1 ? l2 : l1;
  const other = players.find((p) => p.id === otherId);
  if (!other || !other.is_alive) return null;
  return otherId;
}

export function compileNightResult(actions: NightAction[], players: Player[], lovers: [string, string] | null) {
  const byType = (t: string) => actions.find((a) => a.action_type === t);
  const wolfKill = byType("kill");
  const heal = byType("heal");
  const poison = byType("poison");
  const protect = byType("protect");
  const deaths: string[] = [];
  const summary: string[] = [];
  const getName = (id: string) => players.find((p) => p.id === id)?.name ?? "???";
  const protectedId = protect?.target_id ?? null;
  if (wolfKill?.target_id) {
    const tid = wolfKill.target_id;
    if (protectedId === tid) {
      summary.push(`\uD83D\uDEE1\uFE0F Le Garde a protege ${getName(tid)} cette nuit!`);
    } else if (heal?.target_id === tid) {
      summary.push(`\uD83E\uDDEA La Sorciere a sauve quelqu'un cette nuit!`);
    } else {
      deaths.push(tid);
      summary.push(`\uD83D\uDC3A ${getName(tid)} a ete devore par les loups-garous!`);
      const c = getLoverCascade(tid, players, lovers);
      if (c) { deaths.push(c); summary.push(`\uD83D\uDC94 ${getName(c)} est mort(e) de chagrin!`); }
    }
  } else if (!wolfKill) { summary.push(`\uD83D\uDE34 Rien ne s'est passe cette nuit...`); }
  if (poison?.target_id) {
    const pid = poison.target_id;
    if (!deaths.includes(pid)) {
      deaths.push(pid);
      summary.push(`\u2620\uFE0F ${getName(pid)} a ete empoisonne(e) par la Sorciere!`);
      const c = getLoverCascade(pid, players, lovers);
      if (c && !deaths.includes(c)) { deaths.push(c); summary.push(`\uD83D\uDC94 ${getName(c)} est mort(e) de chagrin!`); }
    }
  }
  if (summary.length === 0) summary.push(`\uD83D\uDE34 Rien ne s'est passe cette nuit...`);
  return { deaths, saved: !!heal, summary };
}

export function tallyVotes(votes: Vote[], players: Player[]) {
  const counts: Record<string, number> = {};
  for (const v of votes) { counts[v.target_id] = (counts[v.target_id] ?? 0) + 1; }
  let max = 0; let topPlayers: string[] = [];
  for (const [id, count] of Object.entries(counts)) {
    if (count > max) { max = count; topPlayers = [id]; }
    else if (count === max) topPlayers.push(id);
  }
  const tie = topPlayers.length > 1;
  return { eliminated: tie ? null : topPlayers[0] ?? null, counts, tie };
}

export function getNextNightRole(completedRoles: RoleName[], alivePlayers: Player[]): RoleName | null {
  const aliveRoles = new Set(alivePlayers.map((p) => p.role));
  for (const role of NIGHT_ORDER) {
    if (!completedRoles.includes(role) && aliveRoles.has(role)) return role;
  }
  return null;
}

export function assignRoles(playerIds: string[], config: Record<RoleName, number>): Record<string, RoleName> {
  const pool: RoleName[] = [];
  for (const [role, count] of Object.entries(config) as [RoleName, number][]) {
    for (let i = 0; i < count; i++) pool.push(role);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const result: Record<string, RoleName> = {};
  playerIds.forEach((id, idx) => { result[id] = pool[idx]; });
  return result;
}

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function petiteFilleSpyCatch(wolvesCount: number): boolean {
  return Math.random() < Math.min(0.2 * wolvesCount, 0.6);
}

export const PHASE_LABELS: Record<RoomStatus, string> = {
  lobby: "Salle d'attente", role_reveal: "Revelation des Roles",
  night: "Phase de Nuit", day_summary: "Aube", day_vote: "Vote du Village", ended: "Partie Terminee"
};
