export type ProfileKey = 'easy' | 'intervals' | 'long' | 'recovery';

const PROFILES: Record<ProfileKey, number[]> = {
  easy:      [42, 44, 43, 44, 42, 43],
  intervals: [24, 26, 90, 32, 90, 32, 90, 32, 90, 26, 24],
  long:      [52, 54, 53, 55, 54, 56, 58, 64, 52],
  recovery:  [26, 28, 27, 26, 27],
};

interface ProfileChartProps {
  profile: ProfileKey | null;
  size?: 'sm' | 'lg';
}

export default function ProfileChart({ profile, size = 'sm' }: ProfileChartProps) {
  const W  = size === 'lg' ? 210 : 120;
  const H  = size === 'lg' ? 54  : 34;
  const g  = size === 'lg' ? 3   : 2.5;

  if (!profile) {
    return <span style={{ display: 'block', width: W, height: H }} />;
  }

  const bars = PROFILES[profile];
  const n    = bars.length;
  const bw   = (W - (n - 1) * g) / n;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block', flexShrink: 0 }}>
      <g fill="#17191e" opacity="0.32">
        {bars.map((h, i) => {
          const bh = H * h / 100;
          const x  = i * (bw + g);
          const y  = H - bh;
          return (
            <rect
              key={i}
              x={x.toFixed(1)}
              y={y.toFixed(1)}
              width={bw.toFixed(1)}
              height={bh.toFixed(1)}
              rx="1"
            />
          );
        })}
      </g>
    </svg>
  );
}
