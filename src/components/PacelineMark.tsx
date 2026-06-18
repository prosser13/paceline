interface PacelineMarkProps {
  className?: string;
  /** Colour of the lead (accent) bar. Defaults to oxblood on light surfaces. */
  lead?: string;
}

export default function PacelineMark({
  className = '',
  lead = 'var(--color-oxblood)',
}: PacelineMarkProps) {
  return (
    <svg
      viewBox="0 0 244 146"
      className={className}
      role="img"
      aria-label="Paceline"
    >
      <polygon points="34,26 60,26 26,146 0,146"     fill="currentColor" />
      <polygon points="80,26 106,26 72,146 46,146"   fill="currentColor" />
      <polygon points="126,26 152,26 118,146 92,146" fill="currentColor" />
      <polygon points="172,26 198,26 164,146 138,146" fill="currentColor" />
      <polygon points="218,0 244,0 210,120 184,120"  fill={lead} />
    </svg>
  );
}
