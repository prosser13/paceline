import { READY } from '@/lib/colors';

// Shared readiness ring (the dashboard's dark-tile gauge). 0–100 score → arc.
// Used by the dashboard Today tile and the race-detail predicted-readiness card.
export function ReadinessRing({ score, size = 52 }: { score: number | null; size?: number }) {
  const C = 138; // 2π·22
  const off = Math.round(C * (1 - (score != null ? Math.max(0, Math.min(100, score)) / 100 : 0)));
  return (
    <svg viewBox="0 0 54 54" style={{ width: size, height: size }} className="shrink-0" aria-hidden="true">
      <circle cx="27" cy="27" r="22" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="6" />
      {score != null && (
        <circle
          cx="27" cy="27" r="22" fill="none" stroke={READY} strokeWidth="6"
          strokeDasharray={C} strokeDashoffset={off} strokeLinecap="round"
          transform="rotate(-90 27 27)"
        />
      )}
    </svg>
  );
}
