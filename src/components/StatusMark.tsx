// Session status type. (The status-mark component, MARKS and ROW_CLASS maps were
// unused and removed — the plan page renders its own status rail in PlanThread.)
// Kept here so existing imports of the type are unchanged.
export type SessionStatus = 'done' | 'today' | 'planned' | 'missed' | 'missed_injury' | 'skipped' | 'rest';
