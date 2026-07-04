// Shared chrome for the wellness tiles (mockup set). Presentational only.
import type { Flag } from '@/lib/wellness-stats';

export const FLAG_COLOR: Record<Flag, string> = {
  good: 'var(--color-ready)', watch: 'var(--color-strength)', alert: 'var(--color-race)', neutral: 'var(--color-stone)',
};
export const FLAG_SOFT: Record<Flag, string> = {
  good: 'rgba(46,158,107,.13)', watch: 'rgba(176,125,18,.14)', alert: 'rgba(179,39,30,.11)', neutral: 'rgba(91,88,82,.10)',
};

export function Pill({ flag, children }: { flag: Flag; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-[6px] rounded-full font-bold text-[12px] leading-tight"
      style={{ padding: '3px 10px', background: FLAG_SOFT[flag], color: FLAG_COLOR[flag] }}>
      <span className="rounded-full" style={{ width: 8, height: 8, background: FLAG_COLOR[flag] }} />
      {children}
    </span>
  );
}

export function Tile({ title, kicker, dark = false, accent, children }: {
  title: string; kicker?: React.ReactNode; dark?: boolean; accent?: string; children: React.ReactNode;
}) {
  return (
    <div className="border rounded-[16px]"
      style={{ padding: '16px 18px',
        background: dark ? 'var(--color-hero)' : 'var(--color-paper)',
        borderColor: dark ? '#2c2a24' : (accent ?? 'var(--color-fog)'),
        color: dark ? 'var(--color-onhero)' : undefined }}>
      <div className="flex items-center justify-between mb-[10px]">
        <span className="font-display font-bold text-[16px]">{title}</span>
        {kicker != null && (
          <span className="font-mono text-[11px] uppercase tracking-[.06em] font-bold"
            style={{ color: dark ? '#b3ada0' : 'var(--color-stone)' }}>{kicker}</span>
        )}
      </div>
      {children}
    </div>
  );
}

// 0–100 score ring for light tiles (track = fog, value = accent).
export function ScoreRing({ score, size = 64, color = 'var(--color-ready)' }: { score: number | null; size?: number; color?: string }) {
  const C = 138; // 2π·22
  const off = Math.round(C * (1 - (score != null ? Math.max(0, Math.min(100, score)) / 100 : 0)));
  return (
    <svg viewBox="0 0 54 54" style={{ width: size, height: size }} className="shrink-0" aria-hidden="true">
      <circle cx="27" cy="27" r="22" fill="none" stroke="var(--color-fog)" strokeWidth="6" />
      {score != null && (
        <circle cx="27" cy="27" r="22" fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={C} strokeDashoffset={off} strokeLinecap="round" transform="rotate(-90 27 27)" />
      )}
      <text x="27" y="31" textAnchor="middle" className="font-display" fontSize="15" fontWeight="700" fill="var(--color-ink)">
        {score != null ? Math.round(score) : '—'}
      </text>
    </svg>
  );
}

// Minimal trend sparkline with optional dashed target line + emphasized endpoint.
export function Sparkline({ values, width = 120, height = 34, color = 'var(--color-stone)', target }: {
  values: (number | null)[]; width?: number; height?: number; color?: string; target?: number;
}) {
  const nums = values.map(v => (v == null || !Number.isFinite(v) ? null : v));
  const present = nums.filter((v): v is number => v != null);
  if (present.length < 2) return null;
  const lo = Math.min(...present, ...(target != null ? [target] : []));
  const hi = Math.max(...present, ...(target != null ? [target] : []));
  const range = hi - lo || 1;
  const pad = 3;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - pad - ((v - lo) / range) * (height - 2 * pad);
  // Build the path across present points (skip gaps).
  const pts = nums.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ');
  const lastIdx = nums.map((v, i) => (v != null ? i : -1)).reduce((a, b) => (b > a ? b : a), -1);
  const lastV = nums[lastIdx] as number;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" style={{ display: 'block' }}>
      {target != null && <line x1="0" x2={width} y1={y(target)} y2={y(target)} stroke="rgba(91,88,82,.3)" strokeDasharray="2 3" />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" />
      <circle cx={x(lastIdx)} cy={y(lastV)} r="2.6" fill="var(--color-ready)" />
    </svg>
  );
}
