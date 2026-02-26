// @ts-nocheck
"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import type { Room, Player, Vote, GameEvent, RoleName, NightAction } from "@/types";
import { ROLES } from "@/types";

const supabase = createClient();

/* ─── helpers ─── */
function cls(...c: (string | false | undefined | null)[]) { return c.filter(Boolean).join(" "); }

function PhaseBar({ room }: { room: Room }) {
  const map: Record<string, { icon: string; label: string; color: string }> = {
    lobby:        { icon: "🏠", label: "Salle",          color: "#c9a84c" },
    role_reveal:  { icon: "🃏", label: "Rôles",          color: "#9b59b6" },
    night:        { icon: "🌙", label: `Nuit ${room.night_number}`, color: "#6366f1" },
    day_summary:  { icon: "🌅", label: "Aube",           color: "#f97316" },
    day_vote:     { icon: "⚖️",  label: `Vote J${room.day_number}`, color: "#dc2626" },
    ended:        { icon: "🏆", label: "Terminé",        color: "#c9a84c" },
  };
  const p = map[room.status] ?? map.lobby;
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-cinzel text-xs"
      style={{ background: `${p.color}20`, border: `1px solid ${p.color}40`, color: p.color }}>
      <span>{p.icon}</span><span>{p.label}</span>
    </div>
  );
}

/* ─── main ─── */
export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [myNightAction, setMyNightAction] = useState<NightAction | null>(null);
  const [showRoleCard, setShowRoleCard] = useState(false);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sorcHealUsed, setSorcHealUsed] = useState(false);
  const [sorcKillUsed, setSorcKillUsed] = useState(false);
  const [sorcMode, setSorcMode] = useState<"heal" | "poison" | null>(null);
  const [voyResult, setVoyResult] = useState<{ name: string; role: RoleName } | null>(null);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStatusRef = useRef<string | null>(null);

  const myPlayer = players.find((p) => p.user_id === userId) ?? null;
  const isHost = room?.host_id === userId;
  const alive = players.filter((p) => p.is_alive);
  const dead = players.filter((p) => !p.is_alive);

  /* ── auth ── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const s = data?.session;
      if (s) setUserId(s.user.id);
      else supabase.auth.signInAnonymously().then((r) => setUserId(r.data?.user?.id ?? null));
    });
  }, []);

  /* ── load ── */
  const loadRoom = useCallback(async () => {
    const { data: r } = await supabase.from("rooms").select("*").eq("code", code).single();
    if (!r) { setError("Salle introuvable"); setLoading(false); return; }
    setRoom(r);
    setSorcHealUsed(r.witch_heal_used ?? false);
    setSorcKillUsed(r.witch_kill_used ?? false);
    const { data: pl } = await supabase.from("players").select("*").eq("room_id", r.id).order("created_at");
    setPlayers(pl ?? []);
    const { data: v } = await supabase.from("votes").select("*").eq("room_id", r.id).eq("day", r.day_number);
    setVotes(v ?? []);
    const { data: ev } = await supabase.from("events").select("*").eq("room_id", r.id).order("created_at", { ascending: false }).limit(30);
    setEvents(ev ?? []);
    setLoading(false);
  }, [code]);

  useEffect(() => { if (userId) loadRoom(); }, [userId, loadRoom]);

  /* ── realtime ── */
  useEffect(() => {
    if (!room) return;
    const ch = supabase.channel(`room-${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${room.id}` }, (p) => {
        setRoom(p.new as Room);
        setSorcHealUsed((p.new as Room).witch_heal_used ?? false);
        setSorcKillUsed((p.new as Room).witch_kill_used ?? false);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${room.id}` }, () => loadRoom())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "votes", filter: `room_id=eq.${room.id}` }, (p) => setVotes((prev) => [...prev.filter((v) => v.id !== (p.new as Vote).id), p.new as Vote]))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events", filter: `room_id=eq.${room.id}` }, (p) => setEvents((prev) => [p.new as GameEvent, ...prev].slice(0, 30)))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [room?.id, loadRoom]);

  /* ── role reveal → show card ── */
  useEffect(() => {
    if (room?.status === "role_reveal" && myPlayer?.role) setShowRoleCard(true);
  }, [room?.status, myPlayer?.role]);

  /* ── reset per-phase state on phase change ── */
  useEffect(() => {
    if (!room) return;
    if (prevStatusRef.current !== room.status) {
      prevStatusRef.current = room.status;
      setMyNightAction(null);
      setMyVote(null);
      setSorcMode(null);
      setVoyResult(null);
    }
  }, [room?.status]);

  /* ── bot autopilot ── */
  useEffect(() => {
    if (!room || !players.length) return;
    if (botTimerRef.current) clearTimeout(botTimerRef.current);

    const bots = players.filter((p) => p.is_bot && p.is_alive);
    if (!bots.length) return;

    // role_reveal: host auto-advances after delay (only in tester/bot game)
    if (room.status === "role_reveal" && isHost && bots.length > 0) {
      botTimerRef.current = setTimeout(async () => {
        await fetch("/api/room/bot-turn", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: room.id, action: "advance_from_reveal", userId }),
        });
      }, 6000);
    }

    // night: bots act for their role, then trigger night-action resolution
    if (room.status === "night" && room.current_phase_role) {
      const botWithRole = bots.find((b) => b.role === room.current_phase_role);
      if (botWithRole) {
        botTimerRef.current = setTimeout(async () => {
          await fetch("/api/room/bot-turn", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomId: room.id, action: "night_act", botId: botWithRole.id, role: room.current_phase_role, userId }),
          });
        }, 2000 + Math.random() * 2000);
      }
    }

    // day_summary: host auto-opens vote
    if (room.status === "day_summary" && isHost && bots.length > 0) {
      botTimerRef.current = setTimeout(async () => {
        await fetch(`/api/room/vote`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: room.id, userId }),
        });
      }, 4000);
    }

    // day_vote: bots vote after delay, then host closes vote
    if (room.status === "day_vote") {
      const aliveP = players.filter((p) => p.is_alive);
      botTimerRef.current = setTimeout(async () => {
        await fetch("/api/room/bot-turn", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: room.id, action: "vote", userId }),
        });
      }, 3000 + Math.random() * 2000);
    }

    return () => { if (botTimerRef.current) clearTimeout(botTimerRef.current); };
  }, [room?.status, room?.current_phase_role, room?.id, isHost, players]);

  /* ── actions ── */
  const submitNightAction = useCallback(async (actionType: string, targetId: string | null, extra?: Record<string, unknown>) => {
    if (!myPlayer || !room || myNightAction) return;
    const { data } = await supabase.from("night_actions")
      .insert({ room_id: room.id, night: room.night_number, role: myPlayer.role, action_type: actionType, actor_id: myPlayer.id, target_id: targetId, result: extra ?? {} })
      .select().single();
    if (data) setMyNightAction(data as NightAction);

    // If voyante, show result locally
    if (myPlayer.role === "Voyante" && targetId) {
      const target = players.find((p) => p.id === targetId);
      if (target?.role) setVoyResult({ name: target.name, role: target.role as RoleName });
    }

    await fetch("/api/room/night-action", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: room.id, role: myPlayer.role }),
    });
  }, [myPlayer, room, myNightAction, players]);

  const submitVote = useCallback(async (targetId: string) => {
    if (!myPlayer || !room || myVote) return;
    setMyVote(targetId);
    await supabase.from("votes").upsert(
      { room_id: room.id, day: room.day_number, voter_id: myPlayer.id, target_id: targetId },
      { onConflict: "room_id,day,voter_id" }
    );
  }, [myPlayer, room, myVote]);

  const hostAction = async (action: string) => {
    await fetch(`/api/room/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: room!.id, userId }),
    });
  };

  /* ── my night turn UI ── */
  const isMyNightTurn = room?.status === "night" && room.current_phase_role === myPlayer?.role && !myNightAction && myPlayer?.is_alive;

  const NightActionUI = () => {
    if (!myPlayer || !room || !isMyNightTurn) return null;
    const role = myPlayer.role as RoleName;
    const targets = alive.filter((p) => p.id !== myPlayer.id);

    if (role === "Loup-Garou") {
      const teammates = players.filter((p) => p.role === "Loup-Garou" && p.id !== myPlayer.id);
      return (
        <div className="space-y-4">
          {teammates.length > 0 && (
            <div className="p-3 rounded-xl" style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)" }}>
              <p className="font-cinzel text-wolves text-xs uppercase mb-1">Vos frères loups</p>
              <p className="text-wolves/70 text-sm">{teammates.map((t) => t.name).join(", ")}</p>
            </div>
          )}
          <p className="font-cinzel text-xs text-wolves/80 uppercase tracking-widest">Choisissez votre victime</p>
          <div className="grid grid-cols-2 gap-3">
            {targets.map((p) => (
              <button key={p.id} onClick={() => submitNightAction("kill", p.id)}
                className="glass rounded-xl p-4 text-center hover:scale-105 active:scale-95 transition-all"
                style={{ borderColor: "rgba(220,38,38,0.3)" }}>
                <div className="text-3xl mb-2">🎭</div>
                <p className="font-cinzel text-sm text-white">{p.name}</p>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (role === "Voyante") {
      if (voyResult) {
        const rc = ROLES[voyResult.role];
        return (
          <div className="text-center p-6 rounded-2xl" style={{ background: `${rc.color}15`, border: `1px solid ${rc.color}30` }}>
            <div className="text-5xl mb-3">{rc.emoji}</div>
            <p className="font-cinzel text-white/60 text-xs uppercase mb-1">Vous apprenez que</p>
            <p className="font-cinzel font-bold text-xl text-white mb-1">{voyResult.name}</p>
            <p className="font-cinzel font-bold text-lg" style={{ color: rc.color }}>est {voyResult.role}</p>
            <p className="text-white/40 text-xs mt-3">Cette information est votre secret</p>
          </div>
        );
      }
      return (
        <div className="space-y-3">
          <p className="font-cinzel text-xs text-purple-400 uppercase tracking-widest">Découvrez le rôle d'un joueur</p>
          <div className="grid grid-cols-2 gap-3">
            {targets.map((p) => (
              <button key={p.id} onClick={() => submitNightAction("reveal", p.id)}
                className="glass rounded-xl p-4 text-center hover:scale-105 active:scale-95 transition-all"
                style={{ borderColor: "rgba(155,89,182,0.3)" }}>
                <div className="text-3xl mb-2">🔮</div>
                <p className="font-cinzel text-sm text-white">{p.name}</p>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (role === "Sorciere") {
      return (
        <div className="space-y-4">
          <div className="flex gap-3">
            {!sorcHealUsed && (
              <button onClick={() => setSorcMode(sorcMode === "heal" ? null : "heal")}
                className={cls("flex-1 py-3 rounded-xl font-cinzel text-sm transition-all", sorcMode === "heal" ? "bg-green-600 text-white" : "glass text-green-400 border-green-500/30")}>
                🧪 Potion de Vie
              </button>
            )}
            {!sorcKillUsed && (
              <button onClick={() => setSorcMode(sorcMode === "poison" ? null : "poison")}
                className={cls("flex-1 py-3 rounded-xl font-cinzel text-sm transition-all", sorcMode === "poison" ? "bg-red-700 text-white" : "glass text-red-400 border-red-500/30")}>
                ☠️ Poison
              </button>
            )}
          </div>
          {sorcMode && (
            <div className="grid grid-cols-2 gap-3">
              {targets.map((p) => (
                <button key={p.id} onClick={() => { submitNightAction(sorcMode === "heal" ? "heal" : "poison", p.id); setSorcMode(null); }}
                  className="glass rounded-xl p-3 text-center hover:scale-105 transition-all">
                  <div className="text-2xl mb-1">{sorcMode === "heal" ? "💚" : "☠️"}</div>
                  <p className="font-cinzel text-xs text-white">{p.name}</p>
                </button>
              ))}
            </div>
          )}
          <button onClick={() => submitNightAction("pass", null)}
            className="w-full py-2 rounded-xl border border-white/10 font-cinzel text-white/40 text-sm hover:text-white/60 transition-all">
            Ne rien faire
          </button>
        </div>
      );
    }

    if (role === "Garde") {
      return (
        <div className="space-y-3">
          <p className="font-cinzel text-xs text-blue-400 uppercase tracking-widest">Protégez un joueur cette nuit</p>
          <div className="grid grid-cols-2 gap-3">
            {targets.map((p) => (
              <button key={p.id} onClick={() => submitNightAction("protect", p.id)}
                className="glass rounded-xl p-4 text-center hover:scale-105 active:scale-95 transition-all"
                style={{ borderColor: "rgba(37,99,235,0.3)" }}>
                <div className="text-3xl mb-2">🛡️</div>
                <p className="font-cinzel text-sm text-white">{p.name}</p>
              </button>
            ))}
          </div>
          <button onClick={() => submitNightAction("pass", null)}
            className="w-full py-2 rounded-xl border border-white/10 font-cinzel text-white/40 text-sm hover:text-white/60 transition-all">
            Ne protéger personne
          </button>
        </div>
      );
    }

    if (role === "Cupidon" && room.night_number === 1) {
      return (
        <div className="space-y-3">
          <p className="font-cinzel text-xs text-pink-400 uppercase tracking-widest">Liez deux amoureux (vous pouvez vous inclure)</p>
          <p className="text-white/40 text-xs">Cliquez deux joueurs pour les unir</p>
          <CupidonPicker alive={[myPlayer, ...targets]} onLink={(a, b) => submitNightAction("link_lovers", a, { lover2: b })} />
        </div>
      );
    }

    if (role === "Petite Fille") {
      return (
        <div className="text-center space-y-4">
          <div className="text-5xl">👧</div>
          <p className="font-cinzel text-amber-400">Vous espionnez les loups...</p>
          <p className="text-white/40 text-sm">Vous pouvez voir dans la nuit.<br/>Mais faites attention à ne pas vous faire repérer.</p>
          <button onClick={() => submitNightAction("spy", null)}
            className="w-full py-3 rounded-xl bg-amber-600/20 border border-amber-500/40 font-cinzel text-amber-400 hover:bg-amber-600/30 transition-all">
            Terminer l'espionnage
          </button>
        </div>
      );
    }

    return (
      <button onClick={() => submitNightAction("pass", null)}
        className="w-full py-3 rounded-xl border border-white/10 font-cinzel text-white/40 text-sm hover:text-white/60 transition-all">
        Passer la nuit
      </button>
    );
  };

  /* ── loading / error ── */
  if (loading) return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="text-5xl">🌙</motion.div>
    </div>
  );
  if (error || !room) return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center text-center px-4">
      <div>
        <p className="text-wolves font-cinzel text-xl mb-4">{error || "Salle introuvable"}</p>
        <a href="/" className="text-gold font-cinzel underline">Retour</a>
      </div>
    </div>
  );

  /* ── render ── */
  return (
    <div className="min-h-screen bg-bg-base">
      {room.status === "night" && <div className="fixed inset-0 night-overlay z-0 pointer-events-none" />}

      {/* Role card modal */}
      <AnimatePresence>
        {showRoleCard && myPlayer?.role && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.8, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.8, opacity: 0 }}
              className="w-full max-w-sm">
              <p className="text-center font-cinzel text-gold/80 text-xs tracking-[0.3em] uppercase mb-6">Votre rôle secret</p>
              <div className="glass rounded-3xl overflow-hidden"
                style={{ border: `1px solid ${ROLES[myPlayer.role]?.color}50`, boxShadow: `0 0 80px ${ROLES[myPlayer.role]?.color}25` }}>
                <div className="aspect-[3/4] flex items-center justify-center"
                  style={{ background: `radial-gradient(ellipse at center, ${ROLES[myPlayer.role]?.color}25, #07070f)` }}>
                  {myPlayer.role_card_url
                    ? <img src={myPlayer.role_card_url} alt={myPlayer.role} className="w-full h-full object-cover" />
                    : <span className="text-[100px]">{ROLES[myPlayer.role]?.emoji}</span>}
                </div>
                <div className="p-6">
                  <p className="font-cinzel text-white/40 text-xs uppercase tracking-widest mb-1">Vous êtes</p>
                  <h3 className="font-cinzel font-bold text-2xl" style={{ color: ROLES[myPlayer.role]?.color }}>
                    {ROLES[myPlayer.role]?.emoji} {myPlayer.role}
                  </h3>
                  <p className="text-white/60 text-sm mt-2 leading-relaxed">{ROLES[myPlayer.role]?.description}</p>
                  {myPlayer.role === "Loup-Garou" && (
                    <div className="mt-3 p-3 rounded-xl" style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.3)" }}>
                      <p className="font-cinzel text-wolves text-xs uppercase mb-1">Vos frères loups</p>
                      <p className="text-wolves/80 text-sm">
                        {players.filter((p) => p.role === "Loup-Garou" && p.id !== myPlayer.id).map((p) => p.name).join(", ") || "Aucun"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => setShowRoleCard(false)}
                className="w-full mt-4 py-3.5 bg-gold/20 border border-gold/40 rounded-xl font-cinzel text-gold hover:bg-gold/30 transition-all font-semibold">
                J'ai compris mon rôle ✓
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50 glass-dark border-b border-bg-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">🐺</span>
            <div>
              <h1 className="font-cinzel font-bold text-white text-sm">Loup-Garou</h1>
              <p className="text-white/30 text-xs font-cinzel">CODE: {code}</p>
            </div>
          </div>
          <PhaseBar room={room} />
          {myPlayer?.role && (
            <button onClick={() => setShowRoleCard(true)}
              className="flex items-center gap-2 glass rounded-xl px-3 py-1.5 hover:border-gold/40 transition-all">
              <span>{ROLES[myPlayer.role]?.emoji}</span>
              <span className="font-cinzel text-xs text-white/60 hidden sm:block">{myPlayer.role}</span>
            </button>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-4 py-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">

          {/* Main panel */}
          <div className="space-y-4">
            <AnimatePresence mode="wait">

              {/* LOBBY */}
              {room.status === "lobby" && (
                <motion.div key="lobby" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="glass rounded-2xl p-6">
                  <div className="text-center mb-8">
                    <p className="font-cinzel text-white/40 text-xs uppercase tracking-widest mb-3">Code de la salle</p>
                    <div className="inline-block glass rounded-2xl px-8 py-4" style={{ border: "1px solid rgba(201,168,76,0.4)" }}>
                      <span className="font-cinzel font-black text-4xl md:text-5xl text-gold tracking-[0.4em]">{room.code}</span>
                    </div>
                    <p className="text-white/30 text-xs mt-3">Partagez ce code avec vos amis</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
                    {players.map((p) => (
                      <div key={p.id} className="glass rounded-xl px-3 py-2 flex items-center gap-2">
                        <span className="text-lg">🧙</span>
                        <span className="font-cinzel text-xs text-white truncate">{p.name}</span>
                        {room.host_id === p.user_id && <span className="ml-auto text-gold text-xs">♛</span>}
                      </div>
                    ))}
                  </div>
                  {isHost
                    ? <button onClick={() => hostAction("start")} disabled={players.length < 4}
                        className={cls("w-full py-4 rounded-xl font-cinzel font-bold tracking-widest uppercase transition-all",
                          players.length >= 4 ? "bg-gold text-bg-base hover:bg-gold-light shadow-gold" : "bg-white/5 text-white/20 cursor-not-allowed")}>
                        {players.length >= 4 ? "⚔️ Lancer la Partie" : `En attente (${players.length}/4)`}
                      </button>
                    : <p className="text-center text-white/30 font-cinzel text-sm py-4">En attente de l'hôte…</p>}
                </motion.div>
              )}

              {/* ROLE REVEAL */}
              {room.status === "role_reveal" && (
                <motion.div key="reveal" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="glass rounded-2xl p-6 text-center">
                  <div className="text-5xl mb-4">🃏</div>
                  <h2 className="font-cinzel font-bold text-2xl text-white mb-2">Les rôles ont été distribués</h2>
                  <p className="text-white/50 text-sm mb-6">Consultez votre rôle secret. La nuit tombe dans quelques instants…</p>
                  {myPlayer?.role && (
                    <div className="p-4 rounded-2xl mb-6 inline-block"
                      style={{ background: `${ROLES[myPlayer.role]?.color}15`, border: `1px solid ${ROLES[myPlayer.role]?.color}30` }}>
                      <span className="text-4xl">{ROLES[myPlayer.role]?.emoji}</span>
                      <p className="font-cinzel font-bold mt-2" style={{ color: ROLES[myPlayer.role]?.color }}>{myPlayer.role}</p>
                    </div>
                  )}
                  <button onClick={() => setShowRoleCard(true)}
                    className="w-full py-3 rounded-xl bg-purple-600/30 border border-purple-500/40 font-cinzel text-purple-300 hover:bg-purple-600/40 transition-all">
                    Voir mon rôle en détail
                  </button>
                  {isHost && (
                    <button onClick={() => hostAction("advance-reveal")} className="w-full mt-3 py-3 rounded-xl bg-gold/20 border border-gold/40 font-cinzel text-gold hover:bg-gold/30 transition-all text-sm">
                      Commencer la nuit →
                    </button>
                  )}
                  <p className="text-white/20 text-xs mt-4 font-cinzel">La nuit commence automatiquement…</p>
                </motion.div>
              )}

              {/* NIGHT */}
              {room.status === "night" && myPlayer && (
                <motion.div key="night" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="glass rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-3xl">🌙</span>
                    <div>
                      <h2 className="font-cinzel font-bold text-white text-lg">Nuit {room.night_number}</h2>
                      <p className="text-indigo-400/80 text-xs font-cinzel">
                        {isMyNightTurn ? "⚡ C'est votre tour d'agir" : `⏳ En attente de ${room.current_phase_role ?? "…"}`}
                      </p>
                    </div>
                  </div>

                  {myNightAction ? (
                    <div className="text-center py-6">
                      <div className="text-4xl mb-3">✅</div>
                      <p className="font-cinzel text-gold">Action soumise</p>
                      <p className="text-white/40 text-sm mt-2">En attente des autres joueurs…</p>
                      {voyResult && (
                        <div className="mt-4 p-4 rounded-xl" style={{ background: `${ROLES[voyResult.role]?.color}15`, border: `1px solid ${ROLES[voyResult.role]?.color}30` }}>
                          <p className="font-cinzel text-white/60 text-xs uppercase mb-1">Votre vision</p>
                          <p className="font-cinzel font-bold" style={{ color: ROLES[voyResult.role]?.color }}>
                            {ROLES[voyResult.role]?.emoji} {voyResult.name} est {voyResult.role}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : isMyNightTurn ? (
                    <NightActionUI />
                  ) : (
                    <div className="text-center py-8">
                      <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2, repeat: Infinity }} className="text-5xl mb-4">😴</motion.div>
                      <p className="font-cinzel text-white/40">Le village dort…</p>
                      <p className="text-white/20 text-sm mt-2">{room.current_phase_role} est en train d'agir</p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* DAY SUMMARY */}
              {room.status === "day_summary" && (
                <motion.div key="summary" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="glass rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-3xl">🌅</span>
                    <div>
                      <h2 className="font-cinzel font-bold text-white text-lg">L'Aube se lève</h2>
                      <p className="text-orange-400/80 text-xs">Jour {room.day_number}</p>
                    </div>
                  </div>
                  <div className="space-y-3 mb-6">
                    {(room.night_summary as string[] ?? []).map((msg, i) => (
                      <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.2 }}
                        className="flex items-start gap-3 p-4 rounded-xl"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <p className="text-white/80 text-sm">{msg}</p>
                      </motion.div>
                    ))}
                  </div>
                  {isHost && (
                    <button onClick={() => hostAction("vote")}
                      className="w-full py-3 rounded-xl font-cinzel text-sm transition-all"
                      style={{ background: "rgba(220,38,38,0.2)", border: "1px solid rgba(220,38,38,0.4)", color: "#dc2626" }}>
                      ⚖️ Ouvrir le vote
                    </button>
                  )}
                  <p className="text-white/20 text-xs text-center mt-3 font-cinzel">Le vote s'ouvre automatiquement…</p>
                </motion.div>
              )}

              {/* DAY VOTE */}
              {room.status === "day_vote" && (
                <motion.div key="vote" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="glass rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-3xl">⚖️</span>
                    <div>
                      <h2 className="font-cinzel font-bold text-white">Vote du Village</h2>
                      <p className="text-red-400/80 text-xs">{myVote ? "Vote soumis ✓" : "Qui est le loup-garou?"}</p>
                    </div>
                  </div>
                  {!myPlayer?.is_alive && (
                    <div className="text-center py-4 text-white/30 font-cinzel text-sm mb-4">Vous êtes mort(e) — spectateur uniquement</div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {alive.map((p) => {
                      const vc = votes.filter((v) => v.target_id === p.id).length;
                      const isMe = p.user_id === userId;
                      const voted = myVote === p.id;
                      return (
                        <button key={p.id}
                          onClick={() => myPlayer?.is_alive && !myVote && !isMe && submitVote(p.id)}
                          disabled={!!myVote || isMe || !myPlayer?.is_alive}
                          className={cls("glass rounded-xl p-3 text-center transition-all relative overflow-hidden",
                            voted ? "scale-105" : (!myVote && !isMe && myPlayer?.is_alive) ? "hover:scale-105 cursor-pointer" : "cursor-default")}
                          style={voted ? { borderColor: "#dc2626", boxShadow: "0 0 16px rgba(220,38,38,0.3)" } : {}}>
                          <div className="text-2xl mb-1">🎭</div>
                          <p className="font-cinzel text-xs text-white">{p.name}</p>
                          {isMe && <p className="text-[10px] text-gold/50 font-cinzel">Vous</p>}
                          {vc > 0 && (
                            <span className="absolute top-1 right-1 bg-wolves text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">{vc}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {isHost && (
                    <button onClick={() => hostAction("vote")}
                      className="mt-6 w-full py-3 rounded-xl font-cinzel text-sm transition-all"
                      style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.35)", color: "#dc2626" }}>
                      Clôturer le vote (Host)
                    </button>
                  )}
                </motion.div>
              )}

              {/* WIN SCREEN */}
              {room.status === "ended" && (
                <motion.div key="ended" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  className="glass rounded-3xl p-8 text-center"
                  style={{
                    borderColor: room.winner === "wolves" ? "rgba(220,38,38,0.5)" : room.winner === "lovers" ? "rgba(236,72,153,0.5)" : "rgba(22,163,74,0.5)",
                    boxShadow: `0 0 80px ${room.winner === "wolves" ? "rgba(220,38,38,0.25)" : room.winner === "lovers" ? "rgba(236,72,153,0.25)" : "rgba(201,168,76,0.2)"}`,
                  }}>
                  <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1.5, repeat: Infinity }} className="text-8xl mb-4">
                    {room.winner === "wolves" ? "🐺" : room.winner === "lovers" ? "💕" : "🏰"}
                  </motion.div>
                  <h2 className="font-cinzel font-black text-3xl md:text-4xl mb-2"
                    style={{ color: room.winner === "wolves" ? "#dc2626" : room.winner === "lovers" ? "#ec4899" : "#16a34a" }}>
                    {room.winner === "wolves" ? "Les Loups ont Gagné!" : room.winner === "lovers" ? "Les Amoureux ont Gagné!" : "Le Village a Triomphé!"}
                  </h2>
                  <p className="text-white/40 font-cinzel text-sm mb-8">Nuit {room.night_number} · Jour {room.day_number}</p>
                  <div className="space-y-2 text-left max-h-64 overflow-y-auto mb-6">
                    {players.map((p) => {
                      const rc = ROLES[p.role as RoleName];
                      return (
                        <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl"
                          style={{ background: p.is_alive ? `${rc?.color}15` : "rgba(255,255,255,0.02)", border: `1px solid ${p.is_alive ? `${rc?.color}25` : "rgba(255,255,255,0.05)"}` }}>
                          <span className="text-xl">{rc?.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className={cls("font-cinzel font-bold text-sm", p.is_alive ? "text-white" : "text-white/30")}>{p.name}</p>
                            <p className="text-xs truncate" style={{ color: `${rc?.color}70` }}>{p.role}</p>
                          </div>
                          <span className={cls("text-xs font-cinzel", p.is_alive ? "text-green-400" : "text-white/20")}>
                            {p.is_alive ? "✓ Vivant" : "✝"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <a href="/" className="inline-block bg-gold text-bg-base font-cinzel font-bold px-10 py-4 rounded-xl hover:bg-gold-light transition-all text-lg tracking-widest">
                    Nouvelle Partie
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="glass rounded-2xl p-4">
              <h3 className="font-cinzel text-white/50 text-xs uppercase tracking-widest mb-4">
                Joueurs ({alive.length} en vie)
              </h3>
              <div className="space-y-1.5">
                {players.map((p) => (
                  <div key={p.id}
                    className={cls("flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all",
                      !p.is_alive ? "opacity-40" : "",
                      p.user_id === userId ? "bg-gold/5 border border-gold/20" : "")}>
                    <span className="text-xs">{p.is_alive ? "🟢" : "⚫"}</span>
                    <span className={cls("font-cinzel text-xs truncate", p.is_alive ? "text-white" : "text-white/30")}>{p.name}</span>
                    {p.user_id === userId && <span className="ml-auto text-gold/60 text-[10px] font-cinzel">Vous</span>}
                    {/* Show role on ended screen */}
                    {room.status === "ended" && p.role && (
                      <span className="ml-auto text-[10px]" style={{ color: `${ROLES[p.role as RoleName]?.color}80` }}>{ROLES[p.role as RoleName]?.emoji}</span>
                    )}
                  </div>
                ))}
              </div>
              {dead.length > 0 && dead.some(p => p.role) && room.status !== "ended" && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <p className="font-cinzel text-white/20 text-[10px] uppercase tracking-widest mb-2">Éliminés</p>
                  {dead.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 px-2 py-1 text-white/20">
                      <span className="text-xs">{ROLES[p.role as RoleName]?.emoji ?? "💀"}</span>
                      <span className="font-cinzel text-xs">{p.name}</span>
                      <span className="ml-auto text-[10px]">{p.role}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {events.length > 0 && (
              <div className="glass rounded-2xl p-4">
                <h3 className="font-cinzel text-white/50 text-xs uppercase tracking-widest mb-3">Journal</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {events.slice(0, 15).map((ev) => {
                    const payload = ev.payload as { message?: string };
                    return (
                      <div key={ev.id} className="text-xs text-white/50 flex gap-2 items-start">
                        <span className="shrink-0">{ev.type === "death" ? "💀" : ev.type === "win" ? "🏆" : ev.type === "phase_change" ? "•" : "›"}</span>
                        <span>{payload.message ?? ev.type}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Cupidon two-pick helper ── */
function CupidonPicker({ alive, onLink }: { alive: Player[]; onLink: (a: string, b: string) => void }) {
  const [first, setFirst] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-2 gap-3">
      {alive.map((p) => (
        <button key={p.id}
          onClick={() => {
            if (!first) { setFirst(p.id); return; }
            if (first === p.id) { setFirst(null); return; }
            onLink(first, p.id);
          }}
          className={cls("glass rounded-xl p-3 text-center transition-all",
            first === p.id ? "border-pink-500/70 scale-105" : "hover:scale-105 cursor-pointer")}
          style={first === p.id ? { boxShadow: "0 0 12px rgba(236,72,153,0.3)" } : {}}>
          <div className="text-2xl mb-1">{first === p.id ? "💗" : "💛"}</div>
          <p className="font-cinzel text-xs text-white">{p.name}</p>
        </button>
      ))}
    </div>
  );
}
