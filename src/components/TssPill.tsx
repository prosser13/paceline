export type Intensity = 'easy' | 'recovery' | 'steady' | 'tempo' | 'hard' | 'race';

// Static class maps — never build class names dynamically (Tailwind will purge them)
const ACTUAL: Record<Intensity, string> = {
  easy:     'bg-marine-soft text-marine',
  recovery: 'bg-marine-soft text-marine',
  steady:   'bg-fern-soft text-fern',
  tempo:    'bg-amber-soft text-amber-dark',
  hard:     'bg-ember-soft text-ember',
  race:     'bg-oxblood-soft text-oxblood',
};

const ESTIMATED: Record<Intensity, string> = {
  easy:     'text-marine border-marine',
  recovery: 'text-marine border-marine',
  steady:   'text-fern border-fern',
  tempo:    'text-[#9a7410] border-amber',
  hard:     'text-ember border-ember',
  race:     'text-oxblood border-oxblood',
};

interface TssPillProps {
  tss: number | null;
  duration: string | null; // "h:mm"
  intensity: Intensity;
  estimated: boolean;
  size?: 'sm' | 'lg';
}

export default function TssPill({ tss, duration, intensity, estimated, size = 'sm' }: TssPillProps) {
  if (tss == null) {
    return (
      <span className={`font-mono font-normal text-stone text-center whitespace-nowrap ${size === 'lg' ? 'text-[19px] px-4 py-2.5 min-w-[96px]' : 'text-[13.5px] px-2.5 py-1.5 min-w-[74px]'}`}>
        —
      </span>
    );
  }

  const sizeClass = size === 'lg'
    ? 'text-[19px] px-4 py-2.5 min-w-[96px]'
    : 'text-[13.5px] px-2.5 py-1.5 min-w-[74px]';

  const smallClass = size === 'lg' ? 'text-[11px] mt-[3px]' : 'text-[10px] mt-[1px]';

  if (estimated) {
    return (
      <span className={`font-mono font-bold rounded-lg border border-dashed text-center whitespace-nowrap block ${sizeClass} ${ESTIMATED[intensity]}`}>
        ~{tss}
        {duration && <small className={`font-normal tracking-[.05em] block ${smallClass}`}>{duration}</small>}
      </span>
    );
  }

  return (
    <span className={`font-mono font-bold rounded-lg text-center whitespace-nowrap block ${sizeClass} ${ACTUAL[intensity]}`}>
      {tss}
      {duration && <small className={`font-normal tracking-[.05em] block ${smallClass}`}>{duration}</small>}
    </span>
  );
}
