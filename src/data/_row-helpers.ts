// Shared helpers for the src/data layer.

// Unwrap a Supabase embedded join, which comes back as a single object for a
// to-one relation but as an array in some query shapes (and null when absent).
// Collapses both to a single row or null. Replaces the
// `Array.isArray(r.rel) ? r.rel[0] : r.rel` idiom that was copy-pasted ~14×.
export function unwrapJoin<T>(x: T | T[] | null | undefined): T | null {
  return (Array.isArray(x) ? x[0] : x) ?? null;
}
