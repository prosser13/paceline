export type SessionStatus = 'done' | 'today' | 'planned' | 'missed_injury' | 'skipped' | 'rest';

// Static map — no dynamic class names
const MARKS: Record<SessionStatus, { symbol: string; className: string }> = {
  done:          { symbol: '✓', className: 'text-fern' },
  today:         { symbol: '●', className: 'text-oxblood' },
  planned:       { symbol: '○', className: 'text-fog' },
  missed_injury: { symbol: '✕', className: 'text-ember' },
  skipped:       { symbol: '✕', className: 'text-stone' },
  rest:          { symbol: '–', className: 'text-stone' },
};

// Row-level border/bg treatment per status
export const ROW_CLASS: Record<SessionStatus, string> = {
  done:          'border-l-[3px] border-l-fern',
  today:         'border-l-[3px] border-l-oxblood bg-oxblood-soft',
  planned:       '',
  missed_injury: 'border-l-[3px] border-l-ember bg-ember-soft',
  skipped:       '',
  rest:          '!border-dashed',
};

export default function StatusMark({ status }: { status: SessionStatus }) {
  const { symbol, className } = MARKS[status];
  return <span className={`text-[13px] text-center leading-none ${className}`}>{symbol}</span>;
}
