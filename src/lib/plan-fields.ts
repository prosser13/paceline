// Single source of truth for the fields a plan session's mutation may set.
//
// Every other artifact is GENERATED from this record so they can never drift:
//   • the apply_plan_change patch JSON Schema (properties + additionalProperties:false)
//   • the field list shown in the tool description
//   • the server-side allowlist the mutation handler checks against
//   • add_plan_session's accepted fields (the `creatable` subset + required)
//
// Adding or removing an editable field is a one-line change here. A parity check
// (assertEditableFieldContract) runs when the MCP tools module loads — which
// happens during `next build` — so any hand-written divergence fails CI.

type SchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';

export interface EditableFieldDef {
  type: SchemaType;        // JSON Schema type
  nullable?: boolean;      // also permit an explicit null (e.g. clearing an override)
  creatable?: boolean;     // settable at creation via add_plan_session, not just on edit
  description: string;     // one-line, shown to the model
}

// The allowlist. Order here is the order shown in the description.
const FIELDS = {
  scheduled_date:     { type: 'string',  creatable: true, description: 'Session date, YYYY-MM-DD.' },
  day_of_week:        { type: 'integer',                  description: 'ISO weekday 1–7 (auto-derived from scheduled_date on a move).' },
  am_pm:              { type: 'string',                   description: '"AM" | "PM" for a session split across the day.' },
  session_type:       { type: 'string',  creatable: true, description: 'e.g. GA, LR, REC, MLR, MP, RACE, STRENGTH, YOGA, CORE.' },
  activity_type:      { type: 'string',  creatable: true, description: '"running" | "cycling".' },
  name:               { type: 'string',  creatable: true, description: 'Session name.' },
  description:        { type: 'string',  creatable: true, description: 'Free-text description.' },
  distance_km:        { type: 'number',  creatable: true, description: 'Headline distance in km.' },
  warmup_km:          { type: 'number',  creatable: true, description: 'Warm-up distance in km.' },
  cooldown_km:        { type: 'number',  creatable: true, description: 'Cool-down distance in km.' },
  structure:          { type: 'array',   creatable: true, description: 'Per-segment prescription (jsonb array of phases); sum to distance_km.' },
  target_pace:        { type: 'string',  creatable: true, description: 'Headline/quality pace, "m:ss".' },
  target_pace_end:    { type: 'string',  creatable: true, description: 'End of a target pace range, "m:ss".' },
  estimated_tss:      { type: 'number',  creatable: true, description: 'Estimated training-stress score.' },
  estimated_duration: { type: 'string',  creatable: true, description: 'Estimated duration, "H:MM".' },
  intensity:          { type: 'string',  creatable: true, description: 'recovery | easy | steady | tempo | threshold | hard | race.' },
  profile_shape:      { type: 'string',  creatable: true, description: 'Session profile shape.' },
  week_phase:         { type: 'string',                   description: 'Phase label for the week (Base/Build/Taper/…).' },
  priority:           { type: 'string',  creatable: true, description: 'A | B | C session priority.' },
  status:             { type: 'string',                   description: 'planned | skipped | … .' },
  rationale:          { type: 'string',  creatable: true, description: 'Why the session is prescribed.' },
  notes:              { type: 'string',  creatable: true, description: 'Coaching notes.' },
  fuel_override:      { type: 'object',  nullable: true,  description: 'Per-session fuelling override { kind, gph }, or null to clear (revert to derived).' },
  fuel_guidance:      { type: 'object',  nullable: true,  description: 'Friendly alias for fuel_override: { kind, gph } to set, or null to clear.' },
} satisfies Record<string, EditableFieldDef>;

export type EditableFieldName = keyof typeof FIELDS;

// Uniform value type so optional props (creatable/nullable) are accessible per field.
export const EDITABLE_SESSION_FIELDS = FIELDS as Record<EditableFieldName, EditableFieldDef>;

export const EDITABLE_FIELD_NAMES = Object.keys(EDITABLE_SESSION_FIELDS) as EditableFieldName[];

// Fields also settable at creation, and the create-only required fields.
export const CREATABLE_FIELD_NAMES = EDITABLE_FIELD_NAMES.filter(f => EDITABLE_SESSION_FIELDS[f].creatable);
export const CREATE_REQUIRED_FIELDS = ['scheduled_date', 'session_type', 'name'] as const;

// A validated subset of the allowlist — for a caller that intentionally exposes
// fewer fields than the full set (e.g. a narrower server). Throws on an unknown
// name so a subset can't silently reference a field that doesn't exist.
export function pickEditableFields(names: readonly EditableFieldName[]): EditableFieldName[] {
  for (const n of names) {
    if (!(n in EDITABLE_SESSION_FIELDS)) throw new Error(`pickEditableFields: unknown editable field "${n}"`);
  }
  return [...names];
}

interface SchemaProp { type: SchemaType | ['null', SchemaType] | [SchemaType, 'null']; description: string }

// JSON Schema `properties` for the given fields (default: all), correctly typed,
// with additionalProperties:false so unknown keys are rejected at the boundary.
export function editablePatchSchema(fields: readonly EditableFieldName[] = EDITABLE_FIELD_NAMES) {
  const properties: Record<string, SchemaProp> = {};
  for (const f of fields) {
    const def = EDITABLE_SESSION_FIELDS[f];
    properties[f] = { type: def.nullable ? [def.type, 'null'] : def.type, description: def.description };
  }
  return { type: 'object' as const, properties, additionalProperties: false as const };
}

// The comma-joined field list for a tool description (default: all).
export function editableFieldList(fields: readonly EditableFieldName[] = EDITABLE_FIELD_NAMES): string {
  return fields.join(', ');
}

// The server-side allowlist the mutation handler checks against.
export function editableAllowlist(fields: readonly EditableFieldName[] = EDITABLE_FIELD_NAMES): Set<string> {
  return new Set<string>(fields);
}

// Parity guard: the schema's property keys, the described field list, and the
// handler's allowlist must be the SAME set. Generated from one source, so this is
// tautological today — its job is to fail the build the moment anyone re-introduces
// a hand-written list that drifts. Throws a clear error naming the difference.
export function assertEditableFieldContract(args: {
  schemaProperties: Record<string, unknown>;
  description: string;         // the tool description; every editable field must appear in it
  allowlist: Set<string>;
}): void {
  const canonical = new Set<string>(EDITABLE_FIELD_NAMES);
  const schemaKeys = new Set(Object.keys(args.schemaProperties));

  const diff = (a: Set<string>, b: Set<string>) => [...a].filter(x => !b.has(x));
  const problems: string[] = [];
  const checkSet = (name: string, s: Set<string>) => {
    const missing = diff(canonical, s), extra = diff(s, canonical);
    if (missing.length) problems.push(`${name} is missing: ${missing.join(', ')}`);
    if (extra.length) problems.push(`${name} has unexpected: ${extra.join(', ')}`);
  };
  checkSet('schema properties', schemaKeys);
  checkSet('server allowlist', args.allowlist);
  // Word-boundary match so "description" doesn't accidentally satisfy "description".
  const undocumented = EDITABLE_FIELD_NAMES.filter(f => !new RegExp(`\\b${f}\\b`).test(args.description));
  if (undocumented.length) problems.push(`tool description omits: ${undocumented.join(', ')}`);

  if (problems.length) {
    throw new Error(`Editable-session-field contract drift — schema, description and allowlist must all match EDITABLE_SESSION_FIELDS:\n  ${problems.join('\n  ')}`);
  }
}
