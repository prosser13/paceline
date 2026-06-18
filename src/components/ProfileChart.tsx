export interface ProfileBar {
  effort: number;   // 0–100
  minutes: number;  // minimum 1
}

const INTENSITY_EFFORT: Record<string, number> = {
  recovery: 25,
  easy:     40,
  steady:   60,
  tempo:    75,
  hard:     90,
  race:     95,
};

function parseDurationMins(duration: string | null | undefined): number {
  if (!duration) return 0;
  const parts = duration.split(':').map(Number);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
}

function mergeConsecutive(bars: ProfileBar[]): ProfileBar[] {
  return bars.reduce<ProfileBar[]>((acc, bar) => {
    const last = acc[acc.length - 1];
    if (last && last.effort === bar.effort) {
      last.minutes += bar.minutes;
      return acc;
    }
    acc.push({ effort: bar.effort, minutes: bar.minutes });
    return acc;
  }, []);
}

export function buildProfileBars(session: {
  structure?: Array<{ effort_pct?: number; duration_mins?: number }> | null;
  intensity?: string | null;
  estimated_duration?: string | null;
}): ProfileBar[] {
  const structure = session.structure;

  if (structure?.length && structure[0].effort_pct != null && structure[0].duration_mins != null) {
    const raw = structure
      .filter(p => p.effort_pct != null && p.duration_mins != null)
      .map(p => ({
        effort:  p.effort_pct as number,
        minutes: Math.max(1, p.duration_mins as number),
      }));
    return mergeConsecutive(raw);
  }

  // Fallback: single block derived from intensity + estimated_duration
  const effort = INTENSITY_EFFORT[session.intensity ?? 'easy'] ?? 40;
  const mins = parseDurationMins(session.estimated_duration);
  return mins > 0 ? [{ effort, minutes: mins }] : [];
}

interface ProfileChartProps {
  bars: ProfileBar[];
  size?: 'sm' | 'lg';
}

export default function ProfileChart({ bars, size = 'sm' }: ProfileChartProps) {
  const W = size === 'lg' ? 210 : 120;
  const H = size === 'lg' ? 54  : 34;

  if (!bars.length) {
    return <span style={{ display: 'block', width: W, height: H }} />;
  }

  const totalMins = bars.reduce((s, b) => s + b.minutes, 0);

  let x = 0;
  const rects = bars.map((bar, i) => {
    const bw = (bar.minutes / totalMins) * W;
    const bh = (bar.effort / 100) * H;
    const el = (
      <rect
        key={i}
        x={x.toFixed(2)}
        y={(H - bh).toFixed(2)}
        width={bw.toFixed(2)}
        height={bh.toFixed(2)}
      />
    );
    x += bw;
    return el;
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block', flexShrink: 0 }}>
      <g fill="#17191e" opacity="0.32">
        {rects}
      </g>
    </svg>
  );
}
