// Benchmarks page body — presentational. Renders the fitness ladder from
// loadBenchmarksData(): predicted marathon + signal breakdown, threshold pace,
// VO2max / eFTP / resting HR trends, and recent race results.

import { fmtHms, fmtPace } from '@/lib/prediction';
import type { ExperimentalPredictionView, SwimPredictionView } from '@/data/benchmarks';
import MetricTrendChart from '@/components/MetricTrendChart';
import FuelLogCell from '@/components/FuelLogCell';
import ThresholdSuggestion from './ThresholdSuggestion';
import type { BenchmarksData, Series, Tri703View } from './data';

// A strong negative split inflates aerobic decoupling (it reads the intended
// surge, not fatigue), so we flag it as unreliable rather than colour it red.
function decoupleUnreliable(paceDecayPct: number | null): boolean {
  return paceDecayPct != null && paceDecayPct < -5;
}

function SecLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] uppercase font-bold" style={{ letterSpacing: '.06em', margin: '22px 0 12px' }}>{children}</div>;
}

// "m:ss" per-km from integer seconds.
function fmtPaceSec(sec: number | null): string {
  if (sec == null) return '—';
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}/km`;
}

// A Δ-vs-lookback cell: ▼ faster (green) / ▲ slower (muted) / — none.
function DeltaCell({ sec }: { sec: number | null }) {
  if (sec == null || sec === 0) return <td className="py-[9px] border-b border-fog/60 text-right text-stone/50">—</td>;
  const better = sec < 0;
  return (
    <td className="py-[9px] border-b border-fog/60 text-right font-semibold" style={{ color: better ? 'var(--color-ready)' : 'var(--color-stone)' }}>
      {better ? '▼' : '▲'} {fmtGap(Math.abs(sec))}
    </td>
  );
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
          <DeltaChip deltaSec={d.predictedDeltaSec} kind="time" />
        </div>
        {d.rawPredictedSeconds != null && d.predictedSeconds != null && d.predictedSeconds !== d.rawPredictedSeconds && (
          <p className="text-[11.5px] text-stone mt-[6px]">
            Adjusted for current endurance training — {d.endurance.avgWeeklyKm} km/wk vs {d.endurance.anchorWeeklyKm} at the block’s peak
            (speed alone implies <b>{fmtHms(d.rawPredictedSeconds)}</b>). The gap closes as the block’s volume goes in.
          </p>
        )}
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

      {/* Predicted races — the current blended fitness read at every distance, with
          the change since 7 / 30 / 90 days ago. */}
      <SecLabel>Predicted races</SecLabel>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {[['Distance', 'l'], ['Time', 'r'], ['Pace', 'r'], ['Δ7d', 'r'], ['Δ30d', 'r'], ['Δ90d', 'r']].map(([h, a]) => (
                  <th key={h} className={`text-[10.5px] uppercase text-stone font-bold pb-[8px] border-b border-fog ${a === 'r' ? 'text-right' : 'text-left'}`} style={{ letterSpacing: '.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.predictedRaces.map((r, i) => (
                <tr key={i}>
                  <td className="py-[9px] border-b border-fog/60 font-semibold">{r.label}</td>
                  <td className="py-[9px] border-b border-fog/60 text-right font-semibold">{r.seconds != null ? fmtHms(r.seconds) : '—'}</td>
                  <td className="py-[9px] border-b border-fog/60 text-right text-stone">{fmtPaceSec(r.paceSecPerKm)}</td>
                  <DeltaCell sec={r.deltaSec.d7} />
                  <DeltaCell sec={r.deltaSec.d30} />
                  <DeltaCell sec={r.deltaSec.d90} />
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11.5px] text-stone mt-[8px]">From your current fitness (one blended VDOT read at each distance); HM &amp; marathon are endurance-adjusted for current training volume. Δ = change since 7 / 30 / 90 days ago — <b style={{ color: 'var(--color-ready)' }}>▼ faster</b> is progress; the longer look-backs fill in as weekly history accrues.</p>
        </div>
      </Card>

      {/* Experimental predictors — three independent models, deliberately NOT
          blended into the main prediction, so they can (usefully) disagree. */}
      <SecLabel>Experimental predictions</SecLabel>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[12px]">
        {d.experimental.map(p => <ExperimentalTile key={p.key} p={p} />)}
      </div>
      <p className="text-[11.5px] text-stone mt-[8px]">
        Three alternative models, each reading your data through a different theory — race scaling, the
        training log, and heart-rate economy. They&rsquo;re experimental and intentionally kept out of the main
        blend: when they agree the prediction is trustworthy; when one diverges, it says something about
        where your fitness is coming from.
      </p>

      {/* Swim predictions — Riegel scaling over swim time-trials (own model; VDOT is
          running-only). Activates once a swim time-trial is logged. */}
      <SecLabel>Swim predictions</SecLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px]">
        {d.swimPredictions.map(p => <SwimPredictionTile key={p.targetM} p={p} />)}
      </div>
      <p className="text-[11.5px] text-stone mt-[8px]">
        Your 750 m and 1900 m swim times projected from your own swim time-trials with Riegel&rsquo;s power
        law (fatigue exponent fitted once you have two distinct distances). Swim a hard time-trial to
        activate — VDOT doesn&rsquo;t transfer to the water, so this is its own small model.
      </p>

      {/* 70.3 finish predictor — swim + T1 + bike + T2 + run from live fitness over
          the Swansea course profile. The capstone of the multi-sport benchmarks. */}
      <SecLabel>70.3 predictor</SecLabel>
      <Tri703Tile t={d.tri703} />
      <p className="text-[11.5px] text-stone mt-[8px]">
        Your projected {d.tri703.raceName} finish, built leg by leg from your current fitness — swim from
        CSS, bike from FTP over the course&rsquo;s 1,106 m of climbing, run from threshold pace off the bike —
        plus fixed transitions. Not a goal; set your CSS and FTP in Settings to sharpen it.
      </p>

      {/* Threshold pace */}
      <SecLabel>Threshold pace</SecLabel>
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Eyebrow>Current</Eyebrow>
            <div className="font-display font-bold text-[26px] leading-none mt-[4px]">
              {d.thresholdMinKm != null ? <>{fmtPace(d.thresholdMinKm)}<span className="text-[13px] text-stone"> /km</span></> : '—'}
            </div>
            <div className="mt-[4px]"><DeltaChip deltaSec={d.thresholdDeltaSec} kind="pace" /></div>
          </div>
          <Sparkline series={d.thresholdTrend} color="var(--color-run)" invert />
        </div>
        <ThresholdSuggestion latest={d.thresholdCheck.latest} pending={d.thresholdCheck.pending} history={d.thresholdCheck.history} revertable={d.thresholdCheck.revertable} />
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

      {/* Aerobic efficiency (EF) — the durability scoreboard for a negative-split block */}
      <SecLabel>Aerobic efficiency</SecLabel>
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Eyebrow>EF · current</Eyebrow>
            <div className="font-display font-bold text-[26px] leading-none mt-[4px]">
              {d.ef.current != null ? <>{d.ef.current.toFixed(2)}<span className="text-[12px] text-stone"> m/min·bpm</span></> : '—'}
            </div>
          </div>
          {efDelta(d) != null && (
            <span className="text-[12px] font-bold" style={{ color: efDelta(d)! >= 0 ? 'var(--color-ready)' : 'var(--color-run)' }}>
              {efDelta(d)! >= 0 ? '▲' : '▼'} {efDelta(d)! >= 0 ? '+' : ''}{efDelta(d)!.toFixed(2)} since first LR
            </span>
          )}
        </div>
        <MetricTrendChart
          points={d.ef.series.map(s => ({ key: s.date, value: s.v }))}
          color="var(--color-run)"
          endLabel={d.ef.current != null ? d.ef.current.toFixed(2) : null}
          footerLeft={d.ef.series.length >= 2 ? shortDate(d.ef.series[0].date) : null}
          footerRight={d.ef.series.length >= 2 ? shortDate(d.ef.series[d.ef.series.length - 1].date) : null}
          ariaLabel="Aerobic efficiency trending up over the block's long runs"
          emptyHint="Your EF trend fills in as you log long runs with heart rate — one point so far."
        />
        <p className="text-[11.5px] text-stone mt-[8px]">Grade-adjusted metres/min per heartbeat — <b>higher = fitter</b>. Read the trend, not single runs (EF dips in heat or when under-slept). Unlike decoupling it isn’t distorted by a negative split, so it’s the durability signal to watch across the block.</p>
      </Card>

      {/* Aerobic decoupling trend — secondary to EF. Negative-split runs inflate it,
          so they're greyed and excluded from the trend line. */}
      <SecLabel>Aerobic decoupling</SecLabel>
      <Card>
        <DecouplingChart runs={d.longRuns} />
        <p className="text-[11.5px] text-stone mt-[8px]">Pa:HR drift on long runs — lower = more durable (&lt;5% strong). <b>Negative-split runs (grey) inflate it</b>, so they’re excluded from the trend; EF is the primary durability metric.</p>
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
                  {[['Date', 'l'], ['Dist', 'r'], ['NGP', 'r'], ['EF', 'r'], ['Decouple', 'r'], ['Final-⅓ decay', 'r'], ['Carbs/h', 'r'], ['RPE', 'r']].map(([h, a]) => (
                    <th key={h} className={`text-[10.5px] uppercase text-stone font-bold pb-[8px] border-b border-fog ${a === 'r' ? 'text-right' : 'text-left'}`} style={{ letterSpacing: '.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.longRuns.map(r => (
                  <tr key={r.id}>
                    <td className="py-[9px] border-b border-fog/60">{shortDate(r.date)}</td>
                    <td className="py-[9px] border-b border-fog/60 text-right">{Math.round(r.km)} km</td>
                    <td className="py-[9px] border-b border-fog/60 text-right">{fmtPace(r.ngpMinKm)}</td>
                    <td className="py-[9px] border-b border-fog/60 text-right font-semibold">{r.efficiencyFactor != null ? r.efficiencyFactor.toFixed(2) : '—'}</td>
                    {decoupleUnreliable(r.paceDecayPct)
                      ? <td className="py-[9px] border-b border-fog/60 text-right text-stone/60" title="Inflated by a negative split — read EF instead">{fmtPct(r.decouplingPct)}*</td>
                      : <td className={`py-[9px] border-b border-fog/60 text-right font-semibold ${driftColor(r.decouplingPct, 5, 8)}`}>{fmtPct(r.decouplingPct)}</td>}
                    <td className={`py-[9px] border-b border-fog/60 text-right font-semibold ${driftColor(r.paceDecayPct, 2, 4)}`}>{fmtPct(r.paceDecayPct)}</td>
                    <td className="py-[9px] border-b border-fog/60 text-right">
                      <FuelLogCell runId={r.id} movingSecs={r.movingSecs} initialCarbsPerH={r.fuelCarbsPerH} initialItems={r.fuelItems} products={d.fuelProducts} />
                    </td>
                    <td className="py-[9px] border-b border-fog/60 text-right">{r.perceivedEffort != null ? r.perceivedEffort : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11.5px] text-stone mt-[8px]">EF = grade-adj. m/min per bpm (higher = fitter). Decoupling = HR drift vs pace (lower = more durable; &lt;5% is strong) — <b>*</b> marks runs where a negative split inflates it, so read EF there. Final-⅓ decay = grade-adjusted slowdown over the last third.</p>
          </div>
        )}
      </Card>

      <p className="text-[11.5px] text-stone mt-[18px]">Execution scoring, RPE, and gear tracking arrive in later updates.</p>
    </>
  );
}

// Static copy for the experimental-model tiles — the name and the one-line
// theory, keyed by model. The numbers come from the loader.
const EXPERIMENTAL_META: Record<ExperimentalPredictionView['key'], { name: string; theory: string }> = {
  riegel: {
    name: 'Race scaling · Riegel',
    theory: 'Projects your most recent race to 42.2 km with a power law whose fatigue exponent is fitted to your own race history. Pure endurance scaling — no physiology.',
  },
  tanda: {
    name: 'Training log · Tanda',
    theory: 'Regression from your last 8 weeks of running — weekly volume and habitual pace (Tanda, 2011). Ignores races entirely: what does the work you’ve actually logged imply?',
  },
  cardiac: {
    name: 'Cardiac economy · EF',
    theory: 'Median grade-adjusted speed per heartbeat on long runs, projected to expected marathon heart rate. Reads your aerobic engine, not your pace performances.',
  },
};

// Trend-line colour per model — the same brand tokens the sport rows use, so the
// three tiles read as three distinct ideas.
const EXPERIMENTAL_COLOR: Record<ExperimentalPredictionView['key'], string> = {
  riegel: 'var(--color-run)',
  tanda: 'var(--color-ride)',
  cardiac: 'var(--color-yoga)',
};

function ExperimentalTile({ p }: { p: ExperimentalPredictionView }) {
  const meta = EXPERIMENTAL_META[p.key];
  return (
    <div className="border border-fog rounded-[16px] bg-paper flex flex-col" style={{ padding: '14px 16px' }}>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>{meta.name}</Eyebrow>
        <span className="text-[9.5px] uppercase font-bold text-stone border border-fog rounded-full shrink-0" style={{ letterSpacing: '.05em', padding: '2px 8px' }}>
          Experimental
        </span>
      </div>
      <div className="font-display font-bold text-[24px] leading-none my-[8px]">
        {p.predictedSeconds != null ? fmtHms(p.predictedSeconds) : '—'}
      </div>
      {p.detail && <div className="text-[11.5px] text-stone">{p.detail}</div>}
      {p.unavailableReason && <div className="text-[11.5px] text-stone">{p.unavailableReason}</div>}
      {/* lower time = faster, so invert makes an improving trend read as up */}
      <div className="mt-[10px]"><Sparkline series={p.trend} color={EXPERIMENTAL_COLOR[p.key]} invert /></div>
      <p className="text-[11px] text-stone/80 mt-auto pt-[10px]">{meta.theory}</p>
    </div>
  );
}

// Swim time as "m:ss" (750 m / 1900 m are minutes, not hours).
function fmtMinSec(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function SwimPredictionTile({ p }: { p: SwimPredictionView }) {
  return (
    <div className="border border-fog rounded-[16px] bg-paper flex flex-col" style={{ padding: '14px 16px' }}>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>{p.label}</Eyebrow>
        <span className="text-[9.5px] uppercase font-bold shrink-0" style={{ letterSpacing: '.05em', color: 'var(--color-swim)' }}>Swim</span>
      </div>
      <div className="font-display font-bold text-[24px] leading-none my-[8px]">
        {p.predictedSeconds != null ? fmtMinSec(p.predictedSeconds) : '—'}
      </div>
      {p.detail && <div className="text-[11.5px] text-stone">{p.detail}</div>}
      {p.unavailableReason && <div className="text-[11.5px] text-stone">{p.unavailableReason}</div>}
    </div>
  );
}

// Colour a tri leg by its discipline (transitions stay neutral stone).
function triLegColor(kind: string): string {
  return kind === 'swim' ? 'var(--color-swim)'
    : kind === 'bike' ? 'var(--color-ride)'
    : kind === 'run' ? 'var(--color-run)'
    : 'var(--color-stone)';
}

function Tri703Tile({ t }: { t: Tri703View }) {
  // The main legs (swim/bike/run) carry the headline breakdown; T1/T2 are folded
  // into the elapsed clock on the race page, so here we show just the three sports.
  const sportLegs = t.legs.filter(l => l.kind === 'swim' || l.kind === 'bike' || l.kind === 'run');
  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '16px 18px' }}>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <Eyebrow>{t.raceName}</Eyebrow>
          <div className="font-display font-bold text-[30px] leading-none mt-[5px]">
            {t.finishSeconds != null ? fmtHms(t.finishSeconds) : '—'}
          </div>
        </div>
        <a href={`/races/${t.slug}`} className="text-[11px] font-bold text-stone hover:text-ink border border-fog rounded-[16px] px-[10px] py-[4px] transition-colors shrink-0">Race guide →</a>
      </div>
      <div className="grid grid-cols-3 gap-[10px] mt-[14px]">
        {sportLegs.map(l => (
          <div key={l.kind} className="border-t-2 pt-[7px]" style={{ borderColor: triLegColor(l.kind) }}>
            <div className="font-mono text-[9.5px] uppercase tracking-[.06em] text-stone">{l.name}</div>
            <div className="font-display font-bold text-[17px] leading-none mt-[3px]">
              {l.estSeconds != null ? fmtHms(l.estSeconds) : '—'}
            </div>
          </div>
        ))}
      </div>
      {t.missing.length > 0 && (
        <div className="text-[11.5px] text-oxblood mt-[12px]">Set your {t.missing.join(' + ')} in Settings for a full estimate.</div>
      )}
    </div>
  );
}

// Delta-since-first-week chip. Both threshold pace and predicted time are
// "lower is better", so a negative delta is an improvement (green ▼).
function DeltaChip({ deltaSec, kind }: { deltaSec: number | null; kind: 'pace' | 'time' }) {
  if (deltaSec == null || deltaSec === 0) return null;
  const better = deltaSec < 0;
  const mag = Math.abs(deltaSec);
  const label = kind === 'pace' ? `${mag}s/km` : fmtGap(mag);
  return (
    <span className="text-[11.5px] font-bold" style={{ color: better ? 'var(--color-ready)' : 'var(--color-stone)' }}>
      {better ? '▼' : '▲'} {label} since W1
    </span>
  );
}

// Aerobic-decoupling dots over the block, oldest→newest, with a 5% guide and a
// trend line fit through the "clean" (non-negative-split) runs only.
function DecouplingChart({ runs }: { runs: BenchmarksData['longRuns'] }) {
  const pts = [...runs].reverse().filter(r => r.decouplingPct != null)
    .map(r => ({ date: r.date, v: r.decouplingPct as number, noisy: r.paceDecayPct != null && r.paceDecayPct < -5 }));
  if (pts.length < 2) {
    return <div className="text-[12px] text-stone">Decoupling dots fill in as long runs with heart rate sync — {pts.length} so far.</div>;
  }
  const W = 640, H = 150, padL = 30, padR = 14, padT = 12, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const vs = pts.map(p => p.v);
  const hi = Math.max(8, ...vs), lo = Math.min(0, ...vs);
  const x = (i: number) => padL + (i / (pts.length - 1)) * plotW;
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * plotH;   // higher % lower on screen

  // Trend line through clean points (least-squares on index).
  const clean = pts.map((p, i) => ({ i, v: p.v, noisy: p.noisy })).filter(p => !p.noisy);
  let trend: string | null = null;
  if (clean.length >= 2) {
    const n = clean.length, sx = clean.reduce((a, p) => a + p.i, 0), sy = clean.reduce((a, p) => a + p.v, 0);
    const sxx = clean.reduce((a, p) => a + p.i * p.i, 0), sxy = clean.reduce((a, p) => a + p.i * p.v, 0);
    const denom = n * sxx - sx * sx;
    if (denom !== 0) {
      const m = (n * sxy - sx * sy) / denom, b = (sy - m * sx) / n;
      const x0 = clean[0].i, x1 = clean[clean.length - 1].i;
      trend = `${x(x0)},${y(m * x0 + b)} ${x(x1)},${y(m * x1 + b)}`;
    }
  }
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} className="max-w-full" role="img" aria-label="Aerobic decoupling on long runs over the block">
        {/* 5% guide */}
        <line x1={padL} y1={y(5)} x2={W - padR} y2={y(5)} stroke="var(--color-ready)" strokeWidth="1" strokeDasharray="3 4" />
        <text x={padL} y={y(5) - 4} fill="var(--color-ready)" fontSize="9" fontWeight="700">5%</text>
        {trend && <polyline points={trend} fill="none" stroke="var(--color-stone)" strokeWidth="1.4" strokeDasharray="2 3" opacity="0.6" />}
        {pts.map((p, i) => p.noisy
          ? <circle key={i} cx={x(i)} cy={y(p.v)} r="4" fill="none" stroke="var(--color-stone)" strokeWidth="1.5" opacity="0.5" />
          : <circle key={i} cx={x(i)} cy={y(p.v)} r="4.5" className={driftColor(p.v, 5, 8)} fill="currentColor" />)}
        <text x={padL} y={H - 6} fill="var(--color-stone)" fontSize="9">{shortDate(pts[0].date)}</text>
        <text x={W - padR} y={H - 6} fill="var(--color-stone)" fontSize="9" textAnchor="end">{shortDate(pts[pts.length - 1].date)}</text>
      </svg>
    </div>
  );
}

// EF change since the block's first long run (current − first). Positive = fitter.
function efDelta(d: BenchmarksData): number | null {
  if (d.ef.current == null || d.ef.first == null) return null;
  const delta = d.ef.current - d.ef.first;
  return Math.round(delta * 100) / 100;
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
