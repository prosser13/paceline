// Body Signals — resting HR + HRV vs rolling baseline (illness / overreach flag).
// Variant A (final): status line + one-line verdict + RHR/HRV markers.
import type { BodySignals, Marker } from '@/lib/wellness-stats';
import { Tile, Pill, FLAG_COLOR, FLAG_SOFT } from './shared';

function chipLabel(m: Marker): string {
  if (m.value == null) return '—';
  if (m.tone === 'good' || m.delta == null) return m.base != null ? `≈ base ${m.base}` : 'in range';
  return `${m.delta > 0 ? '+' : ''}${m.delta} vs base`;
}

function MarkerRow({ label, unit, m }: { label: string; unit: string; m: Marker }) {
  return (
    <div className="flex items-center justify-between gap-3" style={{ padding: '9px 0', borderTop: '1px solid var(--color-fog)' }}>
      <span className="text-[12.5px] text-stone">{label}</span>
      <span className="flex items-center gap-[8px]">
        <span className="font-display font-bold text-[19px] tabular-nums">
          {m.value != null ? m.value : '—'}<span className="font-sans text-[11px] text-stone ml-[3px] font-semibold">{unit}</span>
        </span>
        <span className="font-bold text-[11px] tabular-nums rounded-[6px]"
          style={{ padding: '2px 7px', background: FLAG_SOFT[m.tone], color: FLAG_COLOR[m.tone] }}>{chipLabel(m)}</span>
      </span>
    </div>
  );
}

export function BodySignalsTile({ s }: { s: BodySignals }) {
  return (
    <Tile title="Body signals" kicker={s.ready ? `vs ${s.baselineDays}-day base` : 'baseline'}
      accent={s.status === 'alert' ? 'rgba(179,39,30,.4)' : undefined}>
      <Pill flag={s.status}>{s.headline}</Pill>
      <p className="text-[13px] leading-[1.45]" style={{ margin: '11px 0 0' }}>{s.line}</p>
      <div style={{ marginTop: '12px' }}>
        <MarkerRow label="Resting HR" unit="bpm" m={s.rhr} />
        <MarkerRow label="Overnight HRV" unit="ms" m={s.hrv} />
      </div>
    </Tile>
  );
}
