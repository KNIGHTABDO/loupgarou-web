"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import type { Room, Player, Vote, GameEvent, RoleName, NightAction } from "@/types";
import { ROLES } from "@/types";

const supabase = createClient();

function PhaseIndicator({ room }: { room: Room }) {
  const phases: Record<string, { icon: string; label: string; color: string }> = {
    lobby: { icon: "\uD83C\uDFE0", label: "Salle", color: "#c9a84c" },
    role_reveal: { icon: "\uD83C\uDFC3", label: "Roles", color: "#9b59b6" },
    night: { icon: "\uD83C\uDF19", label: `Nuit ${room.night_number}`, color: "#6366f1" },
    day_summary: { icon: "\uD83C\uDF05", label: "Aube", color: "#f97316" },
    day_vote: { icon: "\u2696\uFE0F", label: `Vote J${room.day_number}`, color: "#dc2626" },
    ended: { icon: "\uD83C\uDFC6", label: "Termine", color: "#c9a84c" },
  };
  const p = phases[room.status] ?? phases.lobby;
  return (
    <div className="phase-badge px-3 py-1.5 rounded-full flex items-center gap-1.5" style={{ background: `${p.color}20`, border: `1px solid ${p.color}40`, color: p.color }}>
      <span>{p.icon}</span><span>{p.label}</span>
    </div>
  );
}

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
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

  const myPlayer = players.find((p) => p.user_id === userId) ?? null;
  const isHost = room?.host_id === userId;
  const alive = players.filter((p) => p.is_alive);
  const dead = players.filter((p) => !p.is_alive);
  const loversIds = room?.lovers as string[] | null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: { data: { session: import("@supabase/supabase-js").Session | null } }) => {
      const session = data.session;
      if (session) setUserId(session.user.id);
      else supabase.auth.signInAnonymously().then(({ data }) => setUserId(data.user?.id ?? null));
    });
  }, []);

  const loadRoom = useCallback(async () => {
    const { data: r } = await supabase.from("rooms").select("*").eq("code", code).single();
    if (!r) { setError("Salle introuvable"); setLoading(false); return; }
    setRoom(r);
    const { data: pl } = await supabase.from("players").select("*").eq("room_id", r.id).order("created_at");
    setPlayers(pl ?? []);
    const { data: v } = await supabase.from("votes").select("*").eq("room_id", r.id).eq("day", r.day_number);
    setVotes(v ?? []);
    const { data: ev } = await supabase.from("events").select("*").eq("room_id", r.id).order("created_at", { ascending: false }).limit(20);
    setEvents(ev ?? []);
    setLoading(false);
  }, [code]);

  useEffect(() => { if (userId) loadRoom(); }, [userId, loadRoom]);

  useEffect(() => {
    if (!room) return;
    const ch = supabase.channel(`room-${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${room.id}` }, (p) => setRoom(p.new as Room))
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${room.id}` }, () => loadRoom())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "votes", filter: `room_id=eq.${room.id}` }, (p) => setVotes((prev) => [...prev.filter((v) => v.id !== (p.new as Vote).id), p.new as Vote]))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events", filter: `room_id=eq.${room.id}` }, (p) => setEvents((prev) => [p.new as GameEvent, ...prev].slice(0, 20)))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [room?.id, loadRoom]);

  useEffect(() => { if (room?.status === "role_reveal" && myPlayer?.role) setShowRoleCard(true); }, [room?.status, myPlayer?.role]);

  const submitNightAction = useCallback(async (actionType: string, targetId: string | null, extra?: Record<string, unknown>) => {
    if (!myPlayer || !room) return;
    const { data } = await supabase.from("night_actions").insert({ room_id: room.id, night: room.night_number, role: myPlayer.role, action_type: actionType, actor_id: myPlayer.id, target_id: targetId, result: extra ?? {} }).select().single();
    if (data) setMyNightAction(data as NightAction);
    await fetch("/api/room/night-action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId: room.id, role: myPlayer.role }) });
  }, [myPlayer, room]);

  const submitVote = useCallback(async (targetId: string) => {
    if (!myPlayer || !room || myVote) return;
    setMyVote(targetId);
    await supabase.from("votes").upsert({ room_id: room.id, day: room.day_number, voter_id: myPlayer.id, target_id: targetId }, { onConflict: "room_id,day,voter_id" });
  }, [myPlayer, room, myVote]);

  const hostAction = async (action: string) => {
    await fetch(`/api/room/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId: room!.id }) });
  };

  if (loading) return <div className="min-h-screen bg-bg-base flex items-center justify-center"><motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="text-5xl">\uD83C\uDF19</motion.div></div>;
  if (error || !room) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-center px-4"><div><p className="text-wolves font-cinzel text-xl mb-4">{error || "Salle introuvable"}</p><a href="/" className="text-gold font-cinzel underline">Retour</a></div></div>;

  return (
    <div className="min-h-screen bg-bg-base">
      {room.status === "night" && <div className="fixed inset-0 night-overlay z-0 pointer-events-none" />}
      {showRoleCard && myPlayer?.role && (
        <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4">
          <div className="w-full max-w-sm">
            <p className="text-center font-cinzel text-gold/80 text-xs tracking-[0.3em] uppercase mb-6">Votre role secret</p>
            <div className="glass rounded-3xl overflow-hidden" style={{ border: `1px solid ${ROLES[myPlayer.role as RoleName]?.color}40`, boxShadow: `0 0 60px ${ROLES[myPlayer.role as RoleName]?.color}30` }}>
              <div className="aspect-[3/4] flex items-center justify-center" style={{ background: `radial-gradient(ellipse at center, ${ROLES[myPlayer.role as RoleName]?.color}20, #07070f)` }}>
                {myPlayer.role_card_url ? <img src={myPlayer.role_card_url} alt={myPlayer.role} className="w-full h-full object-cover" /> : <span className="text-[100px]">{ROLES[myPlayer.role as RoleName]?.emoji}</span>}
              </div>
              <div className="p-6">
                <p className="font-cinzel text-white/50 text-xs uppercase tracking-widest mb-1">Vous etes</p>
                <h2 className="font-cinzel font-black text-3xl text-white mb-1">{myPlayer.name}</h2>
                <h3 className="font-cinzel font-bold text-xl mb-3" style={{ color: ROLES[myPlayer.role as RoleName]?.color }}>{ROLES[myPlayer.role as RoleName]?.emoji} {myPlayer.role}</h3>
                <p className="text-white/60 text-sm">{ROLES[myPlayer.role as RoleName]?.description}</p>
                {myPlayer.role === "Loup-Garou" && (
                  <div className="mt-3 p-3 rounded-xl" style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.3)" }}>
                    <p className="font-cinzel text-wolves text-xs uppercase mb-1">Vos freres loups</p>
                    <p className="text-wolves/80 text-sm">{players.filter((p) => p.role === "Loup-Garou" && p.id !== myPlayer.id).map((p) => p.name).join(", ") || "Aucun"}</p>
                  </div>
                )}
              </div>
            </div>
            <button onClick={() => setShowRoleCard(false)} className="w-full mt-4 py-3 bg-gold/20 border border-gold/40 rounded-xl font-cinzel text-gold hover:bg-gold/30 transition-all">Compris ✓</button>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-50 glass-dark border-b border-bg-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3"><span className="text-xl">\uD83D\uDC3A</span><div><h1 className="font-cinzel font-bold text-white text-sm">Loup-Garou</h1><p className="text-white/30 text-xs font-cinzel">CODE: {code}</p></div></div>
          <PhaseIndicator room={room} />
          {myPlayer?.role && <button onClick={() => setShowRoleCard(true)} className="flex items-center gap-2 glass rounded-xl px-3 py-1.5 hover:border-gold/40 transition-all"><span>{ROLES[myPlayer.role as RoleName]?.emoji}</span><span className="font-cinzel text-xs text-white/60 hidden sm:block">{myPlayer.role}</span></button>}
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-4 py-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
          <div className="space-y-6">
            {room.status === "lobby" && (
              <div className="glass rounded-2xl p-6">
                <div className="text-center mb-8">
                  <p className="font-cinzel text-white/40 text-xs uppercase tracking-widest mb-3">Code de la salle</p>
                  <div className="inline-block glass rounded-2xl px-8 py-4 border-glow-animated"><span className="font-cinzel font-black text-4xl md:text-5xl text-gold tracking-[0.4em]">{room.code}</span></div>
                  <p className="text-white/30 text-xs mt-3">Partagez ce code</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
                  {players.map((p) => <div key={p.id} className="glass rounded-xl px-3 py-2 flex items-center gap-2"><span className="text-lg">\uD83E\uDDD9</span><span className="font-cinzel text-xs text-white truncate">{p.name}</span>{room.host_id === p.user_id && <span className="ml-auto text-gold text-xs">\u2654</span>}</div>)}
                </div>
                {isHost ? <button onClick={() => hostAction("start")} disabled={players.length < 4} className={`w-full py-4 rounded-xl font-cinzel font-bold tracking-widest uppercase transition-all ${players.length >= 4 ? "bg-gold text-bg-base shadow-gold hover:bg-gold-light" : "bg-white/5 text-white/20 cursor-not-allowed"}`}>{players.length >= 4 ? "Lancer la Partie" : `En attente (${players.length}/4)`}</button>
                : <p className="text-center text-white/30 font-cinzel text-sm py-4">En attente de l'hote...</p>}
              </div>
            )}
            {room.status === "night" && myPlayer && (
              <div className="glass rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-3xl">\uD83C\uDF19</span>
                  <div><h2 className="font-cinzel font-bold text-white">Nuit {room.night_number}</h2><p className="text-white/40 text-xs">{room.current_phase_role === myPlayer.role ? "C'est votre tour d'agir" : `En attente de ${room.current_phase_role}...`}</p></div>
                </div>
                {room.current_phase_role === myPlayer.role && !myNightAction ? (
                  <div className="space-y-3">
                    <p className="text-xs font-cinzel text-gold/80 uppercase tracking-widest">Choisissez votre action</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {alive.filter((p) => p.id !== myPlayer.id).map((p) => (
                        <button key={p.id} onClick={() => submitNightAction(myPlayer.role === "Loup-Garou" ? "kill" : myPlayer.role === "Voyante" ? "reveal" : "protect", p.id)}
                          className="glass rounded-xl p-3 text-center hover:scale-105 transition-all cursor-pointer">
                          <div className="text-2xl mb-1">\uD83C\uDFAD</div>
                          <p className="font-cinzel text-xs text-white">{p.name}</p>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => submitNightAction("pass", null)} className="w-full py-2 rounded-xl border border-white/10 font-cinzel text-white/40 text-sm hover:text-white/60 transition-all">Passer</button>
                  </div>
                ) : <p className="text-center font-cinzel text-gold/80">{myNightAction ? "Action soumise ✓" : "En attente..."}</p>}
                {isHost && <button onClick={() => hostAction("night-action")} className="mt-4 w-full py-2 rounded-xl bg-gold/20 border border-gold/40 font-cinzel text-gold text-sm hover:bg-gold/30 transition-all">Terminer la nuit (Host)</button>}
              </div>
            )}
            {room.status === "day_summary" && (
              <div className="glass rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6"><span className="text-3xl">\uD83C\uDF05</span><div><h2 className="font-cinzel font-bold text-white text-lg">Le Village se Reveille</h2><p className="text-white/40 text-xs">Jour {room.day_number}</p></div></div>
                <div className="space-y-3 mb-6">{room.night_summary?.map((msg: string, i: number) => <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"><p className="text-white/75 text-sm">{msg}</p></div>)}</div>
                {isHost && <button onClick={() => hostAction("vote")} className="w-full py-3 rounded-xl bg-wolves/20 border border-wolves/40 font-cinzel text-wolves hover:bg-wolves/30 transition-all">Ouvrir le Vote</button>}
              </div>
            )}
            {room.status === "day_vote" && (
              <div className="glass rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6"><span className="text-3xl">\u2696\uFE0F</span><div><h2 className="font-cinzel font-bold text-white">Vote du Village</h2><p className="text-white/40 text-xs">{myVote ? "Vote soumis ✓" : "Choisissez qui eliminer"}</p></div></div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {alive.map((p) => {
                    const vc = votes.filter((v) => v.target_id === p.id).length;
                    return <button key={p.id} onClick={() => !myVote && p.id !== myPlayer?.id && submitVote(p.id)}
                      disabled={!!myVote || p.id === myPlayer?.id}
                      className={`glass rounded-xl p-3 text-center transition-all relative overflow-hidden ${myVote === p.id ? "border-wolves/70 scale-105" : !myVote && p.id !== myPlayer?.id ? "hover:scale-105 cursor-pointer" : "cursor-default"}`}
                      style={myVote === p.id ? { borderColor: "#dc2626", boxShadow: "0 0 16px rgba(220,38,38,0.3)" } : {}}>
                      <div className="text-2xl mb-1">\uD83C\uDFAD</div>
                      <p className="font-cinzel text-xs text-white">{p.name}</p>
                      {vc > 0 && <span className="absolute top-1 right-1 bg-wolves text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">{vc}</span>}
                    </button>;
                  })}
                </div>
                {isHost && <button onClick={() => hostAction("vote")} className="mt-6 w-full py-3 rounded-xl bg-wolves/20 border border-wolves/40 font-cinzel text-wolves hover:bg-wolves/30 transition-all text-sm">Cloturer le vote (Host)</button>}
              </div>
            )}
            {room.status === "ended" && (
              <div className="glass rounded-3xl p-8 text-center" style={{ borderColor: room.winner === "wolves" ? "rgba(220,38,38,0.5)" : room.winner === "lovers" ? "rgba(236,72,153,0.5)" : "rgba(22,163,74,0.5)", boxShadow: room.winner === "wolves" ? "0 0 60px rgba(220,38,38,0.3)" : "0 0 60px rgba(201,168,76,0.2)" }}>
                <div className="text-7xl mb-4">{room.winner === "wolves" ? "\uD83D\uDC3A" : room.winner === "lovers" ? "\uD83D\uDC91" : "\uD83C\uDFD8\uFE0F"}</div>
                <h2 className="font-cinzel font-black text-3xl mb-2" style={{ color: room.winner === "wolves" ? "#dc2626" : room.winner === "lovers" ? "#ec4899" : "#16a34a" }}>{room.winner === "wolves" ? "Les Loups ont Gagne!" : room.winner === "lovers" ? "Les Amoureux ont Gagne!" : "Le Village a Triomphe!"}</h2>
                <p className="text-white/40 font-cinzel text-sm mb-8">Nuit {room.night_number} · Jour {room.day_number}</p>
                <div className="space-y-2 text-left max-h-56 overflow-y-auto mb-6">{players.map((p) => { const rc = ROLES[p.role as RoleName]; return <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: p.is_alive ? `${rc?.color}15` : "rgba(255,255,255,0.03)", border: `1px solid ${p.is_alive ? `${rc?.color}30` : "rgba(255,255,255,0.06)"}` }}><span className="text-xl">{rc?.emoji}</span><div className="flex-1"><p className={`font-cinzel font-bold text-sm ${p.is_alive ? "text-white" : "text-white/30"}`}>{p.name}</p><p className="text-xs" style={{ color: `${rc?.color}80` }}>{p.role}</p></div><span className={`text-xs font-cinzel ${p.is_alive ? "text-green-400" : "text-white/20"}`}>{p.is_alive ? "✓ Vivant" : "✝ Elimine"}</span></div>; })}</div>
                <a href="/" className="inline-block bg-gold text-bg-base font-cinzel font-bold px-8 py-3 rounded-xl hover:bg-gold-light transition-all">Nouvelle Partie</a>
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div className="glass rounded-2xl p-4">
              <h3 className="font-cinzel text-white/60 text-xs uppercase tracking-widest mb-4">Joueurs ({alive.length} en vie)</h3>
              <div className="space-y-1.5">
                {players.map((p) => <div key={p.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${!p.is_alive ? "opacity-40" : ""} ${p.user_id === userId ? "bg-gold/5 border border-gold/20" : ""}`}>
                  <span className="text-xs">{p.is_alive ? "\uD83D\uDFE2" : "\u26AB"}</span>
                  <span className={`font-cinzel text-xs ${p.is_alive ? "text-white" : "text-white/30"} truncate`}>{p.name}</span>
                  {p.user_id === userId && <span className="ml-auto text-gold/60 text-[10px] font-cinzel">Vous</span>}
                </div>)}
              </div>
            </div>
            {events.length > 0 && <div className="glass rounded-2xl p-4"><h3 className="font-cinzel text-white/60 text-xs uppercase tracking-widest mb-3">Journal</h3><div className="space-y-2 max-h-40 overflow-y-auto">{events.slice(0, 12).map((ev) => { const payload = ev.payload as { message?: string }; return <div key={ev.id} className="text-xs text-white/50 flex gap-2"><span>{ev.type === "death" ? "\uD83D\uDC80" : ev.type === "win" ? "\uD83C\uDFC6" : "•"}</span><span>{payload.message ?? ev.type}</span></div>; })}</div></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
