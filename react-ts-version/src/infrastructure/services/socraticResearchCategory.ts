/**
 * The `error_category` a static card carries into SOCRATIC_CARD_SHOWN
 * (PRD Appendix A §3; Module 18's error-category distribution).
 *
 * Research data does not change with the card's wording (owner's standing
 * rule: anything that changes a research measure beyond what he approved is
 * reported, not shipped). The computed cards of 28.9.2026
 * (staticSocraticCards.ts) changed what the child reads; the category each
 * opening records stays the value the card resolver on main (acccee7c)
 * recorded for the same exercise and board — reproduced here from that
 * resolver's decision order, and locked against its output by
 * `__tests__/SocraticResearchCategory_SameAsMain.test.ts`.
 *
 * The one approved change (owner, 28.9.2026, שהB.1): a missing-element task
 * (s3_r_t7) records its card's own 'conceptual' — it used to get a
 * subtraction card with no category (null).
 */

import { builtAnyWay } from '@/data/representationLocks';

type Category = 'calculation' | 'procedural' | 'conceptual' | null;
type Counts = { units: number; tens: number; hundreds: number; thousands: number };

/** The categories main's per-session cards (מסמך 03 §3.3–3.8) carried. */
const SESSION_CARD: Record<string, Category> = {
  s3_r_card: 'conceptual', s3_g_card: 'conceptual', s3_card: 'conceptual',
  s4_card: 'procedural', s5_card: 'procedural', s6_card: 'conceptual', s7_card: 'procedural', s8_card: 'procedural',
};

/** Main's per-exercise cards: meeting 1 only, none with a category. */
const EXERCISE_CARDS_WITHOUT_CATEGORY = new Set([
  's1_sandbox_controlled', 's1_target_347', 's1_r_group26', 's1_t8', 's1_r_sub61', 's1_r_sub806',
]);

function sessionCardKeys(id?: string): string[] {
  const m = id ? /^s([3-8])_(?:([gr])_)?(?:t\d+|reinforce_\d+|challenge_\d+)$/.exec(id) : null;
  if (!m) return [];
  const [, session, path] = m;
  return path ? [`s${session}_${path}_card`, `s${session}_card`] : [`s${session}_card`];
}

/** Did main's live board reading answer (its cards had no category)? */
function mainLiveCardFires(task: any, targetNode: string, c: Counts): boolean {
  if (task?.id === 's1_sandbox_controlled' || task?.type === 'session1_intro') return false;
  const required = (task?.requiredCounts ?? {}) as Partial<Counts>;
  // The live card's own rule (SocraticEngine.analyzeLiveBoardState): a board
  // worth the number of a "build the number X" exercise is not crowded
  // (owner, 4.10.2026).
  const accepted = builtAnyWay(task, c);
  const goal = (p: 'units' | 'tens' | 'hundreds') =>
    accepted || task?.isSubtraction === true || task?.type === 'flexible_decomp' || (required[p] ?? 0) >= 10;
  if ((c.units >= 10 && !goal('units')) || (c.tens >= 10 && !goal('tens')) || (c.hundreds >= 10 && !goal('hundreds'))) return true;

  const isSubtraction = task?.isSubtraction ||
    (typeof task?.instructionHe === 'string' && (task.instructionHe.includes('חסר') || task.instructionHe.includes('הפחת'))) ||
    (typeof task?.exercise === 'string' && task.exercise.includes('-')) ||
    targetNode === 'subtraction_regrouping';
  let subtrahend = task?.numberB;
  let minuend: number | undefined = typeof task?.numberA === 'number' ? task.numberA : undefined;
  if (typeof task?.exercise === 'string' && task.exercise.includes('-')) {
    const parts = task.exercise.split('-');
    if (!subtrahend && parts[1]) {
      const parsed = parseInt(parts[1].trim(), 10);
      if (!isNaN(parsed)) subtrahend = parsed;
    }
    if (minuend === undefined && parts[0]) {
      const parsed = parseInt(parts[0].replace(/\D/g, ''), 10);
      if (!isNaN(parsed)) minuend = parsed;
    }
  }
  if (isSubtraction && subtrahend) {
    const unitsB = subtrahend % 10;
    const tensB = Math.floor((subtrahend % 100) / 10);
    const hundredsB = Math.floor((subtrahend % 1000) / 100);
    const boardValue = c.units + c.tens * 10 + c.hundreds * 100 + c.thousands * 1000;
    if (boardValue === 0) return true;
    const known = minuend !== undefined;
    const unitsA = known ? minuend! % 10 : c.units;
    const tensA = known ? Math.floor((minuend! % 100) / 10) : c.tens;
    const hundredsA = known ? Math.floor((minuend! % 1000) / 100) : c.hundreds;
    const needUnits = unitsA < unitsB;
    const needTens = tensA - (needUnits ? 1 : 0) < tensB;
    const needHundreds = hundredsA - (needTens ? 1 : 0) < hundredsB;
    if (needUnits && unitsB > 0 && c.units < unitsB) return true;
    if (needTens && tensB > 0 && c.tens < tensB) return true;
    if (needHundreds && hundredsB > 0 && c.hundreds < hundredsB) return true;
  }
  return targetNode === 'zero_placeholder' && String(task?.numberA || '').includes('0') && c.tens === 0;
}

export function researchErrorCategory(task: any, counts?: Counts): Category {
  if (task?.type === 'missing_element') return 'conceptual';
  const c = counts || { units: 0, tens: 0, hundreds: 0, thousands: 0 };
  const targetNode: string = task?.targetNode || (task?.requiresGrouping ? 'regrouping_fluency' : task?.requiresUngrouping ? 'subtraction_regrouping' : 'basic_addition_fluency');
  if (mainLiveCardFires(task, targetNode, c)) return null;

  const id: string | undefined = task?.id;
  const normalized = id ? id.replace(/^(s\d+)_[gr]_t(\d+)$/, '$1_t$2') : '';
  if ((id && EXERCISE_CARDS_WITHOUT_CATEGORY.has(id)) || EXERCISE_CARDS_WITHOUT_CATEGORY.has(normalized)) return null;
  if (task?.type === 'session1_intro') return null;

  const a = task?.numberA;
  const b = task?.numberB;
  if (a !== undefined && b !== undefined) {
    if (task?.isSubtraction) return 'procedural';
    const unitsSum = (a % 10) + (b % 10);
    const tensSum = Math.floor((a % 100) / 10) + Math.floor((b % 100) / 10);
    if (tensSum >= 10 || task?.requiresGrouping || unitsSum >= 10) return 'procedural';
  }
  for (const key of sessionCardKeys(id)) if (key in SESSION_CARD) return SESSION_CARD[key];
  return null;
}
