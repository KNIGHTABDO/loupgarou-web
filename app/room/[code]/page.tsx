// @ts-nocheck
"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import type { Room, Player, Vote, GameEvent, RoleName, NightAction } from "@/types";
import { ROLES } from "@/types";

const supabase = createClient();

function cls(...c: (string | false | undefined | null)[]) {
  return c.filter(Boolean).join(" ");
}

function PhaseBar({ room }: { room: Room }) {
  const map: Record<string, { icon: string; label: string; color: string }> = {
    lobby:       { icon: "🏠", label: "Salle",           color: "#c9a84c" },
    role_reveal: { icon: "🃏", label: "Rôles",           color: "#9b59b6" },
    night:       { icon: "🌙", label: `Nuit ${room.night_number}`, color: "#6366f1" },
    day_summary: { icon: "🌅", label: "Aube",            color: "#f97316" },
    day_vote:    { icon: "⚖️",  label: `Vote J${room.day_number}`, color: "#dc2626" },
    ended:       { icon: "🏆", label: "Fin",             color: "#c9a84c" },
  };
  const p = map[room.status] ?? map.lobby;
  return (
    <div
      className="flex items-center gap-1 px-2.5 py-1 rounded-full font-cinzel text-[10px] whitespace-nowrap"
      style={{ background: `${p.color}20`, border: `1px solid ${p.color}40`, color: p.color }}
    >
      <span>{p.icon}</span>
      <span className="hidden xs:inline">{p.label}</span>
    </div>
  );
}

/* ─── Cupidon 2-pick helper ─── */
function CupidonPicker({ alive, onLink }: { alive: Player[]; onLink: (a: string, b: string) => void }) {
  const [first, setFirst] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-2 gap-2">
      {alive.map((p) => (
        <button
          key={p.id}
          onClick={() => {
            if (!first) { setFirst(p.id); return; }
            if (first === p.id) { setFirst(null); return; }
            onLink(first, p.id);
          }}
          className={cls(
            "glass rounded-xl p-3 text-center transition-all active:scale-95",
            first === p.id ? "border-pink-500/70 scale-105" : "hover:scale-[1.02]"
          )}
          style={first === p.id ? { boxShadow: "0 0 12px rgba(236,72,153,0.3)" } : {}}
        >
          <div className="text-xl mb-1">{first === p.id ? "💗" : "💛"}</div>
          <p className="font-cinzel text-xs text-white leading-tight">{p.name}</p>
        </button>
      ))}
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
  const isMyNightTurn =
    room?.status === "night" &&
    room.current_phase_role === myPlayer?.role &&
    !myNightAction &&
    myPlayer?.is_alive;

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
    const ch = supabase
      .channel(`room-${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${room.id}` }, (p) => {
        setRoom(p.new as Room);
        setSorcHealUsed((p.new as Room).witch_heal_used ?? false);
        setSorcKillUsed((p.new as Room).witch_kill_used ?? false);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${room.id}` }, () => loadRoom())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "votes", filter: `room_id=eq.${room.id}` }, (p) =>
        setVotes((prev) => [...prev.filter((v) => v.id !== (p.new as Vote).id), p.new as Vote])
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events", filter: `room_id=eq.${room.id}` }, (p) =>
        setEvents((prev) => [p.new as GameEvent, ...prev].slice(0, 30))
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [room?.id, loadRoom]);

  /* ── role reveal → show card ── */
  useEffect(() => {
    if (room?.status === "role_reveal" && myPlayer?.role) setShowRoleCard(true);
  }, [room?.status, myPlayer?.role]);

  /* ── reset per-phase state ── */
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

    if (room.status === "role_reveal" && isHost) {
      botTimerRef.current = setTimeout(async () => {
        await fetch("/api/room/bot-turn", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: room.id, action: "advance_from_reveal", userId }),
        });
      }, 7000);
    }

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

    if (room.status === "day_summary" && isHost) {
      botTimerRef.current = setTimeout(async () => {
        await fetch("/api/room/vote", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: room.id, userId }),
        });
      }, 5000);
    }

    if (room.status === "day_vote") {
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
    const { data } = await supabase
      .from("night_actions")
      .insert({ room_id: room.id, night: room.night_number, role: myPlayer.role, action_type: actionType, actor_id: myPlayer.id, target_id: targetId, result: extra ?? {} })
      .select().single();
    if (data) setMyNightAction(data as NightAction);
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

  /* ── Night action UI ── */
  const NightActionUI = () => {
    if (!myPlayer || !room || !isMyNightTurn) return null;
    const role = myPlayer.role as RoleName;
    const targets = alive.filter((p) => p.id !== myPlayer.id);

    if (role === "Loup-Garou") {
      const teammates = players.filter((p) => p.role === "Loup-Garou" && p.id !== myPlayer.id);
      return (
        <div className="space-y-3">
          {teammates.length > 0 && (
            <div className="p-3 rounded-xl text-sm" style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)" }}>
              <p className="font-cinzel text-wolves text-[10px] uppercase mb-1">Vos frères loups</p>
              <p className="text-wolves/70 text-xs">{teammates.map((t) => t.name).join(", ")}</p>
            </div>
          )}
          <p className="font-cinzel text-[10px] text-wolves/80 uppercase tracking-widest">Choisissez votre victime</p>
          <div className="grid grid-cols-2 gap-2">
            {targets.map((p) => (
              <button key={p.id} onClick={() => submitNightAction("kill", p.id)}
                className="glass rounded-xl p-3 text-center hover:scale-[1.02] active:scale-95 transition-all"
                style={{ borderColor: "rgba(220,38,38,0.3)" }}>
                <div className="text-2xl mb-1">🎭</div>
                <p className="font-cinzel text-xs text-white leading-tight">{p.name}</p>
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
          <div className="text-center p-4 rounded-2xl" style={{ background: `${rc.color}15`, border: `1px solid ${rc.color}30` }}>
            <div className="text-4xl mb-2">{rc.emoji}</div>
            <p className="font-cinzel text-white/60 text-[10px] uppercase mb-1">Votre vision révèle</p>
            <p className="font-cinzel font-bold text-base text-white">{voyResult.name}</p>
            <p className="font-cinzel font-bold text-sm mt-1" style={{ color: rc.color }}>est {voyResult.role}</p>
          </div>
        );
      }
      return (
        <div className="space-y-3">
          <p className="font-cinzel text-[10px] text-purple-400 uppercase tracking-widest">Découvrez le rôle d'un joueur</p>
          <div className="grid grid-cols-2 gap-2">
            {targets.map((p) => (
              <button key={p.id} onClick={() => submitNightAction("reveal", p.id)}
                className="glass rounded-xl p-3 text-center hover:scale-[1.02] active:scale-95 transition-all"
                style={{ borderColor: "rgba(155,89,182,0.3)" }}>
                <div className="text-2xl mb-1">🔮</div>
                <p className="font-cinzel text-xs text-white leading-tight">{p.name}</p>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (role === "Sorciere") {
      return (
        <div className="space-y-3">
          <div className="flex gap-2">
            {!sorcHealUsed && (
              <button onClick={() => setSorcMode(sorcMode === "heal" ? null : "heal")}
                className={cls("flex-1 py-2.5 rounded-xl font-cinzel text-xs transition-all", sorcMode === "heal" ? "bg-green-600 text-white" : "glass text-green-400 border-green-500/30")}>
                🧪 Vie
              </button>
            )}
            {!sorcKillUsed && (
              <button onClick={() => setSorcMode(sorcMode === "poison" ? null : "poison")}
                className={cls("flex-1 py-2.5 rounded-xl font-cinzel text-xs transition-all", sorcMode === "poison" ? "bg-red-700 text-white" : "glass text-red-400 border-red-500/30")}>
                ☠️ Poison
              </button>
            )}
          </div>
          {sorcMode && (
            <div className="grid grid-cols-2 gap-2">
              {targets.map((p) => (
                <button key={p.id} onClick={() => { submitNightAction(sorcMode === "heal" ? "heal" : "poison", p.id); setSorcMode(null); }}
                  className="glass rounded-xl p-3 text-center hover:scale-[1.02] transition-all active:scale-95">
                  <div className="text-xl mb-1">{sorcMode === "heal" ? "💚" : "☠️"}</div>
                  <p className="font-cinzel text-xs text-white leading-tight">{p.name}</p>
                </button>
              ))}
            </div>
          )}
          <button onClick={() => submitNightAction("pass", null)}
            className="w-full py-2 rounded-xl border border-white/10 font-cinzel text-white/40 text-xs hover:text-white/60 transition-all">
            Ne rien faire
          </button>
        </div>
      );
    }

    if (role === "Garde") {
      return (
        <div className="space-y-3">
          <p className="font-cinzel text-[10px] text-blue-400 uppercase tracking-widest">Protégez un joueur</p>
          <div className="grid grid-cols-2 gap-2">
            {targets.map((p) => (
              <button key={p.id} onClick={() => submitNightAction("protect", p.id)}
                className="glass rounded-xl p-3 text-center hover:scale-[1.02] active:scale-95 transition-all"
                style={{ borderColor: "rgba(37,99,235,0.3)" }}>
                <div className="text-2xl mb-1">🛡️</div>
                <p className="font-cinzel text-xs text-white leading-tight">{p.name}</p>
              </button>
            ))}
          </div>
          <button onClick={() => submitNightAction("pass", null)}
            className="w-full py-2 rounded-xl border border-white/10 font-cinzel text-white/40 text-xs hover:text-white/60 transition-all">
            Ne protéger personne
          </button>
        </div>
      );
    }

    if (role === "Cupidon" && room.night_number === 1) {
      return (
        <div className="space-y-3">
          <p className="font-cinzel text-[10px] text-pink-400 uppercase tracking-widest">Liez deux amoureux</p>
          <CupidonPicker alive={[myPlayer, ...targets]} onLink={(a, b) => submitNightAction("link_lovers", a, { lover2: b })} />
        </div>
      );
    }

    if (role === "Petite Fille") {
      return (
        <div className="text-center space-y-3">
          <div className="text-4xl">👧</div>
          <p className="font-cinzel text-amber-400 text-sm">Vous espionnez les loups…</p>
          <button onClick={() => submitNightAction("spy", null)}
            className="w-full py-3 rounded-xl font-cinzel text-amber-400 text-sm transition-all"
            style={{ background: "rgba(217,119,6,0.15)", border: "1px solid rgba(217,119,6,0.35)" }}>
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

  const roleInfo = myPlayer?.role ? ROLES[myPlayer.role as RoleName] : null;

  return (
    <div className="min-h-screen bg-bg-base">
      {room.status === "night" && <div className="fixed inset-0 night-overlay z-0 pointer-events-none" />}

      {/* ─── Role card modal — SCROLLABLE, compact, button always visible ─── */}
      <AnimatePresence>
        {showRoleCard && myPlayer?.role && roleInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/95 flex flex-col overflow-y-auto"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="flex-1 flex flex-col items-center justify-start px-4 pt-8 pb-6 min-h-full">
              <p className="font-cinzel text-gold/70 text-[10px] tracking-[0.3em] uppercase mb-4">Votre rôle secret</p>

              {/* compact card — no tall aspect-ratio */}
              <div
                className="w-full max-w-xs rounded-2xl overflow-hidden mb-4"
                style={{ border: `1px solid ${roleInfo.color}40`, boxShadow: `0 0 50px ${roleInfo.color}20` }}
              >
                {/* Role image area — fixed small height */}
                <div
                  className="h-32 flex items-center justify-center relative"
                  style={{ background: `radial-gradient(ellipse at center, ${roleInfo.color}30, #07070f)` }}
                >
                  {myPlayer.role_card_url
                    ? <img src={myPlayer.role_card_url} alt={myPlayer.role} className="h-full w-full object-cover" />
                    : <span className="text-[72px] leading-none">{roleInfo.emoji}</span>
                  }
                </div>

                {/* Role info */}
                <div className="p-4 glass">
                  <p className="font-cinzel text-white/40 text-[10px] uppercase tracking-widest mb-0.5">Vous êtes</p>
                  <h3 className="font-cinzel font-bold text-xl leading-tight" style={{ color: roleInfo.color }}>
                    {roleInfo.emoji} {myPlayer.role}
                  </h3>
                  <p className="text-white/60 text-xs mt-2 leading-relaxed">{roleInfo.description}</p>
                  {myPlayer.role === "Loup-Garou" && (
                    <div className="mt-3 p-2.5 rounded-xl" style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.3)" }}>
                      <p className="font-cinzel text-wolves text-[10px] uppercase mb-1">Vos frères loups</p>
                      <p className="text-wolves/80 text-xs">
                        {players.filter((p) => p.role === "Loup-Garou" && p.id !== myPlayer.id).map((p) => p.name).join(", ") || "Aucun"}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Button — always in DOM flow, never off-screen */}
              <button
                onClick={() => setShowRoleCard(false)}
                className="w-full max-w-xs py-4 rounded-xl font-cinzel font-bold text-sm tracking-widest uppercase transition-all active:scale-95"
                style={{ background: `${roleInfo.color}25`, border: `1px solid ${roleInfo.color}50`, color: roleInfo.color }}
              >
                J'ai compris mon rôle ✓
              </button>

              <p className="text-white/20 text-[10px] mt-3 font-cinzel">Gardez votre rôle secret</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50 glass-dark border-b border-bg-border">
        <div className="px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base shrink-0">🐺</span>
            <div className="min-w-0">
              <h1 className="font-cinzel font-bold text-white text-sm leading-tight truncate">Loup-Garou</h1>
              <p className="text-white/30 text-[10px] font-cinzel truncate">CODE: {code}</p>
            </div>
          </div>
          <PhaseBar room={room} />
          {myPlayer?.role && roleInfo && (
            <button
              onClick={() => setShowRoleCard(true)}
              className="shrink-0 glass rounded-lg px-2 py-1.5 flex items-center gap-1.5 hover:border-gold/40 transition-all active:scale-95"
            >
              <span className="text-sm">{roleInfo.emoji}</span>
              <span className="font-cinzel text-[10px] text-white/60 hidden sm:block truncate max-w-[80px]">{myPlayer.role}</span>
            </button>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="px-3 py-4 relative z-10 max-w-2xl mx-auto lg:max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">

          {/* ── Main panel ── */}
          <div className="space-y-3">
            <AnimatePresence mode="wait">

              {/* LOBBY */}
              {room.status === "lobby" && (
                <motion.div key="lobby" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="glass rounded-2xl p-4">
                  <div className="text-center mb-6">
                    <p className="font-cinzel text-white/40 text-[10px] uppercase tracking-widest mb-2">Code de la salle</p>
                    <div className="inline-block glass rounded-xl px-6 py-3" style={{ border: "1px solid rgba(201,168,76,0.4)" }}>
                      <span className="font-cinzel font-black text-3xl text-gold tracking-[0.4em]">{room.code}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-5">
                    {players.map((p) => (
                      <div key={p.id} className="glass rounded-lg px-3 py-2 flex items-center gap-2">
                        <span className="text-sm">🧙</span>
                        <span className="font-cinzel text-xs text-white truncate">{p.name}</span>
                        {room.host_id === p.user_id && <span className="ml-auto text-gold text-xs">♛</span>}
                      </div>
                    ))}
                  </div>
                  {isHost
                    ? <button onClick={() => hostAction("start")} disabled={players.length < 4}
                        className={cls("w-full py-3.5 rounded-xl font-cinzel font-bold tracking-widest uppercase text-sm transition-all",
                          players.length >= 4 ? "bg-gold text-bg-base active:scale-95 shadow-gold" : "bg-white/5 text-white/20 cursor-not-allowed")}>
                        {players.length >= 4 ? "⚔️ Lancer" : `En attente (${players.length}/4)`}
                      </button>
                    : <p className="text-center text-white/30 font-cinzel text-xs py-3">En attente de l'hôte…</p>
                  }
                </motion.div>
              )}

              {/* ROLE REVEAL */}
              {room.status === "role_reveal" && (
                <motion.div key="reveal" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="glass rounded-2xl p-4 text-center">
                  <div className="text-3xl mb-3">🃏</div>
                  <h2 className="font-cinzel font-bold text-lg text-white mb-1">Rôles distribués</h2>
                  <p className="text-white/50 text-xs mb-4">La nuit tombe dans quelques instants…</p>
                  {myPlayer?.role && roleInfo && (
                    <div className="p-3 rounded-xl mb-4 inline-block"
                      style={{ background: `${roleInfo.color}15`, border: `1px solid ${roleInfo.color}30` }}>
                      <span className="text-3xl">{roleInfo.emoji}</span>
                      <p className="font-cinzel font-bold text-sm mt-1" style={{ color: roleInfo.color }}>{myPlayer.role}</p>
                    </div>
                  )}
                  <button onClick={() => setShowRoleCard(true)}
                    className="w-full py-3 rounded-xl font-cinzel text-purple-300 text-sm mb-2 transition-all active:scale-95"
                    style={{ background: "rgba(155,89,182,0.2)", border: "1px solid rgba(155,89,182,0.4)" }}>
                    Voir mon rôle en détail
                  </button>
                  {isHost && (
                    <button onClick={() => hostAction("advance-reveal")}
                      className="w-full py-3 rounded-xl font-cinzel text-gold text-sm transition-all active:scale-95"
                      style={{ background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.35)" }}>
                      Commencer la nuit →
                    </button>
                  )}
                  <p className="text-white/20 text-[10px] mt-3 font-cinzel">Commence automatiquement…</p>
                </motion.div>
              )}

              {/* NIGHT */}
              {room.status === "night" && myPlayer && (
                <motion.div key="night" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="glass rounded-2xl p-4">
                  <div className="flex items-center gap-2.5 mb-4">
                    <span className="text-2xl">🌙</span>
                    <div>
                      <h2 className="font-cinzel font-bold text-white text-base">Nuit {room.night_number}</h2>
                      <p className="text-indigo-400/80 text-[10px] font-cinzel">
                        {isMyNightTurn ? "⚡ Votre tour" : `⏳ ${room.current_phase_role ?? "…"}`}
                      </p>
                    </div>
                  </div>
                  {myNightAction ? (
                    <div className="text-center py-5">
                      <div className="text-3xl mb-2">✅</div>
                      <p className="font-cinzel text-gold text-sm">Action soumise</p>
                      <p className="text-white/40 text-xs mt-1">En attente…</p>
                      {voyResult && ROLES[voyResult.role] && (
                        <div className="mt-3 p-3 rounded-xl inline-block" style={{ background: `${ROLES[voyResult.role].color}15`, border: `1px solid ${ROLES[voyResult.role].color}30` }}>
                          <p className="font-cinzel text-white/60 text-[10px] uppercase mb-1">Votre vision</p>
                          <p className="font-cinzel font-bold text-sm" style={{ color: ROLES[voyResult.role].color }}>
                            {ROLES[voyResult.role].emoji} {voyResult.name} est {voyResult.role}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : isMyNightTurn ? (
                    <NightActionUI />
                  ) : (
                    <div className="text-center py-6">
                      <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2, repeat: Infinity }} className="text-4xl mb-3">😴</motion.div>
                      <p className="font-cinzel text-white/40 text-sm">Le village dort…</p>
                      <p className="text-white/20 text-xs mt-1">{room.current_phase_role} agit</p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* DAY SUMMARY */}
              {room.status === "day_summary" && (
                <motion.div key="summary" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="glass rounded-2xl p-4">
                  <div className="flex items-center gap-2.5 mb-4">
                    <span className="text-2xl">🌅</span>
                    <div>
                      <h2 className="font-cinzel font-bold text-white text-base">L'Aube se lève</h2>
                      <p className="text-orange-400/80 text-[10px] font-cinzel">Jour {room.day_number}</p>
                    </div>
                  </div>
                  <div className="space-y-2 mb-4">
                    {(room.night_summary as string[] ?? []).map((msg, i) => (
                      <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.2 }}
                        className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <p className="text-white/80 text-xs leading-relaxed">{msg}</p>
                      </motion.div>
                    ))}
                  </div>
                  {isHost && (
                    <button onClick={() => hostAction("vote")}
                      className="w-full py-3 rounded-xl font-cinzel text-sm transition-all active:scale-95"
                      style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.35)", color: "#dc2626" }}>
                      ⚖️ Ouvrir le vote
                    </button>
                  )}
                  <p className="text-white/20 text-[10px] text-center mt-2 font-cinzel">Vote automatique…</p>
                </motion.div>
              )}

              {/* DAY VOTE */}
              {room.status === "day_vote" && (
                <motion.div key="vote" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="glass rounded-2xl p-4">
                  <div className="flex items-center gap-2.5 mb-4">
                    <span className="text-2xl">⚖️</span>
                    <div>
                      <h2 className="font-cinzel font-bold text-white text-base">Vote du Village</h2>
                      <p className="text-red-400/80 text-[10px] font-cinzel">{myVote ? "Vote soumis ✓" : "Qui est suspect?"}</p>
                    </div>
                  </div>
                  {!myPlayer?.is_alive && (
                    <div className="text-center py-2 text-white/30 font-cinzel text-xs mb-3">Spectateur</div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {alive.map((p) => {
                      const vc = votes.filter((v) => v.target_id === p.id).length;
                      const isMe = p.user_id === userId;
                      const voted = myVote === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => myPlayer?.is_alive && !myVote && !isMe && submitVote(p.id)}
                          disabled={!!myVote || isMe || !myPlayer?.is_alive}
                          className={cls(
                            "glass rounded-xl p-3 text-center transition-all relative overflow-hidden",
                            voted ? "scale-[1.03]" : (!myVote && !isMe && myPlayer?.is_alive) ? "hover:scale-[1.02] active:scale-95 cursor-pointer" : "cursor-default"
                          )}
                          style={voted ? { borderColor: "#dc2626", boxShadow: "0 0 14px rgba(220,38,38,0.3)" } : {}}
                        >
                          <div className="text-xl mb-1">🎭</div>
                          <p className="font-cinzel text-xs text-white leading-tight">{p.name}</p>
                          {isMe && <p className="text-[9px] text-gold/50 font-cinzel">Vous</p>}
                          {vc > 0 && (
                            <span className="absolute top-1 right-1 bg-wolves text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">{vc}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {isHost && (
                    <button onClick={() => hostAction("vote")}
                      className="mt-4 w-full py-3 rounded-xl font-cinzel text-sm transition-all active:scale-95"
                      style={{ background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.3)", color: "#dc2626" }}>
                      Clôturer le vote
                    </button>
                  )}
                </motion.div>
              )}

              {/* WIN */}
              {room.status === "ended" && (
                <motion.div key="ended" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  className="glass rounded-2xl p-5 text-center"
                  style={{
                    borderColor: room.winner === "wolves" ? "rgba(220,38,38,0.5)" : room.winner === "lovers" ? "rgba(236,72,153,0.5)" : "rgba(22,163,74,0.5)",
                    boxShadow: `0 0 60px ${room.winner === "wolves" ? "rgba(220,38,38,0.2)" : room.winner === "lovers" ? "rgba(236,72,153,0.2)" : "rgba(201,168,76,0.15)"}`,
                  }}>
                  <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1.5, repeat: Infinity }} className="text-6xl mb-3">
                    {room.winner === "wolves" ? "🐺" : room.winner === "lovers" ? "💕" : "🏰"}
                  </motion.div>
                  <h2 className="font-cinzel font-black text-2xl mb-1"
                    style={{ color: room.winner === "wolves" ? "#dc2626" : room.winner === "lovers" ? "#ec4899" : "#16a34a" }}>
                    {room.winner === "wolves" ? "Les Loups ont Gagné!" : room.winner === "lovers" ? "Les Amoureux ont Gagné!" : "Le Village a Triomphé!"}
                  </h2>
                  <p className="text-white/40 font-cinzel text-xs mb-5">Nuit {room.night_number} · Jour {room.day_number}</p>
                  <div className="space-y-1.5 text-left max-h-48 overflow-y-auto mb-5">
                    {players.map((p) => {
                      const rc = ROLES[p.role as RoleName];
                      if (!rc) return null;
                      return (
                        <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg"
                          style={{ background: p.is_alive ? `${rc.color}12` : "rgba(255,255,255,0.02)", border: `1px solid ${p.is_alive ? `${rc.color}20` : "rgba(255,255,255,0.04)"}` }}>
                          <span className="text-base">{rc.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className={cls("font-cinzel font-bold text-xs", p.is_alive ? "text-white" : "text-white/30")}>{p.name}</p>
                            <p className="text-[10px] truncate" style={{ color: `${rc.color}60` }}>{p.role}</p>
                          </div>
                          <span className={cls("text-[10px] font-cinzel shrink-0", p.is_alive ? "text-green-400" : "text-white/20")}>
                            {p.is_alive ? "✓" : "✝"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <a href="/"
                    className="inline-block font-cinzel font-bold px-8 py-3.5 rounded-xl text-sm tracking-widest uppercase transition-all active:scale-95"
                    style={{ background: "rgba(201,168,76,0.2)", border: "1px solid rgba(201,168,76,0.5)", color: "#c9a84c" }}>
                    Nouvelle Partie
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-3">
            <div className="glass rounded-2xl p-3">
              <h3 className="font-cinzel text-white/40 text-[10px] uppercase tracking-widest mb-3">
                Joueurs ({alive.length} en vie)
              </h3>
              <div className="space-y-1">
                {players.map((p) => (
                  <div key={p.id}
                    className={cls(
                      "flex items-center gap-2 px-2 py-1.5 rounded-lg",
                      !p.is_alive ? "opacity-40" : "",
                      p.user_id === userId ? "bg-gold/5 border border-gold/15" : ""
                    )}>
                    <span className="text-[10px] shrink-0">{p.is_alive ? "🟢" : "⚫"}</span>
                    <span className={cls("font-cinzel text-xs truncate flex-1", p.is_alive ? "text-white" : "text-white/30")}>{p.name}</span>
                    {p.user_id === userId && <span className="text-gold/50 text-[9px] font-cinzel shrink-0">Vous</span>}
                    {room.status === "ended" && p.role && ROLES[p.role as RoleName] && (
                      <span className="text-[10px] shrink-0" style={{ color: `${ROLES[p.role as RoleName].color}70` }}>{ROLES[p.role as RoleName].emoji}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {events.length > 0 && (
              <div className="glass rounded-2xl p-3">
                <h3 className="font-cinzel text-white/40 text-[10px] uppercase tracking-widest mb-2">Journal</h3>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {events.slice(0, 12).map((ev) => {
                    const payload = ev.payload as { message?: string };
                    return (
                      <div key={ev.id} className="text-[10px] text-white/50 flex gap-1.5 items-start">
                        <span className="shrink-0">{ev.type === "death" ? "💀" : ev.type === "win" ? "🏆" : "•"}</span>
                        <span className="leading-relaxed">{payload.message ?? ev.type}</span>
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
