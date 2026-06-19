// Temporary design preview — Plan page redesign concepts. Public, viewable at
// /design/plan-layout. Safe to delete.

const PHASE: Record<string, string> = {
  Base: '#14617e', Build: '#dfa01c', Peak: '#c75b33', Taper: '#4f7a52',
};
const RACE: Record<string, { color: string; label: string }> = {
  A: { color: '#8c2b2b', label: 'A' },
  B: { color: '#b5790f', label: 'B' },
  C: { color: '#14617e', label: 'C' },
};

function RaceBadge({ p }: { p: 'A' | 'B' | 'C' }) {
  return (
    <span className="font-mono text-[11px] font-bold text-bone rounded-[4px] px-[6px] py-[2px]"
          style={{ background: RACE[p].color }}>
      {RACE[p].label}
    </span>
  );
}

// Solid phase-coloured week header bar
function WeekBar({ phase, week, dates, race, current, dim }: {
  phase: string; week: number; dates: string; race?: 'A' | 'B' | 'C'; current?: boolean; dim?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-[16px] py-[10px] rounded-t-[10px]"
         style={{ background: dim ? '#e7e1d4' : PHASE[phase], color: dim ? '#5f5a50' : '#f4efe4' }}>
      <div className="flex items-center gap-[10px]">
        <span className="font-display font-semibold text-[15px] uppercase tracking-[.04em]">Week {week} · {phase}</span>
        <span className="font-mono text-[12px]" style={{ opacity: 0.8 }}>{dates}</span>
        {current && <span className="font-mono text-[10px] uppercase tracking-[.1em] bg-bone/25 rounded-[4px] px-[5px] py-[1px]">This week</span>}
      </div>
      {race && <RaceBadge p={race} />}
    </div>
  );
}

function Row({ day, date, name, sub, race }: { day: string; date: string; name: string; sub?: string; race?: 'A' | 'B' | 'C' }) {
  return (
    <div className="flex items-center gap-[12px] px-[16px] py-[9px] border-t border-fog bg-paper">
      <div className="w-[42px] shrink-0">
        <div className="font-display font-semibold text-[14px] leading-none text-ink">{day}</div>
        <div className="font-mono text-[11px] text-stone mt-[3px]">{date}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[7px]">
          {race && <RaceBadge p={race} />}
          <span className="text-[14px] font-semibold text-ink">{name}</span>
        </div>
        {sub && <div className="text-[12px] text-stone">{sub}</div>}
      </div>
    </div>
  );
}

function CollapsedWeek({ phase, week, dates, race, dim }: {
  phase: string; week: number; dates: string; race?: 'A' | 'B' | 'C'; dim?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-[16px] py-[11px] border border-fog rounded-[10px] bg-paper">
      <div className="flex items-center gap-[10px]">
        <span className="w-[8px] h-[8px] rounded-full" style={{ background: dim ? '#c9c2b2' : PHASE[phase] }} />
        <span className="font-display font-semibold text-[14px]" style={{ color: dim ? '#9a9488' : '#17191e' }}>Week {week} · {phase}</span>
        <span className="font-mono text-[12px] text-stone">{dates}</span>
      </div>
      <div className="flex items-center gap-[8px]">
        {race && <RaceBadge p={race} />}
        <span className="font-mono text-[16px] text-stone/40">▾</span>
      </div>
    </div>
  );
}

function PlanTabs() {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="bg-oxblood text-bone text-[13px] font-medium rounded-[8px] px-[14px] py-[7px]">Dragon 50 block</span>
      <span className="border border-fog text-stone text-[13px] rounded-[8px] px-[14px] py-[7px]">+ New plan</span>
    </div>
  );
}

export default function PlanLayoutConcepts() {
  return (
    <div className="min-h-screen bg-bone px-[26px] py-[30px]">
      <div className="max-w-[860px] mx-auto">
        <h1 className="font-display font-semibold text-[24px] mb-1">Plan page — redesign concepts</h1>
        <p className="text-stone text-[14px] mb-9">Clearer week headers · land on this week · races stand out · multiple plans.</p>

        <div className="flex flex-col gap-12">

          {/* IDEA A */}
          <div>
            <div className="font-mono text-[11px] tracking-[.12em] uppercase text-oxblood mb-1">Idea A · Anchored current week</div>
            <p className="text-[13px] text-stone mb-3">Past weeks collapse to a summary; this week is expanded at the top; future weeks are collapsed bars. Solid phase-coloured headers separate weeks from sessions.</p>
            <PlanTabs />
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-[16px] py-[10px] border border-fog rounded-[10px] bg-[#efe9dc]">
                <span className="font-mono text-[12px] uppercase tracking-[.1em] text-stone">Weeks 1–2 · done</span>
                <span className="font-mono text-[16px] text-stone/40">▾</span>
              </div>
              <div className="rounded-[10px] border border-fog overflow-hidden">
                <WeekBar phase="Base" week={3} dates="15–21 Jun" current />
                <Row day="Fri" date="19 Jun" name="Easy short run with strides" sub="5 km · 4×100m strides" />
                <Row day="Sun" date="21 Jun" name="Easy long run" sub="20 km Z2" />
              </div>
              <CollapsedWeek phase="Build" week={4} dates="22–28 Jun" />
              <CollapsedWeek phase="Build" week={5} dates="29 Jun–5 Jul" race="C" />
              <CollapsedWeek phase="Peak" week={7} dates="13–19 Jul" race="A" />
            </div>
          </div>

          {/* IDEA B */}
          <div>
            <div className="font-mono text-[11px] tracking-[.12em] uppercase text-oxblood mb-1">Idea B · Races rail on top</div>
            <p className="text-[13px] text-stone mb-3">A dedicated races strip shows every A/B/C race with a countdown. Below, only this week + future weeks show by default (earlier weeks behind a toggle).</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { p: 'C', name: 'LC 3k', when: 'done', date: '10 Jun' },
                { p: 'B', name: 'Porthcawl 10km', when: 'in 16 days', date: '5 Jul' },
                { p: 'A', name: 'Dragon 50 Ultra', when: 'in 30 days', date: '19 Jul' },
              ].map(r => (
                <div key={r.name} className="border rounded-[10px] bg-paper p-[12px]" style={{ borderColor: `${RACE[r.p as 'A'|'B'|'C'].color}55` }}>
                  <div className="flex items-center gap-[7px] mb-[6px]">
                    <RaceBadge p={r.p as 'A' | 'B' | 'C'} />
                    <span className="font-mono text-[11px] text-stone">{r.date}</span>
                  </div>
                  <div className="font-display font-semibold text-[15px] leading-tight">{r.name}</div>
                  <div className="font-mono text-[12px] mt-[3px]" style={{ color: RACE[r.p as 'A'|'B'|'C'].color }}>{r.when}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <div className="px-[16px] py-[9px] text-center font-mono text-[12px] text-marine border border-fog rounded-[10px] bg-paper">‹ show 2 earlier weeks</div>
              <div className="rounded-[10px] border border-fog overflow-hidden">
                <WeekBar phase="Base" week={3} dates="15–21 Jun" current />
                <Row day="Sun" date="21 Jun" name="Easy long run" sub="20 km Z2" />
              </div>
              <CollapsedWeek phase="Build" week={5} dates="29 Jun–5 Jul" race="C" />
            </div>
          </div>

          {/* IDEA C */}
          <div>
            <div className="font-mono text-[11px] tracking-[.12em] uppercase text-oxblood mb-1">Idea C · Timeline navigator</div>
            <p className="text-[13px] text-stone mb-3">A left rail lists every week (current highlighted, races as dots) so you jump straight to any week — no scrolling. The pane shows the chosen week.</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: '190px 1fr' }}>
              <div className="border border-fog rounded-[10px] bg-paper p-[8px] flex flex-col gap-[2px]">
                {[
                  { w: 1, ph: 'Base', done: true }, { w: 2, ph: 'Base', done: true, race: 'C' },
                  { w: 3, ph: 'Base', cur: true }, { w: 4, ph: 'Build' },
                  { w: 5, ph: 'Build', race: 'C' }, { w: 6, ph: 'Build' },
                  { w: 7, ph: 'Peak', race: 'A' },
                ].map(r => (
                  <div key={r.w} className="flex items-center gap-[8px] px-[8px] py-[6px] rounded-[6px]"
                       style={{ background: r.cur ? 'rgba(20,97,126,.10)' : 'transparent' }}>
                    <span className="w-[7px] h-[7px] rounded-full" style={{ background: r.done ? '#c9c2b2' : PHASE[r.ph] }} />
                    <span className="font-mono text-[12.5px] flex-1" style={{ color: r.done ? '#9a9488' : '#17191e', fontWeight: r.cur ? 600 : 400 }}>W{r.w} · {r.ph}</span>
                    {r.race && <RaceBadge p={r.race as 'A' | 'B' | 'C'} />}
                    {r.done && <span className="font-mono text-[11px] text-fern">✓</span>}
                  </div>
                ))}
              </div>
              <div className="rounded-[10px] border border-fog overflow-hidden self-start">
                <WeekBar phase="Base" week={3} dates="15–21 Jun" current />
                <Row day="Fri" date="19 Jun" name="Easy short run with strides" sub="5 km · 4×100m strides" />
                <Row day="Sun" date="21 Jun" name="Easy long run" sub="20 km Z2" />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
