"use client";
/**
 * RoleCardCanvas — Shows the composited role card for the current player.
 * Uses useRoleCard hook to draw base image + player name overlay via Canvas.
 * Supports full-bleed display with flip animation and download button.
 */
import { motion, AnimatePresence } from "framer-motion";
import { useRoleCard } from "@/hooks/useRoleCard";
import { ROLE_BASE_IMAGES, getRoleSVGPlaceholder } from "@/lib/image-assets";
import { ROLES } from "@/types";
import type { Player, RoleName } from "@/types";

interface Props {
  player: Player;
  wolvesMates?: string[];
  onDismiss: () => void;
}

export default function RoleCardCanvas({ player, wolvesMates, onDismiss }: Props) {
  const roleData = ROLES[player.role as RoleName];
  const baseUrl = player.role_card_url
    ?? ROLE_BASE_IMAGES[player.role ?? ""] 
    ?? getRoleSVGPlaceholder(player.role ?? "", roleData?.color ?? "#c9a84c", roleData?.emoji ?? "🎭");

  const { dataUrl, loading } = useRoleCard({
    baseImageUrl: baseUrl,
    playerName: player.name,
    roleName: player.role ?? "?",
    roleColor: roleData?.color ?? "#c9a84c",
    roleEmoji: roleData?.emoji ?? "🎭",
    isLover: player.is_lover,
    wolvesMates,
  });

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `loupgarou-${player.name.toLowerCase()}.jpg`;
    a.click();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-black/95 flex flex-col items-center justify-center p-4 safe-top safe-bottom"
        onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
      >
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="font-cinzel text-gold/70 text-xs tracking-[0.3em] uppercase mb-5"
        >
          🔒 Votre rôle secret — ne montrez à personne
        </motion.p>

        {/* Card */}
        <motion.div
          initial={{ rotateY: 90, scale: 0.8 }}
          animate={{ rotateY: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 22, delay: 0.1 }}
          className="relative w-full max-w-[340px] sm:max-w-[380px] rounded-[24px] overflow-hidden shadow-wolves"
          style={{ aspectRatio: "700/980" }}
        >
          {loading ? (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ background: `radial-gradient(ellipse at center, ${roleData?.color ?? "#333"}22, #07070f)` }}
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                className="text-5xl"
              >
                {roleData?.emoji}
              </motion.div>
            </div>
          ) : (
            <img
              src={dataUrl ?? baseUrl}
              alt={`${player.name} — ${player.role}`}
              className="w-full h-full object-cover"
              draggable={false}
            />
          )}

          {/* Glow border overlay */}
          <div
            className="absolute inset-0 rounded-[24px] pointer-events-none"
            style={{ boxShadow: `inset 0 0 0 2px ${roleData?.color ?? "#c9a84c"}40` }}
          />
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex gap-3 mt-5 w-full max-w-[380px]"
        >
          <button
            onClick={handleDownload}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border border-white/15 font-cinzel text-white/50 text-sm hover:text-white/80 hover:border-white/30 transition-all disabled:opacity-30"
          >
            💾 Sauvegarder
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 py-3 rounded-xl font-cinzel font-semibold text-sm transition-all"
            style={{ background: `${roleData?.color ?? "#c9a84c"}25`, border: `1px solid ${roleData?.color ?? "#c9a84c"}50`, color: roleData?.color ?? "#c9a84c" }}
          >
            Compris ✓
          </button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.35 }}
          transition={{ delay: 0.8 }}
          className="font-cinzel text-white/30 text-[10px] tracking-widest uppercase mt-4"
        >
          Loup-Garou en ligne
        </motion.p>
      </motion.div>
    </AnimatePresence>
  );
}
