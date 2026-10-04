/**
 * The conversion each representation exercise asks the child to make with the
 * blocks — the RECEIVING column of a decomposition (a hundred broken into ten
 * tens: the tens), the SOURCE column of a composition (ten tens grouped into a
 * hundred: the tens), as `conversionsByColumn` records them. Two rules read it.
 *
 * Module 9 §א, enhanced_cognitive_support only (owner's decision 28.9.2026,
 * register שהB.4): the answer is locked until the blocks perform the
 * conversion (safety valve, register gap כ: a board that already equals
 * requiredCounts opens it, so a child who built it without converting is
 * never stuck). How much is locked depends on the answer the exercise has:
 *   - the result row of digits (station 1; station 7's s7_g_t5, s7_g_t6): only
 *     the listed columns lock, each until its own conversion; every other
 *     column is open from the start;
 *   - the single answer box of station 3 and of s7_r_t1, s7_g_t1 and
 *     s7_g_reinforce_2 (a `representationKind`, owner 30.9.2026): the whole
 *     box stays locked until EVERY listed conversion is done — after the break
 *     (compose_break), after the grouping (compose_group). read_write and
 *     decompose ask for no conversion: they are not listed and never lock.
 *     Before 30.9.2026 the "45 tens / 45 hundreds / 27 tens / 36 hundreds"
 *     exercises were listed; they are decompositions now, built from one kind
 *     of block however the child likes.
 * A keystroke into a locked answer is rejected and logged as
 * KEYBOARD_LOCK_BLOCKED with the column of the conversion still missing and
 * this entry's `conversion`.
 *
 * The exercises with a `representationKind` (proceed(), useWorkspaceStore.ts):
 * compose_break and compose_group are not solved until the blocks performed
 * every listed conversion, for every learner — "הלבנים מסודרות נכון, אבל
 * המשימה היא לפרוט בעצמכם", naming the block still to break or the column's
 * "קבצו 10" button.
 *
 * ★ chosen: the PRD names no columns for these exercises. Each entry is derived
 * from the exercise's numbers and requiredCounts and passed the pedagogy gate
 * (Rule 3) — on 28.9.2026, and for station 3's redesign on 30.9.2026:
 *   s1_target_347     347 → 3 hundreds, 3 tens, 17 units: a ten into units.
 *   s1_r_group26      26 units → 2 tens, 6 units: units grouped into tens, twice
 *                     (one column, listed twice, like s7_g_t1).
 *   s3_r_t2           3 hundreds, 4 tens → 2 hundreds, 14 tens: a hundred into tens.
 *   s3_r_t4           8 tens, 5 units → 7 tens, 15 units: a ten into units.
 *   s3_r_t6           5 hundreds, 6 units → 4 hundreds, 10 tens, 6 units: a hundred into tens.
 *   s3_g_t2           3 thousands, 4 hundreds → 2 thousands, 14 hundreds: a thousand into hundreds.
 *   s3_g_t4           5 thousands, 2 hundreds, 3 tens → 4 thousands, 11 hundreds,
 *                     13 tens: a thousand into hundreds, then a hundred into tens.
 *   s3_g_t6           6 thousands, 3 tens → 5 thousands, 10 hundreds, 3 tens: a thousand into hundreds.
 *   s7_r_t1           12 tens, 5 units → 1 hundred, 2 tens, 5 units: ten tens grouped into a hundred.
 *   s7_g_t1           25 hundreds → 2 thousands, 5 hundreds: ten hundreds grouped
 *                     into a thousand, twice (one column, listed twice: the
 *                     second grouping is the child's own too).
 *   s7_g_reinforce_2  14 hundreds, 3 tens → 1 thousand, 4 hundreds, 3 tens: ten
 *                     hundreds grouped into a thousand (owner, 30.9.2026).
 *   s7_g_t5           3,400 + 1,000 − 600: 4 hundreds cannot give 6, so a
 *                     thousand is decomposed into hundreds (3,800).
 *   s7_g_t6           1 thousand, 16 hundreds, 13 tens → 2,730: ten tens
 *                     grouped into a hundred, ten hundreds into a thousand.
 * No conversion (not listed): station 3's read_write and decompose exercises
 * (s3_r_t1, s3_r_t3, s3_r_t5, s3_g_t1, s3_g_t3, s3_g_t5 and the four
 * reinforcements), s7_r_t6 (340 + 200 − 30 = 510, 4 tens give 3 without a
 * decomposition).
 */
import { PLACE_VALUES, type Place } from '@/core/placeValue';

export interface RepresentationLock {
  /** What the conversion is — the KEYBOARD_LOCK_BLOCKED conversion_required. */
  conversion: 'decomposition' | 'composition';
  columns: Place[];
}

export const REPRESENTATION_LOCKS: Record<string, RepresentationLock> = {
  s1_target_347: { conversion: 'decomposition', columns: ['units'] },
  // Twice: 26 units are grouped into two tens, each grouping the child's own
  // (register ו "הלומד מקבץ פעמיים לעשרת"; audit A2-F06).
  s1_r_group26: { conversion: 'composition', columns: ['units', 'units'] },
  s3_r_t2: { conversion: 'decomposition', columns: ['tens'] },
  s3_r_t4: { conversion: 'decomposition', columns: ['units'] },
  s3_r_t6: { conversion: 'decomposition', columns: ['tens'] },
  s3_g_t2: { conversion: 'decomposition', columns: ['hundreds'] },
  s3_g_t4: { conversion: 'decomposition', columns: ['hundreds', 'tens'] },
  s3_g_t6: { conversion: 'decomposition', columns: ['hundreds'] },
  s7_r_t1: { conversion: 'composition', columns: ['tens'] },
  // Twice in one column: the box and proceed() wait for the second grouping.
  s7_g_t1: { conversion: 'composition', columns: ['hundreds', 'hundreds'] },
  s7_g_reinforce_2: { conversion: 'composition', columns: ['hundreds'] },
  s7_g_t5: { conversion: 'decomposition', columns: ['hundreds'] },
  s7_g_t6: { conversion: 'composition', columns: ['tens', 'hundreds'] },
};

export type RepresentationKindName = 'read_write' | 'compose_break' | 'decompose' | 'compose_group';

/**
 * The kind of a station 3 / station 7 representation by its id — for a task
 * object that does not carry `representationKind` (a bank published to the
 * catalog before the field existed).
 */
export const REPRESENTATION_KIND_BY_ID: Record<string, RepresentationKindName> = {
  s3_r_t1: 'read_write', s3_r_t5: 'read_write', s3_g_t1: 'read_write', s3_g_t5: 'read_write',
  s3_r_reinforce_1: 'read_write', s3_g_reinforce_1: 'read_write',
  s3_r_t2: 'compose_break', s3_r_t4: 'compose_break', s3_r_t6: 'compose_break',
  s3_g_t2: 'compose_break', s3_g_t4: 'compose_break', s3_g_t6: 'compose_break',
  s3_r_t3: 'decompose', s3_g_t3: 'decompose', s3_r_reinforce_2: 'decompose', s3_g_reinforce_2: 'decompose',
  s7_r_t1: 'compose_group', s7_g_t1: 'compose_group', s7_g_reinforce_2: 'compose_group',
};
const KIND_NAMES: readonly string[] = ['read_write', 'compose_break', 'decompose', 'compose_group'];

/** The task's own `representationKind`, or — when it carries none — its id's. */
export function representationKindOfTask(task: { id?: unknown; representationKind?: unknown } | null | undefined): RepresentationKindName | null {
  const own = task?.representationKind;
  if (typeof own === 'string' && KIND_NAMES.includes(own)) return own as RepresentationKindName;
  return typeof task?.id === 'string' ? REPRESENTATION_KIND_BY_ID[task.id] ?? null : null;
}

/** What `buildsAnyWay` reads of an exercise (a SessionTask, or the engine's loose task). */
export interface BuildTaskLike {
  id?: string;
  type?: string;
  representationKind?: string;
  requiresGrouping?: boolean;
  requiresUngrouping?: boolean;
  numberA?: number;
}

/**
 * A representation exercise that only says "build the number X", with no
 * word on how (owner, 4.10.2026: "לא הייתה לו הנחיה איך לבנות … טעות זה
 * לא"): station 3's read_write numbers and meeting 1's 703, 482 and 368. Any
 * board worth X is right (34 tens for 340). Not an exercise that names its
 * blocks or a conversion: compose_break / compose_group / decompose, 26, 347.
 */
export function buildsAnyWay(task: BuildTaskLike | null | undefined): boolean {
  if (!task || task.type !== 'representation') return false;
  const kind = representationKindOfTask(task);
  if (kind) return kind === 'read_write';
  if (task.representationKind) return false;
  return typeof task.id === 'string' && task.id.startsWith('s1_') && !task.requiresGrouping && !task.requiresUngrouping;
}

/**
 * The board is an accepted build of such an exercise: worth the number,
 * however its blocks are spread over the columns. Nothing may call this board
 * wrong — no "10 or more" card, no pulsing "קבצו 10", no AI option.
 */
export function builtAnyWay(task: BuildTaskLike | null | undefined, counts: Partial<Record<Place, number>> | null | undefined): boolean {
  if (!task || !counts || !buildsAnyWay(task) || typeof task.numberA !== 'number') return false;
  const value = (Object.keys(PLACE_VALUES) as Place[]).reduce((sum, q) => sum + (counts[q] ?? 0) * PLACE_VALUES[q], 0);
  return value > 0 && value === task.numberA;
}
