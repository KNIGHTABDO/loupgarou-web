/**
 * Central registry of all game image assets.
 * Base images are pre-generated via Nano Banana Pro and stored in Supabase Storage.
 * Falls back to SVG data URIs if not yet generated.
 * Player name/data is composited at runtime via Canvas API (see useRoleCard hook).
 */

export const SUPABASE_STORAGE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL + "/storage/v1/object/public/game-assets";

/** Pre-generated base role card URLs (Nano Banana Pro, stored in Supabase Storage) */
export const ROLE_BASE_IMAGES: Record<string, string> = {
  "Loup-Garou": `${SUPABASE_STORAGE_URL}/roles/loup-garou.jpg`,
  "Villageois": `${SUPABASE_STORAGE_URL}/roles/villageois.jpg`,
  "Voyante": `${SUPABASE_STORAGE_URL}/roles/voyante.jpg`,
  "Sorciere": `${SUPABASE_STORAGE_URL}/roles/sorciere.jpg`,
  "Chasseur": `${SUPABASE_STORAGE_URL}/roles/chasseur.jpg`,
  "Garde": `${SUPABASE_STORAGE_URL}/roles/garde.jpg`,
  "Cupidon": `${SUPABASE_STORAGE_URL}/roles/cupidon.jpg`,
  "Petite Fille": `${SUPABASE_STORAGE_URL}/roles/petite-fille.jpg`,
};

export const SCENE_IMAGES = {
  nightBanner: `${SUPABASE_STORAGE_URL}/scenes/night-banner.jpg`,
  dayBanner: `${SUPABASE_STORAGE_URL}/scenes/day-banner.jpg`,
  wolvesWin: `${SUPABASE_STORAGE_URL}/scenes/wolves-win.jpg`,
  villagersWin: `${SUPABASE_STORAGE_URL}/scenes/villagers-win.jpg`,
  loversWin: `${SUPABASE_STORAGE_URL}/scenes/lovers-win.jpg`,
};

export const BRAND_IMAGES = {
  logo: `${SUPABASE_STORAGE_URL}/brand/logo.jpg`,
};

/**
 * Role card placeholder — generated via SVG when Supabase image not ready.
 * These are rendered server-side into a rich dark card with the role color.
 * The canvas compositing still works on top of these.
 */
export function getRoleSVGPlaceholder(role: string, color: string, emoji: string): string {
  const svg = `
<svg width="700" height="980" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#07070f" stop-opacity="1"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="40"/></filter>
    <filter id="glow-filter"><feGaussianBlur stdDeviation="8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <!-- Background -->
  <rect width="700" height="980" fill="#07070f"/>
  <rect width="700" height="980" fill="url(#bg)"/>
  <!-- Ambient glow circles -->
  <circle cx="350" cy="340" r="280" fill="url(#glow)" filter="url(#blur)" opacity="0.6"/>
  <!-- Decorative border -->
  <rect x="12" y="12" width="676" height="956" rx="24" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.4"/>
  <rect x="20" y="20" width="660" height="940" rx="20" fill="none" stroke="${color}" stroke-width="0.5" opacity="0.2"/>
  <!-- Corner ornaments -->
  <path d="M12,60 L12,12 L60,12" fill="none" stroke="${color}" stroke-width="2" opacity="0.7"/>
  <path d="M640,12 L688,12 L688,60" fill="none" stroke="${color}" stroke-width="2" opacity="0.7"/>
  <path d="M12,920 L12,968 L60,968" fill="none" stroke="${color}" stroke-width="2" opacity="0.7"/>
  <path d="M640,968 L688,968 L688,920" fill="none" stroke="${color}" stroke-width="2" opacity="0.7"/>
  <!-- Center emoji art -->
  <text x="350" y="430" text-anchor="middle" font-size="220" filter="url(#glow-filter)">${emoji}</text>
  <!-- Decorative divider -->
  <line x1="120" y1="510" x2="580" y2="510" stroke="${color}" stroke-width="1" opacity="0.4"/>
  <circle cx="350" cy="510" r="4" fill="${color}" opacity="0.6"/>
  <!-- Text overlay zone (bottom ~250px) - the canvas will write here -->
  <rect x="0" y="730" width="700" height="250" fill="#07070f" opacity="0.92"/>
  <rect x="0" y="730" width="700" height="2" fill="${color}" opacity="0.3"/>
  <!-- Role label placeholder area -->
  <rect x="220" y="756" width="260" height="44" rx="22" fill="${color}" opacity="0.15"/>
  <rect x="220" y="756" width="260" height="44" rx="22" fill="none" stroke="${color}" stroke-width="1" opacity="0.3"/>
</svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}
