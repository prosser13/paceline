// TEMPORARY comparison surface for the wellness-tile mockups. Renders every
// variant with live `wellness_days` data so we can pick layouts, then this page
// and the unused variants get removed. Not linked from the nav.
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase-server';
import { loadWellnessDays } from '../_dashboard/data';
import { bodySignals, sleepSummary, standouts, recoveryAdjustment } from '@/lib/wellness-stats';
import { readinessFrom } from '@/lib/readiness';
import { BodySignalsTile } from '../_dashboard/wellness/BodySignalsTile';
import { SleepTile } from '../_dashboard/wellness/SleepTile';
import { StandoutsTile } from '../_dashboard/wellness/StandoutsTile';
import { ReadinessVariant } from '../_dashboard/wellness/ReadinessVariants';

export const dynamic = 'force-dynamic';

const bandFor = (s: number): string => (s >= 80 ? 'Primed' : s >= 60 ? 'Steady' : s >= 40 ? 'Workable' : 'Tired');

function Variant({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ width: 360, maxWidth: '100%' }} className="flex flex-col gap-[10px]">
      <div className="text-[12px] text-stone"><span className="font-bold text-ink">{label}</span></div>
      {children}
    </div>
  );
}

function Section({ n, title, purpose, children }: { n: string; title: string; purpose: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 44 }}>
      <div className="flex items-baseline gap-[12px]">
        <span className="font-display text-[15px] text-stone">{n}</span>
        <h2 className="font-display font-bold text-[23px] m-0">{title}</h2>
      </div>
      <p className="text-[14px] text-stone" style={{ margin: '4px 0 18px', maxWidth: '74ch' }}>{purpose}</p>
      <div className="flex flex-wrap" style={{ gap: 22 }}>{children}</div>
    </section>
  );
}

export default async function WellnessPreviewPage() {
  if (!await getCurrentUser()) redirect('/auth/login');
  const { latest, recent } = await loadWellnessDays();

  if (!recent.length) {
    return (
      <div className="mx-auto max-w-[1100px]" style={{ padding: '28px 26px' }}>
        <h1 className="font-display font-bold text-[28px]">Wellness tiles — preview</h1>
        <p className="text-stone text-[15px] mt-[8px]">No wellness data yet. The 4-hourly sync will populate <code>wellness_days</code>.</p>
      </div>
    );
  }

  const bs = bodySignals(recent);
  const sleep = sleepSummary(recent);
  const stand = standouts(recent);
  const rec = recoveryAdjustment(recent);

  const ctl = latest?.ctl != null ? Math.round(latest.ctl) : null;
  const atl = latest?.atl != null ? Math.round(latest.atl) : null;
  const form = ctl != null && atl != null ? ctl - atl : null;
  const base = readinessFrom(form, ctl, atl);
  const baseScore = base?.score ?? null;
  const adjScore = baseScore != null ? Math.max(0, Math.min(100, baseScore + rec.delta)) : null;

  return (
    <div className="mx-auto max-w-[1160px]" style={{ padding: '28px 26px 72px' }}>
      <div className="text-[12px] uppercase tracking-[.16em] text-stone font-bold">Paceline · preview</div>
      <h1 className="font-display font-bold text-[32px] m-0" style={{ marginTop: 6 }}>Wellness tiles — pick a layout</h1>
      <p className="text-[15px] text-stone" style={{ margin: '8px 0 0', maxWidth: '66ch' }}>
        Live data from your latest sync{latest?.date ? ` (${latest.date})` : ''}. Body Signals is set to variant A; pick one each
        for Sleep, Standouts and Readiness and I&apos;ll finalise. Temporary page — not in the nav.
      </p>

      <Section n="01" title="Body Signals" purpose="Resting HR & HRV vs your rolling baseline — the illness / overreach flag.">
        <Variant label="Variant A · final"><BodySignalsTile s={bs} /></Variant>
      </Section>

      <Section n="02" title="Sleep" purpose="Last night, the week's trend, and a nudge against your 8h target.">
        <Variant label="A · ring + week bars"><SleepTile s={sleep} variant="A" /></Variant>
        <Variant label="B · hours-forward"><SleepTile s={sleep} variant="B" /></Variant>
        <Variant label="C · weekly balance"><SleepTile s={sleep} variant="C" /></Variant>
      </Section>

      <Section n="03" title="Standouts" purpose="Notable recent numbers, positive-leaning. Quiet when nothing stands out.">
        <Variant label="A · ranked list"><StandoutsTile items={stand} variant="A" /></Variant>
        <Variant label="B · hero + chips"><StandoutsTile items={stand} variant="B" /></Variant>
        <Variant label="C · chip grid"><StandoutsTile items={stand} variant="C" /></Variant>
      </Section>

      {baseScore != null && adjScore != null && (
        <Section n="04" title="Smarter Readiness" purpose="Your Readiness tile with last night's sleep + HRV folded in (currently load-only).">
          <Variant label="A · adjusted + why">
            <ReadinessVariant variant="A" baseScore={baseScore} baseBand={base!.band} adjScore={adjScore} adjBand={bandFor(adjScore)} recovery={rec} />
          </Variant>
          <Variant label="B · contribution bar">
            <ReadinessVariant variant="B" baseScore={baseScore} baseBand={base!.band} adjScore={adjScore} adjBand={bandFor(adjScore)} recovery={rec} />
          </Variant>
          <Variant label="C · before → after">
            <ReadinessVariant variant="C" baseScore={baseScore} baseBand={base!.band} adjScore={adjScore} adjBand={bandFor(adjScore)} recovery={rec} />
          </Variant>
        </Section>
      )}
    </div>
  );
}
