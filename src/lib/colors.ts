// Brand palette — raw hex values for use in inline SVG strokes and `style` props
// where a Tailwind class can't reach (e.g. dynamic colours, SVG `stroke`). For
// className usage prefer the Tailwind tokens in globals.css (bg-run, text-ride,
// …) — these are the same values, kept in one place so the dashboard and plan
// views don't drift.

// ── Neutrals ───────────────────────────────────
export const INK     = '#17150f';
export const BONE    = '#e6e4df';   // page background
export const PAPER   = '#faf8f1';   // card surface
export const STONE   = '#5b5852';   // muted text
export const FOG     = '#d8d3c9';   // hairline border
export const HERO    = '#1b1a16';   // near-black focal tile
export const ONHERO  = '#f3f1ea';

// ── Sport (semantic) ───────────────────────────
export const RUN      = '#c4452c';
export const RIDE     = '#2f6f9e';
export const SWIM     = '#0e8fb0';   // cyan — distinct from ride blue / yoga teal
export const STRENGTH = '#b07d12';
export const YOGA     = '#2f8f7a';
export const HARD     = '#d2691e';   // quality / VO2
export const RACE     = '#b3271e';
export const READY    = '#2e9e6b';

// Lighter "B" sport variants — for use ON the dark hero tile / week-strip today
// cell, where the base sport colour is too dark to read.
export const RUN_B      = '#e7634a';
export const RIDE_B     = '#6aa3e0';
export const SWIM_B     = '#3fb8d4';
export const STRENGTH_B = '#ecb73c';
export const YOGA_B     = '#43bd9e';
export const WARN       = '#c1881a';   // ACWR "slightly high"
export const FATIGUE    = '#d98a3d';   // fatigue (ATL) trend line

// Soft pill styling for the A/B/C race-priority badge (light tint + dark text).
export const RACE_PRIORITY_BADGE: Record<string, { bg: string; fg: string }> = {
  A: { bg: '#f3d3cf', fg: '#8a221b' },
  B: { bg: '#f6e6c4', fg: '#7a5300' },
  C: { bg: '#d6e3ef', fg: '#27506e' },
};

// ── Phases ─────────────────────────────────────
export const PHASE_COLOR: Record<string, string> = {
  Base:  '#2f6f9e',
  Build: '#b07d12',
  Peak:  '#d2691e',
  Taper: '#2f8f7a',
};

// ── Zones (Z1–Z5 intensity) ────────────────────
export const ZONE_COLOR: Record<string, string> = {
  Z1: '#9ab8c9', Z2: '#2f6f9e', Z3: '#3f8f6a', Z4: '#caa23a', Z5: '#d2691e', Race: '#b3271e',
};

// A/B/C race-priority colours — must match the plan page's RaceBadge.
export const RACE_PRIORITY_COLOR: Record<string, string> = {
  A: '#b3271e', // race red
  B: '#b07d12', // gold
  C: '#2f6f9e', // blue
};

// ── Legacy aliases (kept so existing imports keep working; remapped to the
//    nearest new value until each consumer migrates to the semantic names). ──
export const OXBLOOD = RUN;
export const MARINE  = RIDE;
export const FERN    = '#3f8f6a';
export const EMBER   = HARD;
export const COFFEE  = YOGA;
export const GOLD    = STRENGTH;
export const AMBER   = '#caa23a';
