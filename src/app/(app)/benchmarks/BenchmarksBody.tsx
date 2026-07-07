// Benchmarks page body — presentational. Renders the fitness ladder from
// loadBenchmarksData(): predicted marathon + signal breakdown, threshold pace,
// VO2max / eFTP / resting HR trends, and recent race results.

import { fmtHms, fmtPace } from '@/lib/prediction';
import type { BenchmarksData, Series } from './data';

function SecLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] uppercase font-bold" style={{ letterSpacing: '.06em', margin: '22px 0 12px' }}>{children}</div>;
}

const RACE_LABELS: [number, string][] = [[42.195, 'Marathon'], [21.0975, 'HM'], [10, '10K'], [5, '5K']];
function raceLabel(km: number): string {
  const hit = RACE_LABELS.find(([d]) => Math.abs(km - d) < Math.max(0.2, d * 0.02));
  return hit ? hit[1] : `${km % 1 === 0 ? km : km.toFixed(1)} km`;
}
function shortDate(iso: string): string {
  try { return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  catch { return iso; }
}

// A small trend sparkline; `invert` flips it so "lower is better" reads as up.
function Sparkline({ series, color = 'var(--color-ride)', invert = false }: { series: Series[]; color?: string; invert?: boolean }) {
  if (series.length < 2) return <div className="h-[36px] flex items-center text-[10px] text-stone">building…</div>;
  const W = 150, H = 40, pad = 3;
  const vs = series.map(s => s.v);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const span = hi - lo || 1;
  const x = (i: number) => pad + (i / (series.length - 1)) * (W - pad * 2);
  const y = (v: number) => { const t = (v - lo) / span; return pad + (invert ? t : 1 - t) * (H - pad * 2); };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} className="max-w-full">
      <polyline points={series.map((s, i) => `${x(i)},${y(s.v)}`).join(' ')} fill="none" stroke={color} strokeWidth="2" />
      <circle cx={x(series.length - 1)} cy={y(series[series.length - 1].v)} r="2.6" fill={color} />
    </svg>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '16px 18px' }}>{children}</div>;
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] uppercase font-bold text-stone" style={{ letterSpacing: '.06em' }}>{children}</div>;
}

export default function BenchmarksBody({ d }: { d: BenchmarksData }) {
  const gap = d.predictedSeconds != null && d.targetSeconds != null ? d.predictedSeconds - d.targetSeconds : null;

  return (
    <>
      <h1 className="font-display font-bold text-[26px] mb-1">Benchmarks</h1>
      <p className="text-[13px] text-stone mb-2">Where your fitness stands against {d.raceName ?? 'your goal'} — the last 12 weeks.</p>

      {/* Predicted marathon */}
      <SecLabel>Predicted marathon</SecLabel>
      <Card>
        <div className="flex items-baseline gap-3 flex-wrap">
          <div className="font-display font-bold text-[30px] leading-none">
            {d.predictedSeconds != null ? fmtHms(d.predictedSeconds) : '—'}
          </div>
          {d.targetSeconds != null && (
            <div className="text-[13px] text-stone">
              target <span className="font-semibold text-ink">{fmtHms(d.targetSeconds)}</span>
              {gap != null && <span> · gap {gap <= 0 ? '−' : '+'}{fmtGap(Math.abs(gap))}</span>}
            </div>
          )}
        </div>
        {d.signals.length > 0 && (
          <div className="mt-[14px] overflow-x-auto">
            <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th className="text-left text-[10.5px] uppercase text-stone font-bold pb-[8px] border-b border-fog" style={{ letterSpacing: '.05em' }}>Signal</th>
                  <th className="text-right text-[10.5px] uppercase text-stone font-bold pb-[8px] border-b border-fog" style={{ letterSpacing: '.05em' }}>Implies</th>
                </tr>
              </thead>
              <tbody>
                {d.signals.map((s, i) => (
                  <tr key={i}>
                    <td className="py-[8px] border-b border-fog/60">{s.label}</td>
                    <td className="py-[8px] border-b border-fog/60 text-right font-semibold">{fmtHms(s.impliedSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11.5px] text-stone mt-[8px]">Blended, weighting the freshest and most reliable signals highest.</p>
          </div>
        )}
      </Card>

      {/* Threshold pace */}
      <SecLabel>Threshold pace</SecLabel>
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Eyebrow>Current</Eyebrow>
            <div className="font-display font-bold text-[26px] leading-none mt-[4px]">
              {d.thresholdMinKm != null ? <>{fmtPace(d.thresholdMinKm)}<span className="text-[13px] text-stone"> /km</span></> : '—'}
            </div>
          </div>
          <Sparkline series={d.thresholdTrend} color="var(--color-run)" invert />
        </div>
      </Card>

      {/* Running VDOT + resting HR. Garmin's wellness VO2max is the athlete's cycling
          number, so it's deliberately not shown; VDOT here is running-specific. */}
      <SecLabel>Running fitness</SecLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px]">
        <Marker label="VDOT · running" value={d.vdot.current != null ? String(d.vdot.current) : '—'} series={d.vdot.series} color="var(--color-run)" />
        <Marker label="Resting HR" value={d.restingHr.current != null ? `${d.restingHr.current}` : '—'} series={d.restingHr.series} color="var(--color-yoga)" invert />
      </div>
      <p className="text-[11.5px] text-stone mt-[8px]">VDOT is Daniels’ running-fitness score, derived from your race results and threshold pace — not Garmin’s VO2max.</p>

      {/* Race results */}
      <SecLabel>Race results</SecLabel>
      <Card>
        {d.races.length === 0 ? (
          <p className="text-[13px] text-stone">No races logged yet — your next tune-up will anchor the prediction.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Date', 'Race', 'Time', 'Implies marathon'].map((h, i) => (
                    <th key={h} className={`text-[10.5px] uppercase text-stone font-bold pb-[8px] border-b border-fog ${i > 1 ? 'text-right' : 'text-left'}`} style={{ letterSpacing: '.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.races.map((r, i) => (
                  <tr key={i}>
                    <td className="py-[9px] border-b border-fog/60">{shortDate(r.date)}</td>
                    <td className="py-[9px] border-b border-fog/60">{raceLabel(r.distanceKm)}</td>
                    <td className="py-[9px] border-b border-fog/60 text-right">{fmtHms(r.seconds)}</td>
                    <td className="py-[9px] border-b border-fog/60 text-right font-semibold">{fmtHms(r.impliedMarathonSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Long-run quality */}
      <SecLabel>Long-run quality</SecLabel>
      <Card>
        {d.longRuns.length === 0 ? (
          <p className="text-[13px] text-stone">No long runs in the last 12 weeks yet. Decoupling &amp; pace-decay populate from your Strava streams as long runs sync.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[['Date', 'l'], ['Dist', 'r'], ['NGP', 'r'], ['Decouple', 'r'], ['Final-⅓ decay', 'r']].map(([h, a]) => (
                    <th key={h} className={`text-[10.5px] uppercase text-stone font-bold pb-[8px] border-b border-fog ${a === 'r' ? 'text-right' : 'text-left'}`} style={{ letterSpacing: '.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.longRuns.map((r, i) => (
                  <tr key={i}>
                    <td className="py-[9px] border-b border-fog/60">{shortDate(r.date)}</td>
                    <td className="py-[9px] border-b border-fog/60 text-right">{Math.round(r.km)} km</td>
                    <td className="py-[9px] border-b border-fog/60 text-right">{fmtPace(r.ngpMinKm)}</td>
                    <td className={`py-[9px] border-b border-fog/60 text-right font-semibold ${driftColor(r.decouplingPct, 5, 8)}`}>{fmtPct(r.decouplingPct)}</td>
                    <td className={`py-[9px] border-b border-fog/60 text-right font-semibold ${driftColor(r.paceDecayPct, 2, 4)}`}>{fmtPct(r.paceDecayPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11.5px] text-stone mt-[8px]">Decoupling = HR drift vs pace (lower = more durable; &lt;5% is strong). Final-⅓ decay = grade-adjusted slowdown over the last third. Both grade-adjusted.</p>
          </div>
        )}
      </Card>

      <p className="text-[11.5px] text-stone mt-[18px]">Execution scoring, RPE, and gear tracking arrive in later updates.</p>
    </>
  );
}

// Green under `good`, amber under `warn`, red above — for "lower is better" drift metrics.
function driftColor(v: number | null, good: number, warn: number): string {
  if (v == null) return 'text-stone';
  if (v <= good) return 'text-ready';
  if (v <= warn) return 'text-strength';
  return 'text-run';
}
function fmtPct(v: number | null): string {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function Marker({ label, value, series, color, invert = false }: { label: string; value: string; series: Series[]; color: string; invert?: boolean }) {
  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '14px 16px' }}>
      <Eyebrow>{label}</Eyebrow>
      <div className="font-display font-bold text-[24px] leading-none my-[6px]">{value}</div>
      <Sparkline series={series} color={color} invert={invert} />
    </div>
  );
}

function fmtGap(seconds: number): string {
  const s = Math.round(seconds);
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}
