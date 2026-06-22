// Self-contained prototype data + presentational pieces for the plan-page
// redesign exploration. No Supabase / auth — pure mock data so the three idea
// routes render on a bare dev server. Not linked from the app nav.

import { RunGlyph, BikeGlyph, Dumbbell } from '@/components/glyphs';

export const OXBLOOD = '#8c2b2b';
export const MARINE  = '#14617e';
export const FERN    = '#4f7a52';
export const AMBER   = '#dfa01c';
export const EMBER   = '#c75b33';
export const STONE   = '#8a857a';

export const PHASE_HEX: Record<string, string> = {
  Base: MARINE, Build: AMBER, Peak: EMBER, Taper: FERN,
};

export type ActKind = 'run' | 'ride' | 'strength';
export interface Activity {
  kind: ActKind;
  name: string;
  detail: string;     // sub-line
  zone?: string;      // 'Z2'..
  metric: string;     // right-aligned headline (pace/power/duration)
  sub?: string;       // small line under metric
  done?: boolean;
}
export interface Day {
  iso: string;
  weekday: string;    // 'Mon'
  date: string;       // '6 Jul'
  isToday: boolean;
  isPast: boolean;
  activities: Activity[]; // empty => rest
}
export interface Week {
  weekNumber: number;
  phase: string;
  range: string;      // '6 – 12 Jul'
  volume: string;     // '64 km'
  tss: number;
  state: 'past' | 'current' | 'future';
  days: Day[];
}

const TODAY = '2026-07-08';

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function fmt(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Weekly activity template (1=Mon..7=Sun) — varied enough to read like a real week.
function template(weekday: number, phase: string): Activity[] {
  switch (weekday) {
    case 1: return [
      { kind: 'strength', name: 'Strength', detail: 'Lower body · 5 exercises', metric: '0:45' },
      { kind: 'run', name: 'Easy Run', detail: 'Aerobic shakeout', zone: 'Z2', metric: '4:45/km', sub: '8 km' },
    ];
    case 2: return [
      { kind: 'ride', name: 'Endurance Ride', detail: 'Zone 2 aerobic ride', zone: 'Z2', metric: '149–202 W', sub: '60:00' },
    ];
    case 3: return [
      { kind: 'run', name: phase === 'Peak' ? 'VO₂ Intervals' : 'Threshold Run', detail: phase === 'Peak' ? '5 × 3 min hard' : '4 × 8 min @ LT', zone: phase === 'Peak' ? 'Z5' : 'Z4', metric: '3:38/km', sub: '12 km' },
    ];
    case 4: return [
      { kind: 'ride', name: 'Endurance Ride', detail: 'Zone 2 aerobic ride', zone: 'Z2', metric: '149–202 W', sub: '75:00' },
      { kind: 'strength', name: 'Strength', detail: 'Core + mobility', metric: '0:30' },
    ];
    case 5: return [];
    case 6: return [
      { kind: 'run', name: 'Long Run', detail: 'Steady aerobic', zone: 'Z2', metric: '4:55/km', sub: `${phase === 'Peak' ? 30 : 24} km` },
    ];
    case 7: return phase === 'Peak'
      ? [{ kind: 'run', name: 'Recovery Run', detail: 'Flush the legs', zone: 'Z1', metric: '5:20/km', sub: '6 km' }]
      : [];
  }
  return [];
}

function buildWeek(weekNumber: number, phase: string, monday: Date, volume: string, tss: number): Week {
  const days: Day[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const isoStr = iso(d);
    const acts = template(i + 1, phase).map(a => ({ ...a, done: isoStr < TODAY }));
    days.push({
      iso: isoStr,
      weekday: WD[i],
      date: fmt(d),
      isToday: isoStr === TODAY,
      isPast: isoStr < TODAY,
      activities: acts,
    });
  }
  const anyPast = days.some(d => d.isPast);
  const anyFuture = days.some(d => !d.isPast && !d.isToday);
  const hasToday = days.some(d => d.isToday);
  const state: Week['state'] = hasToday ? 'current' : (anyPast && !anyFuture ? 'past' : 'future');
  return { weekNumber, phase, range: `${days[0].date} – ${days[6].date}`, volume, tss, state, days };
}

export const WEEKS: Week[] = [
  buildWeek(4, 'Base',  new Date(Date.UTC(2026, 5, 22)), '58 km', 320),
  buildWeek(5, 'Base',  new Date(Date.UTC(2026, 5, 29)), '62 km', 345),
  buildWeek(6, 'Build', new Date(Date.UTC(2026, 6, 6)),  '68 km', 410),
  buildWeek(7, 'Build', new Date(Date.UTC(2026, 6, 13)), '72 km', 430),
  buildWeek(8, 'Peak',  new Date(Date.UTC(2026, 6, 20)), '76 km', 465),
];

// ── Presentational pieces ────────────────────────────────────

function Glyph({ kind }: { kind: ActKind }) {
  if (kind === 'ride') return <BikeGlyph size={16} />;
  if (kind === 'strength') return <Dumbbell size={16} />;
  return <RunGlyph size={16} />;
}

const KIND_COLOR: Record<ActKind, string> = { run: MARINE, ride: MARINE, strength: '#8f6512' };

export function ZonePill({ zone }: { zone: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    Z1: { bg: 'rgba(138,133,122,.12)', fg: '#5f5a55' },
    Z2: { bg: 'rgba(20,97,126,.12)',   fg: MARINE },
    Z4: { bg: 'rgba(199,91,51,.14)',   fg: '#8f3512' },
    Z5: { bg: 'rgba(140,43,43,.16)',   fg: OXBLOOD },
  };
  const s = map[zone] ?? map.Z2;
  return <span className="font-mono text-[11px] px-[5px] py-[1px] rounded-[3px]" style={{ background: s.bg, color: s.fg }}>{zone}</span>;
}

export function ActivityRow({ a }: { a: Activity }) {
  return (
    <div className="flex items-center gap-[12px] px-[14px] py-[10px]" style={{ borderLeft: `3px solid ${KIND_COLOR[a.kind]}` }}>
      <span style={{ color: KIND_COLOR[a.kind] }}><Glyph kind={a.kind} /></span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[7px] leading-tight">
          {a.done && <span className="text-fern text-[14px] leading-none">✓</span>}
          <span className="text-[15.5px] font-semibold text-ink truncate">{a.name}</span>
        </div>
        <div className="text-[13px] text-stone leading-tight mt-[2px] truncate">{a.detail}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-display font-semibold text-[16px] leading-none text-ink">{a.metric}</div>
        {a.sub && <div className="font-mono text-[12px] text-stone mt-[3px]">{a.sub}</div>}
      </div>
    </div>
  );
}

export function RestRow() {
  return (
    <div className="flex items-center gap-[10px] px-[14px] py-[11px] text-stone"
      style={{ borderLeft: '3px solid transparent', outline: '1px dashed #c9c2b2', outlineOffset: '-1px' }}>
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7v11M3 12h13a4 4 0 0 1 4 4v2M3 18h18M8 7h8a2 2 0 0 1 2 2v3" />
      </svg>
      <span className="font-mono text-[12px] tracking-[.08em] uppercase">Rest day</span>
    </div>
  );
}

// A single day in the thread: date gutter + its activity card(s).
export function DayBlock({ day, dim }: { day: Day; dim?: boolean }) {
  return (
    <div className={`flex gap-[14px] ${dim ? 'opacity-55' : ''}`}>
      <div className="w-[52px] shrink-0 pt-[8px] text-right">
        <div className={`font-display font-semibold text-[15px] leading-none ${day.isToday ? 'text-oxblood' : 'text-ink'}`}>{day.weekday}</div>
        <div className="font-mono text-[12px] text-stone mt-[3px]">{day.date}</div>
      </div>
      <div className={`flex-1 min-w-0 rounded-[12px] border bg-paper overflow-hidden ${day.isToday ? 'border-oxblood' : 'border-fog'}`}>
        {day.isToday && (
          <div className="px-[14px] py-[4px] bg-oxblood text-bone font-mono text-[10px] tracking-[.14em] uppercase">Today</div>
        )}
        {day.activities.length === 0
          ? <RestRow />
          : <div className="divide-y divide-fog/50">{day.activities.map((a, i) => <ActivityRow key={i} a={a} />)}</div>}
      </div>
    </div>
  );
}

// Highlighted week band — phase colour, week meta. `emphasis` for the current week.
export function WeekBand({ week, emphasis }: { week: Week; emphasis?: boolean }) {
  const hex = PHASE_HEX[week.phase] ?? STONE;
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] px-[14px] py-[9px]"
      style={{ background: emphasis ? hex : `${hex}14`, color: emphasis ? '#f4efe4' : undefined, border: `1px solid ${hex}${emphasis ? '' : '40'}` }}>
      <div className="flex items-center gap-[10px] min-w-0 flex-wrap">
        <span className="font-display font-semibold text-[14.5px]" style={{ color: emphasis ? '#f4efe4' : '#17191e' }}>
          Week {week.weekNumber} · {week.phase}
        </span>
        <span className="font-mono text-[12.5px]" style={{ color: emphasis ? 'rgba(244,239,228,.8)' : STONE }}>{week.range}</span>
        {week.state === 'current' && (
          <span className="font-mono text-[10px] tracking-[.12em] uppercase rounded-[4px] px-[5px] py-[1px]"
            style={{ background: emphasis ? 'rgba(244,239,228,.2)' : `${hex}26`, color: emphasis ? '#f4efe4' : hex }}>Now</span>
        )}
      </div>
      <div className="shrink-0 text-right font-mono text-[12.5px]" style={{ color: emphasis ? 'rgba(244,239,228,.85)' : STONE }}>
        {week.volume} · {week.tss} TSS
      </div>
    </div>
  );
}

// Faux app chrome so prototypes read like the real app, without auth/Supabase.
export function LabShell({ idea, children }: { idea: number; children: React.ReactNode }) {
  const ideas = [
    { n: 1, label: 'Inline week bands' },
    { n: 2, label: 'Sticky week rail' },
    { n: 3, label: 'Collapsible weeks' },
  ];
  return (
    <div className="flex h-full overflow-hidden bg-bone">
      <aside className="w-[190px] bg-paper border-r border-fog flex flex-col gap-1 p-[18px_14px] shrink-0 h-full">
        <div className="font-display font-semibold text-[18px] px-2 pb-3 text-ink">paceline</div>
        <div className="font-mono text-[10px] tracking-[.14em] uppercase text-stone px-2 pb-1">Plan · lab</div>
        {ideas.map(i => (
          <a key={i.n} href={`/plan-lab/${i.n}`}
            className={`text-[14px] px-3 py-[8px] rounded-[9px] ${i.n === idea ? 'bg-oxblood text-bone' : 'text-ink hover:bg-fog/50'}`}>
            {i.n}. {i.label}
          </a>
        ))}
      </aside>
      <main className="flex-1 overflow-y-auto"><div className="px-[26px] py-[22px] max-w-[820px]">{children}</div></main>
    </div>
  );
}

// Shared phase-bar timeline + race countdown header (top of every idea).
export function PlanHeader() {
  return (
    <div className="mb-6">
      <div className="rounded-[16px] overflow-hidden border border-fog mb-5">
        <div className="bg-oxblood px-[22px] py-[16px] flex items-start justify-between">
          <div>
            <span className="font-mono text-[11px] tracking-[.16em] uppercase text-bone/50">A-Race</span>
            <h2 className="font-display font-semibold text-[26px] text-bone leading-tight mt-[2px]">Dragon 50 Ultra</h2>
            <p className="font-mono text-[13px] text-bone/60 mt-[4px]">Sunday, 19 July 2026</p>
          </div>
          <div className="text-right">
            <div className="font-display font-semibold text-[40px] leading-none text-bone">11</div>
            <div className="font-mono text-[11px] tracking-[.1em] uppercase text-bone/50">days to go</div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-x-[14px] gap-y-[6px] flex-wrap mb-[10px]">
        {[['Base', MARINE], ['Build', AMBER], ['Peak', EMBER]].map(([p, c]) => (
          <span key={p} className="flex items-center gap-[5px]">
            <i className="inline-block w-[8px] h-[8px] rounded-[2px]" style={{ background: c as string }} />
            <span className="font-mono text-[11.5px] tracking-[.1em] uppercase" style={{ color: c as string }}>{p}</span>
          </span>
        ))}
        <span className="font-mono text-[11.5px] text-stone ml-auto">22 Jun – 26 Jul</span>
      </div>
      <div className="relative h-[6px] rounded-full bg-fog overflow-hidden">
        <div className="absolute inset-0 flex">
          <div style={{ width: '40%', background: MARINE, opacity: .8 }} />
          <div style={{ width: '40%', background: AMBER, opacity: .8 }} />
          <div style={{ width: '20%', background: EMBER, opacity: .8 }} />
        </div>
        <div className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-oxblood rounded-full" style={{ left: '52%' }} />
      </div>
    </div>
  );
}
