import type { FuelRehearsal } from '@/data/fuel-plan';

const BUILD = '#b07d12';

function fmtDay(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Gut-training rehearsal progress + the next fuelled long run. Mirrors the race
// guide's fuel-readiness strip, but framed around the block's progression reps so
// the athlete sees where they are and what's next without opening the race page.
export default function FuelRehearsalCard({ r }: { r: FuelRehearsal }) {
  const target = r.targetGph;
  if (target == null || r.repsTotal === 0) return null;
  const ready = r.bestGph != null && r.bestGph >= target;
  const pct = r.repsTotal > 0 ? Math.min(100, Math.round((r.repsCompleted / r.repsTotal) * 100)) : 0;
  const barColor = ready ? 'var(--color-fern)' : 'var(--color-strength)';

  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '16px 18px' }}>
      <div className="flex items-center justify-between">
        <span className="font-display font-bold text-[16px]">Fuel rehearsal</span>
        <span className="text-[12px] font-bold" style={{ color: BUILD }}>gut training → {target} g/h</span>
      </div>

      <div className="text-[13px] text-ink mt-[8px]">
        <b className="font-display text-[15px]">{r.repsCompleted}</b> of {r.repsTotal} long-run reps done
        {r.bestGph != null && <span className="text-stone"> · best {r.bestGph} g/h</span>}
        {r.repsCompleted > 0 && <span className="text-stone"> · {r.repsOnPlan} on target</span>}
      </div>
      <div className="relative h-[8px] rounded-full bg-fog mt-[8px]">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: barColor }} />
      </div>

      <div className="text-[12px] mt-[9px] leading-snug">
        {r.nextAttempt ? (
          <span className="text-stone">
            <span className="font-bold" style={{ color: BUILD }}>Next:</span>{' '}
            <b className="text-ink">{r.nextAttempt.gph ?? target} g/h</b> on {fmtDay(r.nextAttempt.date)}
            {r.nextAttempt.repIndex != null && r.nextAttempt.repTotal != null && (
              <span> · rep {r.nextAttempt.repIndex} of {r.nextAttempt.repTotal}</span>
            )}
          </span>
        ) : ready ? (
          <span><span className="font-bold" style={{ color: 'var(--color-fern)' }}>Ready.</span> <span className="text-stone">Gut is trained for the {target} g/h plan.</span></span>
        ) : (
          <span className="text-stone">All rehearsal long runs are behind you — hold {r.bestGph ?? target} g/h into race week.</span>
        )}
      </div>
    </div>
  );
}
