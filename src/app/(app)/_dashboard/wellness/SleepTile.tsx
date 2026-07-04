// Sleep — last night + 7-night trend + 8h-target nudge (final design: variant A).
import type { SleepSummary } from '@/lib/wellness-stats';
import { fmtSleep, fmtDate } from '@/lib/dates';
import { Tile, Pill, ScoreRing } from './shared';

function NightBars({ s, maxBar = 46 }: { s: SleepSummary; maxBar?: number }) {
  const secs = s.nights.map(n => n.secs ?? 0);
  const scale = Math.max(s.target, ...secs, 1);
  const targetBottom = (s.target / scale) * maxBar;
  return (
    <div className="flex items-end gap-[7px] relative" style={{ height: maxBar + 12 }}>
      <div className="absolute left-0 right-0 border-t border-dashed" style={{ bottom: 12 + targetBottom, borderColor: 'rgba(91,88,82,.45)' }} />
      {s.nights.map(n => (
        <div key={n.date} className="flex-1 flex flex-col items-center gap-[5px] justify-end" style={{ height: '100%' }}>
          <div className="w-full rounded-t-[3px]" style={{
            height: Math.max(4, ((n.secs ?? 0) / scale) * maxBar),
            background: n.hit ? 'var(--color-ready)' : 'var(--color-strength)',
            opacity: n.secs == null ? 0.25 : 1 }} />
          <span className="text-[9px] font-bold text-stone">{fmtDate(n.date, 'weekday')[0]}</span>
        </div>
      ))}
    </div>
  );
}

export function SleepTile({ s }: { s: SleepSummary }) {
  const overUnder = s.lastSecs != null ? s.lastSecs - s.target : null;
  return (
    <Tile title="Sleep" kicker={s.lastDate ? `last night · ${fmtDate(s.lastDate, 'weekday')}` : 'last night'}>
      <div className="flex items-center gap-[16px]">
        <ScoreRing score={s.lastScore} size={72} />
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold tabular-nums leading-none" style={{ fontSize: 34 }}>{fmtSleep(s.lastSecs)}</div>
          {overUnder != null && (
            <div className="text-[12.5px] text-stone" style={{ marginTop: 4 }}>
              {overUnder >= 0 ? `${fmtSleep(overUnder)} over` : `${fmtSleep(-overUnder)} under`} your 8h target
            </div>
          )}
        </div>
      </div>
      <div style={{ marginTop: 16 }}><NightBars s={s} /></div>
      <p className="text-[13px] leading-[1.45] flex items-center gap-[8px] flex-wrap" style={{ marginTop: 11 }}>
        <Pill flag={s.tone}>{s.tone === 'good' ? 'On point' : 'Watch it'}</Pill>{s.nudge}
      </p>
    </Tile>
  );
}
