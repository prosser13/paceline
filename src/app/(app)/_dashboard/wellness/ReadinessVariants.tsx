// Smarter Readiness — folds recovery (sleep + HRV) into the readiness score.
// Variants A (adjusted + why, dark) / B (contribution bar, dark) / C (before→after, light).
import { ReadinessRing } from '@/components/ReadinessRing';
import { Pill } from './shared';
import type { Flag } from '@/lib/wellness-stats';

export interface ReadinessProps {
  baseScore: number; baseBand: string;
  adjScore: number; adjBand: string;
  recovery: { delta: number; reason: string };
  variant: 'A' | 'B' | 'C';
}

const bandFlag = (band: string): Flag =>
  band === 'Primed' || band === 'Steady' ? 'good' : band === 'Workable' ? 'watch' : 'alert';

export function ReadinessVariant({ baseScore, adjScore, adjBand, recovery, variant }: ReadinessProps) {
  const delta = recovery.delta;
  const deltaTxt = delta === 0 ? 'no change' : `${delta > 0 ? '+' : ''}${delta}`;

  if (variant === 'B') {
    const lo = Math.max(0, Math.min(baseScore, adjScore));
    const width = Math.min(100, Math.abs(adjScore - baseScore));
    return (
      <div className="border rounded-[16px]" style={{ padding: '16px 18px', background: 'var(--color-hero)', borderColor: '#2c2a24', color: 'var(--color-onhero)' }}>
        <div className="flex items-center justify-between mb-[10px]">
          <span className="font-display font-bold text-[16px]">Readiness</span>
          <span className="font-mono text-[11px] uppercase tracking-[.06em] font-bold" style={{ color: '#b3ada0' }}>{adjScore} · {adjBand}</span>
        </div>
        <div className="font-display font-bold tabular-nums leading-none" style={{ fontSize: 40 }}>{adjScore}</div>
        <div className="relative rounded-[5px] overflow-hidden" style={{ height: 9, marginTop: 12, background: '#3a382f' }}>
          <i className="absolute top-0 bottom-0 left-0" style={{ width: `${Math.min(100, Math.min(baseScore, adjScore))}%`, background: '#7fb08a' }} />
          <i className="absolute top-0 bottom-0" style={{ left: `${lo}%`, width: `${width}%`, background: delta >= 0 ? '#6aa3e0' : '#d98a3d' }} />
        </div>
        <div className="flex gap-[14px] mt-[8px] text-[11px]" style={{ color: '#b3ada0' }}>
          <span className="flex items-center gap-[5px]"><i className="rounded-[2px]" style={{ width: 9, height: 9, background: '#7fb08a' }} />Training load</span>
          <span className="flex items-center gap-[5px]"><i className="rounded-[2px]" style={{ width: 9, height: 9, background: delta >= 0 ? '#6aa3e0' : '#d98a3d' }} />Recovery ({deltaTxt})</span>
        </div>
        <p className="text-[12px] mt-[11px] leading-[1.4]" style={{ color: '#b3ada0' }}>{recovery.reason}</p>
      </div>
    );
  }

  if (variant === 'C') {
    const up = delta > 0;
    return (
      <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '16px 18px' }}>
        <div className="flex items-center justify-between mb-[10px]">
          <span className="font-display font-bold text-[16px]">Readiness</span>
          <span className="font-mono text-[11px] uppercase tracking-[.06em] font-bold text-stone">recovery-aware</span>
        </div>
        <div className="flex items-baseline gap-[12px]">
          <span className="font-display tabular-nums text-stone text-[22px]" style={{ textDecoration: 'line-through', textDecorationColor: 'var(--color-fog)' }}>{baseScore}</span>
          <span className="text-[15px] text-stone">→</span>
          <span className="font-display font-bold tabular-nums" style={{ fontSize: 40, color: up ? 'var(--color-ready)' : delta < 0 ? 'var(--color-strength)' : 'var(--color-ink)' }}>{adjScore}</span>
          <span className="ml-auto"><Pill flag={bandFlag(adjBand)}>{adjBand}</Pill></span>
        </div>
        <p className="text-[13px] leading-[1.45]" style={{ marginTop: 11 }}>{recovery.reason} <span className="text-stone">(load-only was {baseScore})</span></p>
      </div>
    );
  }

  // Variant A — dark, adjusted score + why
  return (
    <div className="border rounded-[16px]" style={{ padding: '16px 18px', background: 'var(--color-hero)', borderColor: '#2c2a24', color: 'var(--color-onhero)' }}>
      <div className="flex items-center justify-between mb-[10px]">
        <span className="font-display font-bold text-[16px]">Readiness</span>
        <span className="font-mono text-[11px] uppercase tracking-[.06em] font-bold" style={{ color: '#b3ada0' }}>load + recovery</span>
      </div>
      <div className="flex items-center gap-[16px]">
        <ReadinessRing score={adjScore} size={72} />
        <div className="flex-1 min-w-0">
          <div className="font-display text-[20px]">{adjBand}</div>
          <div className="text-[12px] leading-[1.4]" style={{ color: '#b3ada0', marginTop: 4 }}>
            {delta === 0 ? 'Recovery neutral — score unchanged.' : <>Load alone said {baseScore} — <b style={{ color: delta > 0 ? '#7fb08a' : '#d98a3d' }}>{recovery.reason.toLowerCase()}</b></>}
          </div>
        </div>
      </div>
    </div>
  );
}
