// @ts-nocheck
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ROLES } from "@/types";
import type { RoleName } from "@/types";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

const ROLE_PREVIEWS: { role: RoleName; quote: string }[] = [
  { role: "Loup-Garou", quote: "La nuit vous appartient. Chassez sans pitie." },
  { role: "Voyante", quote: "Les secrets n'ont aucun mystere pour vous." },
  { role: "Sorciere", quote: "La vie et la mort tiennent dans vos mains." },
  { role: "Cupidon", quote: "L'amour peut sauver... ou tout detruire." },
  { role: "Garde", quote: "Votre bouclier est la derniere ligne de defense." },
  { role: "Petite Fille", quote: "Vous osez espionner les monstres dans l'ombre." },
];

export default function LandingPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"create" | "join" | "tester">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hoveredRole, setHoveredRole] = useState<RoleName>("Loup-Garou");
  const [userId, setUserId] = useState<string | null>(null);

  // Get or create anonymous session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      if (session) {
        setUserId(session.user.id);
      } else {
        supabase.auth.signInAnonymously().then((res) => {
          setUserId(res.data.user?.id ?? null);
        });
      }
    });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Entrez votre nom");
    if (!userId) return setError("Connexion en cours, veuillez patienter...");
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push("/room/" + data.code);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Entrez votre nom");
    if (!code.trim()) return setError("Entrez le code");
    if (!userId) return setError("Connexion en cours, veuillez patienter...");
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/room/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), code: code.trim().toUpperCase(), userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push("/room/" + data.code);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }

  async function handleTester(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Entrez votre nom");
    if (!userId) return setError("Connexion en cours, veuillez patienter...");
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/room/tester", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: name.trim(), userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push("/room/" + data.code);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }

  const roleData = ROLES[hoveredRole];

  return (
    <main className="min-h-screen bg-bg-base overflow-x-hidden">
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 py-20 overflow-hidden">
        <div className="absolute inset-0 glow-wolves pointer-events-none" />
        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.4, ease: "easeOut" }}
          className="absolute top-16 right-[8%] w-28 h-28 md:w-40 md:h-40 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle at 35% 35%, #fff9e6 0%, #e8c96a 40%, #8b6914 80%, #3a2800 100%)", boxShadow: "0 0 80px rgba(201,168,76,0.4)" }} />
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2 }} className="text-center mb-12 z-10">
          <p className="font-cinzel text-gold text-xs md:text-sm tracking-[0.3em] uppercase mb-4 opacity-80">Le Jeu de Societe en Ligne</p>
          <h1 className="font-cinzel font-black text-5xl md:text-7xl lg:text-8xl leading-none mb-4">
            <span className="text-gold-shimmer">Loup</span><span className="text-white">-</span><span className="text-gold-shimmer">Garou</span>
          </h1>
          <div className="flex items-center justify-center gap-3 mt-4">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-gold/50" />
            <p className="font-cinzel text-gold/60 text-xs tracking-[0.25em] uppercase">Trompez · Demasquez · Survivez</p>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-gold/50" />
          </div>
          <p className="text-white/50 mt-6 text-sm md:text-base max-w-md mx-auto">4 a 12 joueurs · Aucun compte requis · Parties en temps reel</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.5 }}
          className="glass rounded-2xl p-1 w-full max-w-md z-10 shadow-gold">
          {/* Tabs */}
          <div className="flex rounded-xl overflow-hidden mb-1">
            {(["create", "join", "tester"] as const).map((t) => (
              <button key={t} onClick={() => { setTab(t); setError(""); }}
                className={"flex-1 py-3 font-cinzel text-xs tracking-widest uppercase transition-all duration-300 " + (tab === t
                  ? (t === "tester" ? "bg-emerald-600/80 text-white font-semibold" : "bg-gold text-bg-base font-semibold")
                  : "text-white/50 hover:text-white/80")}>
                {t === "create" ? "Creer" : t === "join" ? "Rejoindre" : "🤖 Tester"}
              </button>
            ))}
          </div>

          <div className="p-5">
            <AnimatePresence mode="wait">
              {tab === "tester" ? (
                <motion.div key="tester" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {/* Tester info card */}
                  <div className="rounded-xl p-4 mb-4 border border-emerald-600/30 bg-emerald-900/20">
                    <p className="font-cinzel text-emerald-400 text-xs tracking-widest uppercase mb-2">Mode Test</p>
                    <p className="text-white/60 text-sm leading-relaxed">
                      Rejoin une partie avec <strong className="text-white">7 bots</strong> (8 joueurs total).
                      La partie démarre instantanément — testez tous les rôles et phases de jeu.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {["2 Loups", "2 Villageois", "Voyante", "Sorcière", "Garde", "Vous"].map((r) => (
                        <span key={r} className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/50 font-cinzel">{r}</span>
                      ))}
                    </div>
                  </div>
                  <form onSubmit={handleTester} className="space-y-4">
                    <div>
                      <label className="block text-white/60 text-xs font-cinzel tracking-widest uppercase mb-2">Votre Nom</label>
                      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Merlin, Isolde..."
                        maxLength={20} className="w-full bg-bg-hover border border-bg-border rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-emerald-500/60 transition-all text-sm" />
                    </div>
                    {error && <p className="text-wolves text-sm text-center">{error}</p>}
                    <button type="submit" disabled={loading}
                      className={"w-full py-3.5 rounded-xl font-cinzel font-semibold tracking-widest uppercase text-sm transition-all duration-300 " + (loading ? "bg-emerald-800/30 text-white/40 cursor-not-allowed" : "bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg active:scale-[0.98]")}>
                      {loading ? "Creation..." : "Lancer une Partie Test"}
                    </button>
                  </form>
                </motion.div>
              ) : (
                <motion.form key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onSubmit={tab === "create" ? handleCreate : handleJoin} className="space-y-4">
                  <div>
                    <label className="block text-white/60 text-xs font-cinzel tracking-widest uppercase mb-2">Votre Nom</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Merlin, Isolde..." maxLength={20}
                      className="w-full bg-bg-hover border border-bg-border rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-gold/60 transition-all text-sm" />
                  </div>
                  {tab === "join" && (
                    <div>
                      <label className="block text-white/60 text-xs font-cinzel tracking-widest uppercase mb-2">Code de Salle</label>
                      <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Ex: AB3X7K" maxLength={6}
                        className="w-full bg-bg-hover border border-bg-border rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-gold/60 transition-all text-sm tracking-[0.3em] font-cinzel text-center" />
                    </div>
                  )}
                  {error && <p className="text-wolves text-sm text-center">{error}</p>}
                  <button type="submit" disabled={loading}
                    className={"w-full py-3.5 rounded-xl font-cinzel font-semibold tracking-widest uppercase text-sm transition-all duration-300 " + (loading ? "bg-gold/30 text-white/40 cursor-not-allowed" : "bg-gold text-bg-base hover:bg-gold-light shadow-gold-sm active:scale-[0.98]")}>
                    {loading ? "Chargement..." : tab === "create" ? "Creer une Partie" : "Rejoindre"}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </section>

      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="font-cinzel text-gold/60 text-xs tracking-[0.3em] uppercase mb-3">8 Roles Uniques</p>
            <h2 className="font-cinzel font-bold text-3xl md:text-5xl text-white">Qui etes-vous ?</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {ROLE_PREVIEWS.map(({ role }) => {
                const r = ROLES[role]; const isActive = hoveredRole === role;
                return (
                  <motion.button key={role} onMouseEnter={() => setHoveredRole(role)} onClick={() => setHoveredRole(role)}
                    className={"glass rounded-2xl p-4 text-center transition-all duration-300 cursor-pointer " + (isActive ? "scale-[1.03]" : "hover:scale-[1.02]")}
                    style={isActive ? { borderColor: r.color, boxShadow: "0 0 20px " + r.color + "40" } : {}}>
                    <div className="text-3xl mb-2">{r.emoji}</div>
                    <div className="font-cinzel text-xs font-semibold" style={{ color: isActive ? r.color : "rgba(255,255,255,0.6)" }}>{role}</div>
                    <div className={"mt-2 text-xs px-2 py-0.5 rounded-full font-cinzel " + (r.team === "wolves" ? "bg-wolves/20 text-wolves" : "bg-villagers/20 text-villagers")}>
                      {r.team === "wolves" ? "Loups" : "Village"}
                    </div>
                  </motion.button>
                );
              })}
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={hoveredRole} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="glass rounded-3xl p-8 relative overflow-hidden" style={{ borderColor: roleData.color + "30" }}>
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ background: "radial-gradient(ellipse at top left, " + roleData.color + " 0%, transparent 60%)" }} />
                <div className="relative z-10">
                  <div className="flex items-center gap-4 mb-6">
                    <span className="text-6xl">{roleData.emoji}</span>
                    <div>
                      <h3 className="font-cinzel font-bold text-2xl" style={{ color: roleData.color }}>{hoveredRole}</h3>
                      <span className={"text-xs font-cinzel px-3 py-1 rounded-full mt-1 inline-block " + (roleData.team === "wolves" ? "bg-wolves/20 text-wolves" : "bg-villagers/20 text-villagers")}>
                        {roleData.team === "wolves" ? "Camp des Loups" : "Camp du Village"}
                      </span>
                    </div>
                  </div>
                  <p className="text-white/75 text-sm leading-relaxed mb-6">{roleData.description}</p>
                  <div className="border-l-2 pl-4" style={{ borderColor: roleData.color + "60" }}>
                    <p className="font-cinzel text-sm italic" style={{ color: roleData.color + "90" }}>
                      &ldquo;{ROLE_PREVIEWS.find((r) => r.role === hoveredRole)?.quote}&rdquo;
                    </p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>

      <section className="py-24 px-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 glow-wolves pointer-events-none" />
        <div className="relative z-10">
          <h2 className="font-cinzel font-black text-4xl md:text-6xl text-white mb-6">La Nuit <span className="text-gold-shimmer">Tombe</span></h2>
          <p className="text-white/50 mb-10 max-w-md mx-auto">Creez une salle en 10 secondes. Partagez le code. Jouez.</p>
          <button onClick={() => { setTab("create"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="bg-gold hover:bg-gold-light text-bg-base font-cinzel font-bold text-lg px-12 py-5 rounded-2xl shadow-gold transition-all hover:scale-105 active:scale-95 tracking-widest uppercase">
            Commencer
          </button>
        </div>
      </section>
    </main>
  );
}
