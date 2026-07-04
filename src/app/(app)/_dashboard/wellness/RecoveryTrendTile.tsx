// Recovery Trend — HRV + resting-HR trajectory vs baseline. Complements Body
// Signals (today's snapshot) by showing the 14-day trend.
import type { RecoveryTrend, TrendSeries } from '@/lib/wellness-stats';
import { Tile, Pill, Sparkline } from './shared';

function TrendRow({ label, unit, s, color }: { label: string; unit: string; s: TrendSeries; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] text-stone">{label}</span>
        <span className="font-display font-bold text-[17px] tabular-nums">
          {s.latest != null ? s.latest : '—'}<span className="font-sans text-[11px] text-stone ml-[3px] font-semibold">{unit}</span>
        </span>
      </div>
      <div style={{ marginTop: 4 }}>
        <Sparkline values={s.values} height={38} color={color} target={s.base ?? undefined} />
      </div>
    </div>
  );
}

export function RecoveryTrendTile({ t }: { t: RecoveryTrend }) {
  return (
    <Tile title="Recovery trend" kicker={`${t.days} days`}>
      <Pill flag={t.status}>{t.headline}</Pill>
      <div className="flex flex-col gap-[13px]" style={{ marginTop: 13 }}>
        <TrendRow label="Overnight HRV" unit="ms" s={t.hrv} color="var(--color-ride)" />
        <TrendRow label="Resting HR" unit="bpm" s={t.rhr} color="var(--color-run)" />
      </div>
      <p className="text-[12px] text-stone" style={{ margin: '11px 0 0' }}>Dashed line is your baseline.</p>
    </Tile>
  );
}
