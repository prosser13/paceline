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
      'Planned activities with data entry for additional info',
      'High-level overview of wellness information',
      'A-race prediction',
    ],
  },
  {
    cat: 'Plan', color: 'var(--color-ride)',
    items: [
      'Block-by-block overviews of events',
      'Plan information entered via MCP at the start of a block',
      'Claude reviews the plan daily and alters it where necessary',
      'Workouts built and sent to Garmin',
    ],
  },
  {
    cat: 'Races', color: 'var(--color-race)',
    items: [
      'Information on races',
      'GPX, predicted times, race-day weather, nutrition and kit',
    ],
  },
  {
    cat: 'Strength', color: 'var(--color-strength)',
    items: [
      'Flexible strength / yoga session builder',
      'Progressive engine tracks and increases improvements',
      'Injury adjustments',
    ],
  },
  {
    cat: 'Benchmarks', color: 'var(--color-hard)',
    items: [
      'Predicts times for A-races using various algorithmic approaches',
      'Building a fuelling & sweat-loss model',
    ],
  },
  {
    cat: 'Availability', color: 'var(--color-marine)',
    items: [
      'Tells Claude about upcoming changes in your schedule',
      'Plan adjusted to accommodate',
    ],
  },
  {
    cat: 'Settings', color: 'var(--color-yoga)',
    items: [
      'Turn features on/off: coach updates, briefings',
      'Set your location for weather',
      'User data such as pace / heart-rate zones, location, strength focus',
      'Change log',
      'API integrations',
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
