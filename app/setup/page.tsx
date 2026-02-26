/**
 * /setup — Admin page to trigger full image generation after deploy.
 * Visit this once after adding GEMINI_API_KEY to Vercel.
 * Shows real-time generation progress.
 */
"use client";
import { useState } from "react";

const ROLES = ["Loup-Garou", "Villageois", "Voyante", "Sorciere", "Chasseur", "Garde", "Cupidon", "Petite Fille"];
const SCENES = ["scenes/night-banner", "scenes/day-banner", "scenes/wolves-win", "scenes/villagers-win", "scenes/lovers-win", "brand/logo"];

export default function SetupPage() {
  const [status, setStatus] = useState<Record<string, "pending" | "ok" | "fail">>({});
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog((prev) => [`${new Date().toLocaleTimeString()} — ${msg}`, ...prev]);

  async function runGeneration() {
    setRunning(true);
    addLog("Starting image generation with Nano Banana Pro...");
    // Generate roles
    for (const role of ROLES) {
      setStatus((s) => ({ ...s, [role]: "pending" }));
      addLog(`Generating ${role}...`);
      try {
        const res = await fetch("/api/room/generate-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roles: [role], scenes: [] }),
        });
        const data = await res.json();
        const ok = data.results?.[role] && !data.results[role].includes("null");
        setStatus((s) => ({ ...s, [role]: ok ? "ok" : "fail" }));
        addLog(`${role}: ${ok ? "✓" : "✗ failed"} ${data.results?.[role] ?? ""}`);
      } catch (e) {
        setStatus((s) => ({ ...s, [role]: "fail" }));
        addLog(`${role}: error — ${e}`);
      }
    }
    // Generate scenes
    addLog("Generating scene banners and logo...");
    try {
      const res = await fetch("/api/room/generate-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: [], scenes: SCENES }),
      });
      const data = await res.json();
      for (const scene of SCENES) {
        const ok = data.results?.[scene];
        addLog(`${scene}: ${ok ? "✓" : "✗"}`);
      }
    } catch (e) { addLog(`Scenes error: ${e}`); }
    addLog("✅ Done! All images are cached in Supabase Storage.");
    setRunning(false);
  }

  return (
    <main className="min-h-screen bg-bg-base text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-cinzel font-black text-3xl text-gold mb-2">Setup — Image Generation</h1>
        <p className="text-white/50 mb-8 text-sm">Run once after adding GEMINI_API_KEY to Vercel. Generates all role cards, scene banners, and logo using Nano Banana Pro. Images are cached permanently.</p>
        <button onClick={runGeneration} disabled={running}
          className={`px-8 py-4 rounded-xl font-cinzel font-bold uppercase tracking-widest mb-8 transition-all ${running ? "bg-white/10 text-white/30" : "bg-gold text-bg-base hover:bg-gold-light"}`}>
          {running ? "Generating..." : "Generate All Images"}
        </button>
        {/* Status grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {ROLES.map((role) => (
            <div key={role} className={`glass rounded-xl p-3 text-center text-xs font-cinzel transition-all ${
              status[role] === "ok" ? "border-villagers/50 text-villagers" :
              status[role] === "fail" ? "border-wolves/50 text-wolves" :
              status[role] === "pending" ? "border-gold/50 text-gold animate-pulse" : "text-white/30"
            }`}>
              {status[role] === "ok" ? "✓" : status[role] === "fail" ? "✗" : status[role] === "pending" ? "⟳" : "○"} {role}
            </div>
          ))}
        </div>
        {/* Log */}
        {log.length > 0 && (
          <div className="glass rounded-xl p-4 max-h-64 overflow-y-auto">
            {log.map((l, i) => <p key={i} className="text-xs text-white/60 font-mono mb-1">{l}</p>)}
          </div>
        )}
      </div>
    </main>
  );
}
