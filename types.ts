export type RoleName =
  | "Loup-Garou"
  | "Villageois"
  | "Voyante"
  | "Sorciere"
  | "Chasseur"
  | "Garde"
  | "Cupidon"
  | "Petite Fille";

export type Team = "wolves" | "villagers";
export type Winner = "wolves" | "villagers" | "lovers" | null;
export type RoomStatus = "lobby" | "role_reveal" | "night" | "day_summary" | "day_vote" | "ended";
export type ActionType = "kill" | "heal" | "poison" | "protect" | "reveal" | "spy" | "link_lovers" | "vote" | "shoot" | "pass";

export interface RoleConfig {
  description: string;
  color: string;
  emoji: string;
  team: Team;
  nightOrder: number | null;
}

export const ROLES: Record<RoleName, RoleConfig> = {
  "Loup-Garou": { description: "Chaque nuit, eliminez un villageois avec vos freres. Restez discrets le jour.", color: "#dc2626", emoji: "\uD83D\uDC3A", team: "wolves", nightOrder: 4 },
  "Villageois": { description: "Debusquez les loups-garous lors des votes du village!", color: "#16a34a", emoji: "\uD83D\uDC68\u200D\uD83C\uDF3E", team: "villagers", nightOrder: null },
  "Voyante": { description: "Chaque nuit, decouvrez en secret le role d'un joueur. Guidez le village sans vous devoiler.", color: "#9b59b6", emoji: "\uD83D\uDD2E", team: "villagers", nightOrder: 6 },
  "Sorciere": { description: "Deux potions uniques : une potion de VIE pour sauver, une potion de MORT pour eliminer. Chacune ne s'utilise qu'une fois.", color: "#7c3aed", emoji: "\uD83E\uDDEA", team: "villagers", nightOrder: 5 },
  "Chasseur": { description: "A votre mort, tirez une derniere balle et emportez un joueur de votre choix avec vous!", color: "#92400e", emoji: "\uD83C\uDFF9", team: "villagers", nightOrder: null },
  "Garde": { description: "Chaque nuit, protegez un joueur des loups. Vous ne pouvez pas proteger le meme joueur deux nuits de suite.", color: "#2563eb", emoji: "\uD83D\uDEE1\uFE0F", team: "villagers", nightOrder: 1 },
  "Cupidon": { description: "En debut de partie, unissez deux joueurs par l'amour. Si l'un meurt, l'autre mourra de chagrin. Les amoureux gagnent s'ils sont les deux derniers survivants!", color: "#ec4899", emoji: "\uD83D\uDC98", team: "villagers", nightOrder: 2 },
  "Petite Fille": { description: "Vous pouvez espionner les loups-garous pendant la nuit! Mais si vous vous faites prendre, vous mourrez a la place de la victime des loups.", color: "#d97706", emoji: "\uD83D\uDC67", team: "villagers", nightOrder: 3 },
};

export const NIGHT_ORDER: RoleName[] = ["Garde", "Cupidon", "Petite Fille", "Loup-Garou", "Sorciere", "Voyante"];

export const DEFAULT_CONFIG: Record<RoleName, number> = {
  "Loup-Garou": 2, "Villageois": 3, "Voyante": 1, "Sorciere": 1, "Chasseur": 1, "Cupidon": 1, "Garde": 0, "Petite Fille": 0
};

export interface Room {
  id: string; code: string; host_id: string; status: RoomStatus;
  night_number: number; day_number: number; config: Record<RoleName, number>;
  winner: Winner; current_phase_role: RoleName | null; night_summary: string[];
  lovers: string[] | null; witch_heal_used: boolean; witch_kill_used: boolean;
  chasseur_used: boolean; garde_last_protected: string | null;
  completed_night_roles: RoleName[]; created_at: string;
}

export interface Player {
  id: string; room_id: string; user_id: string; name: string;
  role: RoleName | null; is_alive: boolean; is_lover: boolean;
  avatar_url: string | null; role_card_url: string | null; created_at: string;
}

export interface NightAction {
  id: string; room_id: string; night: number; role: RoleName;
  action_type: ActionType; actor_id: string; target_id: string | null;
  result: Record<string, unknown>; created_at: string;
}

export interface Vote {
  id: string; room_id: string; day: number;
  voter_id: string; target_id: string; created_at: string;
}

export interface GameEvent {
  id: string; room_id: string; night: number | null; day: number | null;
  type: "death" | "save" | "lover_death" | "win" | "phase_change" | "spy" | "reveal" | "vote";
  payload: Record<string, unknown>; created_at: string;
}
