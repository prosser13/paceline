export type { ProfileBar } from '@/lib/profile';
export { buildProfileBars } from '@/lib/profile';

import type { ProfileBar } from '@/lib/profile';

interface ProfileChartProps {
  bars: ProfileBar[];
  size?: 'xs' | 'sm' | 'lg';
  color?: string;
  opacity?: number;
}

const H_BY_SIZE  = { xs: 22, sm: 34,  lg: 54  } as const;
const MAX_W      = { xs: 80, sm: 160, lg: 210 } as const;
const MIN_W      = { xs: 26, sm: 36,  lg: 210 } as const;
const PX_PER_MIN = { xs: 1.2, sm: 1.2, lg: 999 } as const;

// Minimum rendered width per bar (px) so short intervals (e.g. strides) stay visible
const MIN_BAR_W = { xs: 2, sm: 2, lg: 0 } as const;

export default function ProfileChart({
  bars, size = 'sm', color = '#17191e', opacity = 0.32,
}: ProfileChartProps) {
  const H = H_BY_SIZE[size];

  if (!bars.length) {
    return <span style={{ display: 'block', width: MIN_W[size], height: H }} />;
  }

  const totalMins = bars.reduce((s, b) => s + b.minutes, 0);
  const targetW = Math.round(
    Math.max(MIN_W[size], Math.min(MAX_W[size], totalMins * PX_PER_MIN[size]))
  );

  // Floor each bar's width so slim segments stay visible, then scale back to fit
  const floored = bars.map(b => Math.max(MIN_BAR_W[size], (b.minutes / totalMins) * targetW));
  const flooredSum = floored.reduce((s, w) => s + w, 0);
  const scale  = flooredSum > targetW ? targetW / flooredSum : 1;
  const widths = floored.map(w => w * scale);
  const W = widths.reduce((s, w) => s + w, 0);

  const rects = bars.map((bar, i) => {
    const bw = widths[i];
    const bh = (bar.effort / 100) * H;
    const x  = widths.slice(0, i).reduce((sum, w) => sum + w, 0);
    return (
      <rect
        key={i}
        x={x.toFixed(2)}
        y={(H - bh).toFixed(2)}
        width={bw.toFixed(2)}
        height={bh.toFixed(2)}
        fill={bar.color ?? color}
      />
    );
  });

  return (
    <svg viewBox={`0 0 ${W.toFixed(2)} ${H}`} width={W.toFixed(2)} height={H} style={{ display: 'block', flexShrink: 0 }}>
      <g opacity={opacity}>
        {rects}
      </g>
    </svg>
  );
}
