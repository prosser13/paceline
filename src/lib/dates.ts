// Unified date formatting for the whole app. One place so the dashboard, plan,
// races and settings never drift on weekday/month style.
//
//   fmtDate(d, 'short')   → "Mon 29 Jun"   (month ALWAYS shown — no ambiguous "Wed 1")
//   fmtDate(d, 'weekday') → "Mon"
//   fmtDate(d, 'long')    → "Mon 29 June"
//   fmtRange(a, b)        → "29 Jun – 5 Jul"   (drops the first month when both share it: "1 – 7 Jun")
//   fmtRelative(d)        → "Today" | "Tomorrow" | "Yesterday" | "in 6 days" | "6 days ago"
//
// Year is appended only when the date is not in the current year.

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Parse a 'YYYY-MM-DD' string at local midnight (avoids the UTC off-by-one), or pass a Date through.
export function toDate(d: Date | string): Date {
  if (d instanceof Date) return d;
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00') : new Date(d);
}

function yearSuffix(dt: Date): string {
  return dt.getFullYear() === new Date().getFullYear() ? '' : ` ${dt.getFullYear()}`;
}

export type DateStyle = 'short' | 'weekday' | 'long';

export function fmtDate(d: Date | string, style: DateStyle = 'short'): string {
  const dt = toDate(d);
  if (style === 'weekday') return WD[dt.getDay()];
  if (style === 'long') return `${WD[dt.getDay()]} ${dt.getDate()} ${MON_LONG[dt.getMonth()]}${yearSuffix(dt)}`;
  return `${WD[dt.getDay()]} ${dt.getDate()} ${MON[dt.getMonth()]}${yearSuffix(dt)}`;
}

export function fmtRange(a: Date | string, b: Date | string): string {
  const da = toDate(a), db = toDate(b);
  const left = da.getMonth() === db.getMonth() && da.getFullYear() === db.getFullYear()
    ? `${da.getDate()}`
    : `${da.getDate()} ${MON[da.getMonth()]}`;
  return `${left} – ${db.getDate()} ${MON[db.getMonth()]}${yearSuffix(db)}`;
}

// Whole-day difference between two local dates.
export function daysBetween(from: Date | string, to: Date | string): number {
  const a = toDate(from), b = toDate(to);
  const ms = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
           - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  return Math.round(ms / 86_400_000);
}

export function fmtRelative(d: Date | string, now: Date | string = new Date()): string {
  const n = daysBetween(now, d);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

// Duration in seconds → "8h 42m" / "45m" / "—" (for sleep and the like).
export function fmtSleep(secs: number | null | undefined): string {
  if (secs == null || !Number.isFinite(secs) || secs <= 0) return '—';
  const total = Math.round(secs / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
