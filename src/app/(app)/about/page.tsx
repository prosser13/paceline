// About paceline — a static overview of what the app does, with feature sections
// colour-coded to match the sidebar. Linked as the bottom nav item (desktop + mobile).

export const metadata = { title: 'About · paceline' };

interface FeatureSection {
  cat: string;
  color: string;
  items: string[];
}

// Colours mirror the sidebar dots for each section.
const SECTIONS: FeatureSection[] = [
  {
    cat: 'Dashboard', color: 'var(--color-stone)',
    items: [
      'Today’s planned session — its structure, targets and a heat-adjusted pace from your local forecast',
      'Log the extras a watch doesn’t capture: perceived effort, fuel taken, and pre/post-run weigh-ins',
      'At-a-glance wellness — resting HR, sleep and HRV synced from Garmin',
      'Training load (acute:chronic) and a predicted A-race finish',
      'Morning briefing and evening review from your AI coach',
    ],
  },
  {
    cat: 'Plan', color: 'var(--color-ride)',
    items: [
      'Block-by-block overviews of each phase building toward an event',
      'Plan authored via MCP (Claude) at the start of a block',
      'Claude reviews the plan daily and adjusts it where necessary',
      'Automatic pace threshold and zone calculations',
      'Threshold and FTP suggestions drawn from your recent workouts',
      'Structured workouts built and pushed to your Garmin',
    ],
  },
  {
    cat: 'Races', color: 'var(--color-race)',
    items: [
      'A curated guide for every race on your calendar',
      'Course map and elevation profile from the GPX',
      'Goal tiers, checkpoint-by-checkpoint pacing, and a predicted finish',
      'Live race-day weather with heat guidance',
      'Nutrition & hydration plan — fuel, personalised fluid & sodium, and a kit checklist',
      'Post-race analysis, per-km splits and results',
    ],
  },
  {
    cat: 'Strength', color: 'var(--color-strength)',
    items: [
      'Flexible strength / yoga session builder',
      'Progressive engine that tracks your lifts and adds load as you get stronger',
      'Progression modes — hybrid, progressive or maintenance',
      'Adapts around niggles and injuries',
    ],
  },
  {
    cat: 'Benchmarks', color: 'var(--color-hard)',
    items: [
      'Predicts A-race times from several algorithmic models (Daniels VDOT, Riegel, Tanda, cardiac drift)',
      'Threshold pace, VDOT and resting-HR trends across the block',
      'Long-run quality — efficiency factor and aerobic decoupling',
      'Swim and 70.3 finish predictors',
      'A fuelling (carbs/hour) and sweat-rate / fluid-loss model',
    ],
  },
  {
    cat: 'Availability', color: 'var(--color-marine)',
    items: [
      'Tell Claude about upcoming changes — travel, illness or busy weeks',
      'The plan is adjusted to accommodate on the next review',
    ],
  },
  {
    cat: 'Settings', color: 'var(--color-yoga)',
    items: [
      'Turn features on/off — coach updates and briefings',
      'Set your training location for weather-adjusted paces',
      'Your zones — pace, heart-rate, power and swim — plus threshold and strength focus',
      'Hydration profile — sweat sodium and gut tolerance',
      'Temporary read-only guest access to share your data',
      'Integrations — Strava, intervals.icu, Telegram and a Claude (MCP) connector',
      'A full change log of every plan edit',
    ],
  },
];

function Section({ cat, color, children }: { cat: string; color: string; children: React.ReactNode }) {
  return (
    <section className="border border-fog rounded-[14px] bg-paper mb-[14px]" style={{ padding: '16px 18px' }}>
      <div className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.07em', color }}>{cat}</div>
      <div className="mt-[10px]">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-[7px]">
      {items.map(t => (
        <li key={t} className="flex items-start gap-[9px] text-[14px] text-ink leading-snug">
          <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-fog shrink-0" />
          {t}
        </li>
      ))}
    </ul>
  );
}

export default function AboutPage() {
  return (
    <div className="px-4 md:px-[26px] py-[22px] max-w-[760px]">
      <h1 className="font-display font-bold text-[26px] mb-2">About paceline</h1>
      <p className="text-[14px] text-stone leading-relaxed mb-5 max-w-[620px]">
        paceline is a visualisation front end for running and triathlon training plans, providing
        insights and predictions based on data.
      </p>

      <Section cat="Backend" color="var(--color-ink)">
        <p className="text-[14px] text-ink leading-relaxed">
          The site runs on Vercel via GitHub &amp; Supabase. Data is predominantly collected through
          Strava webhooks and intervals.icu — all exercise data plus Garmin sleep and wellness
          information. Additional user data is then added through paceline. Updates and messages are
          sent via Telegram.
        </p>
      </Section>

      {SECTIONS.map(s => (
        <Section key={s.cat} cat={s.cat} color={s.color}>
          <Bullets items={s.items} />
        </Section>
      ))}
    </div>
  );
}
