// Sleep — last night + 7-night trend + 8h-target nudge. Variants A / B / C.
import type { SleepSummary } from '@/lib/wellness-stats';
import { fmtSleep, fmtDate } from '@/lib/dates';
import { Tile, Pill, ScoreRing, Sparkline } from './shared';

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

export function SleepTile({ s, variant }: { s: SleepSummary; variant: 'A' | 'B' | 'C' }) {
  const overUnder = s.lastSecs != null ? s.lastSecs - s.target : null;
  const balanceH = s.balanceSecs != null ? Math.round(Math.abs(s.balanceSecs) / 3600 * 10) / 10 : null;

  if (variant === 'B') {
    return (
      <Tile title="Sleep" kicker={s.lastDate ? fmtDate(s.lastDate, 'weekday') : 'last night'}>
        <div className="font-display font-bold tabular-nums leading-none" style={{ fontSize: 40 }}>{fmtSleep(s.lastSecs)}</div>
        <div className="flex gap-[8px] mt-[8px]">
          {s.lastScore != null && <span className="text-[11px] font-bold rounded-[6px] tabular-nums" style={{ padding: '2px 7px', background: 'rgba(46,158,107,.13)', color: 'var(--color-ready)' }}>score {Math.round(s.lastScore)}</span>}
          {overUnder != null && <span className="text-[11px] font-bold rounded-[6px] tabular-nums" style={{ padding: '2px 7px', background: 'rgba(91,88,82,.1)', color: 'var(--color-stone)' }}>{overUnder >= 0 ? '+' : '−'}{fmtSleep(Math.abs(overUnder))} vs 8h</span>}
        </div>
        <div style={{ marginTop: 14 }}>
          <Sparkline values={s.nights.map(n => n.secs)} height={40} target={s.target} />
        </div>
        <p className="text-[12px] text-stone mt-[10px]">7-night average <b className="text-ink">{s.avgSecs != null ? fmtSleep(s.avgSecs) : '—'}</b> · target line dashed</p>
      </Tile>
    );
  }

  if (variant === 'C') {
    const ahead = (s.balanceSecs ?? 0) >= 0;
    return (
      <Tile title="Sleep balance" kicker="7 nights vs 8h">
        <div className="flex items-baseline gap-[8px]">
          <span className="font-display font-bold tabular-nums leading-none" style={{ fontSize: 38, color: ahead ? 'var(--color-ready)' : 'var(--color-strength)' }}>
            {balanceH != null ? `${ahead ? '+' : '−'}${fmtSleep(Math.abs(s.balanceSecs ?? 0))}` : '—'}
          </span>
          <span className="text-[12.5px] text-stone">{ahead ? 'ahead of target' : 'behind target'}</span>
        </div>
        <div style={{ marginTop: 14 }}><NightBars s={s} /></div>
        <p className="text-[13px] leading-[1.45] mt-[11px]">{s.nudge}</p>
      </Tile>
    );
  }

  // Variant A — ring + hours + week bars + nudge
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
