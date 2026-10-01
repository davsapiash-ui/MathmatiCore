/**
 * One row of the research export's "פעולות" file (exportResearchDataset) —
 * one telemetry event, its typed details as columns.
 *
 * PRD Module 24: the export produces the telemetry events and "כל השדות
 * מיוצאים תחת מזהים אנונימיים 1 עד 12 בלבד"; Appendix A §3 defines the fields
 * of each event. details_json, which carried the whole untyped object, was
 * removed so that no free text a client parked in details reaches the dataset
 * — but only some typed fields got a column, and the rest were lost: the
 * template and path of PROBLEM_LOAD, the source column of a drag (the only
 * mark of a drop into the trash), the duration of a regrouping and of an
 * exercise, the chosen card option, the reflection, whether the grid opened
 * or closed and who opened it (register deviation 19), the conversion a
 * keyboard lock asked for, the help counts and what a board clear removed.
 *
 * Every column takes a number, a boolean or a value from a closed list
 * (Appendix A §3 and register deviations 19, 28) — never a free string — so
 * the dataset stays as clean as it was without details_json.
 *
 * Import-free on purpose, like socraticContract.ts, so the client's tests can
 * pin it too.
 */

type Details = Record<string, unknown>;

const num = (v: unknown): number | "" => (typeof v === "number" && Number.isFinite(v) ? v : "");
const intIn = (v: unknown, min: number, max: number): number | "" =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : "";
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | "" =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : "";
/** An exercise or template id: the shape the banks use (s3_g_t3, task8_missing_addend). */
const idOf = (v: unknown): string => (typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : "");
const only = (eventType: unknown, ...types: string[]) => typeof eventType === "string" && types.includes(eventType);

const STRATEGIES = ["UNDO_BUTTON", "MEMORY_CIRCLES", "SOCRATIC_CARD"] as const;

/** The typed details columns, in the order the file shows them. Empty when the event does not carry the field. */
export function researchDetailsColumns(eventType: unknown, raw: unknown): Record<string, number | boolean | string> {
  const d: Details = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Details) : {};
  const strategies = only(eventType, "REFLECTION_SUBMITTED") && Array.isArray(d.selected_strategies)
    ? d.selected_strategies.filter((s): s is string => typeof s === "string" && (STRATEGIES as readonly string[]).includes(s)).join(";")
    : "";
  return {
    // PROBLEM_LOAD
    exercise_template_id: only(eventType, "PROBLEM_LOAD") ? idOf(d.exercise_template_id) : "",
    path_type: only(eventType, "PROBLEM_LOAD") ? oneOf(d.path_type, ["compulsory", "consolidation", "challenge"] as const) : "",
    // BLOCK_DRAG_COMPLETE: the column a block came from (null for a palette block).
    source_column_index: only(eventType, "BLOCK_DRAG_COMPLETE") ? intIn(d.source_column_index, 0, 3) : "",
    // REGROUPING_SUCCESS
    duration_ms: only(eventType, "REGROUPING_SUCCESS") ? num(d.duration_ms) : "",
    // SOCRATIC_OPTION_SELECTED (is_correct has its own column)
    option_id: only(eventType, "SOCRATIC_OPTION_SELECTED") ? oneOf(d.option_id, ["opt_1", "opt_2", "opt_3"] as const) : "",
    // PROBLEM_COMPLETE
    total_duration_ms: only(eventType, "PROBLEM_COMPLETE") ? num(d.total_duration_ms) : "",
    undo_count: only(eventType, "PROBLEM_COMPLETE") ? num(d.undo_count) : "",
    error_count: only(eventType, "PROBLEM_COMPLETE") ? num(d.error_count) : "",
    // REFLECTION_SUBMITTED
    reflection_step: only(eventType, "REFLECTION_SUBMITTED") ? intIn(d.reflection_step, 1, 3) : "",
    effort_score: only(eventType, "REFLECTION_SUBMITTED") ? oneOf(d.effort_score, ["LOW", "MEDIUM", "HIGH"] as const) : "",
    selected_strategies: strategies,
    persistence_index: only(eventType, "REFLECTION_SUBMITTED") ? num(d.persistence_index) : "",
    // ADAPTIVE_GRID_TOGGLED (register deviation 19: "נפתח/נסגר; מקור")
    grid_action: only(eventType, "ADAPTIVE_GRID_TOGGLED") ? oneOf(d.action, ["opened", "closed"] as const) : "",
    grid_source: only(eventType, "ADAPTIVE_GRID_TOGGLED") ? oneOf(d.source, ["hesitation_30s", "learner"] as const) : "",
    // KEYBOARD_LOCK_BLOCKED
    conversion_required: only(eventType, "KEYBOARD_LOCK_BLOCKED") ? oneOf(d.conversion_required, ["composition", "decomposition"] as const) : "",
    // HELP_REQUESTED / HELP_WITHDRAWN
    help_count: only(eventType, "HELP_REQUESTED", "HELP_WITHDRAWN") ? num(d.help_count) : "",
    // BOARD_CLEARED: what each column lost
    cleared_units: only(eventType, "BOARD_CLEARED") ? num(d.units) : "",
    cleared_tens: only(eventType, "BOARD_CLEARED") ? num(d.tens) : "",
    cleared_hundreds: only(eventType, "BOARD_CLEARED") ? num(d.hundreds) : "",
    cleared_thousands: only(eventType, "BOARD_CLEARED") ? num(d.thousands) : "",
    blocks_removed: only(eventType, "BOARD_CLEARED") ? num(d.blocks_removed) : "",
  };
}
