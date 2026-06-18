export type { ProfileBar } from '@/lib/profile';
export { buildProfileBars } from '@/lib/profile';

import type { ProfileBar } from '@/lib/profile';

interface ProfileChartProps {
  bars: ProfileBar[];
  size?: 'sm' | 'lg';
}

const H_BY_SIZE  = { sm: 34,  lg: 54  } as const;
const MAX_W      = { sm: 160, lg: 210 } as const;
const MIN_W      = { sm: 36,  lg: 210 } as const;
const PX_PER_MIN = { sm: 1.2, lg: 999 } as const;

export default function ProfileChart({ bars, size = 'sm' }: ProfileChartProps) {
  const H = H_BY_SIZE[size];

  if (!bars.length) {
    return <span style={{ display: 'block', width: MIN_W[size], height: H }} />;
  }

  const totalMins = bars.reduce((s, b) => s + b.minutes, 0);
  const W = Math.round(
    Math.max(MIN_W[size], Math.min(MAX_W[size], totalMins * PX_PER_MIN[size]))
  );

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
