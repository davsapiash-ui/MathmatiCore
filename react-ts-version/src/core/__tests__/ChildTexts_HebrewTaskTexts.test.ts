import { describe, it, expect } from 'vitest';
import {
  getHardcodedCatalogBanks,
  SESSION1_TASKS,
  SOCRATIC_HINTS,
  DEFAULT_SOCRATIC_HINT,
  SUPPORT_CONTENT,
  getDynamicSocraticHint,
} from '@/data/sessionTasks';
import { SESSION_BRANCH_TASKS } from '@/data/sessionBranchTasks';
import { TASKS as DIAGNOSTIC_TASKS } from '@/core/QMatrix';
import { session1Checklist, session1DoneNoteHe } from '@/core/session1Checklist';
import { EMPTY_COUNTS } from '@/core/placeValue';

/**
 * The owner's language rules for the exercise texts the child reads (28.9.2026,
 * from his lecturer and the Ministry's special-education adaptations): the
 * learner is addressed in the second person plural, never "we"; the board has
 * one name, "בית המספרים"; one unit is "יחידה אחת", never "1 יחידות".
 */

/** Owner-approved word for word, still in the first person plural: waiting for his decision. */
const AWAITING_OWNER = ['איפה עלינו לרשום אותה בראש התרגיל'];
const withoutAwaiting = (s: string) => AWAITING_OWNER.reduce((t, a) => t.split(a).join(''), s);

const FIRST_PERSON =
  /בואו נ|(?<![א-ת])(אנחנו|אנו|לנו|עלינו|שלנו|אותנו|נוכל|נחליף|נבדוק|נבנה|נעשה|נרשום|נסמן|נחשוב|נדע|נגלה|נשתמש|נעבור)(?![א-ת])/;

const counts = (c: Partial<typeof EMPTY_COUNTS> = {}) => ({ ...EMPTY_COUNTS, ...c });

/** Every exercise text the child can read: instructions, questions, options, retries. */
function exerciseTexts(): Array<[string, string]> {
  const tasks: any[] = [
    ...getHardcodedCatalogBanks().flatMap((b) => b.tasks),
    ...SESSION1_TASKS,
    ...Object.values(SESSION_BRANCH_TASKS).flatMap((byPath) =>
      Object.values(byPath).flatMap((bank) => [...bank.reinforcement, ...bank.challenge])
    ),
    ...DIAGNOSTIC_TASKS,
  ];
  const out: Array<[string, string]> = [];
  for (const t of tasks) {
    for (const s of [t.instructionHe, t.givenHe, t.questionHe, t.thoughtQuestionHe]) if (s) out.push([t.id, s]);
    for (const c of t.choices ?? []) out.push([t.id, c.textHe]);
    const bd = t.backwardDiagnosis;
    for (const s of [bd?.probeInstructionHe, bd?.subtaskInstructionHe, bd?.hintHe]) if (s) out.push([t.id, s]);
  }
  return out;
}

/** The hint texts of sessionTasks.ts, including every branch of the dynamic hint. */
function hintTexts(): string[] {
  const dynamic = [
    getDynamicSocraticHint('regrouping_fluency', counts({ units: 12 }), {}, {}, {}),
    getDynamicSocraticHint('regrouping_fluency', counts({ tens: 11 }), {}, {}, {}),
    getDynamicSocraticHint('regrouping_fluency', counts({ tens: 5, units: 3 }), { isSubtraction: true, numberA: 53, numberB: 18 }, {}, {}),
    getDynamicSocraticHint('zero_placeholder', counts({ hundreds: 3, units: 5 }), { numberA: 305, numberB: 12 }, {}, {}),
    getDynamicSocraticHint('procedural_fluency', counts(), { numberA: 146, numberB: 235 }, { units: '1' }, {}),
    getDynamicSocraticHint('procedural_fluency', counts(), { numberA: 52, numberB: 27, isSubtraction: true }, { units: '5' }, {}),
  ];
  return [
    ...Object.values(SOCRATIC_HINTS),
    DEFAULT_SOCRATIC_HINT,
    SUPPORT_CONTENT.socratic.titleHe,
    ...SUPPORT_CONTENT.socratic.lines,
    ...dynamic,
  ];
}

function checklistTexts(): string[] {
  const base = { counts: counts(), blocksAddedCount: 0, hasUngrouped: false, undoCount: 0, hasClearedBoard: false };
  const ids = ['s1_sandbox_controlled', 's1_decompose_hundred', 's1_build_305', 's1_undo_trash', 's1_target_347'];
  return [
    ...ids.flatMap((id) => session1Checklist(id, base)?.map((i) => i.label) ?? []),
    ...(session1Checklist('s1_build_305', { ...base, counts: counts({ hundreds: 2, tens: 10, units: 5 }) })?.map((i) => i.label) ?? []),
    session1DoneNoteHe('s1_target_347') ?? '',
  ];
}

describe('the child is addressed in the second person plural, never "we"', () => {
  it('no exercise text, retry, option or checklist line says "we"', () => {
    const found = [
      ...exerciseTexts().filter(([, s]) => FIRST_PERSON.test(withoutAwaiting(s))).map(([id, s]) => `${id}: ${s}`),
      ...checklistTexts().filter((s) => FIRST_PERSON.test(s)),
    ];
    expect(found).toEqual([]);
  });

  it('no hint text in sessionTasks.ts says "we"; the one waiting for the owner is still there', () => {
    const hints = hintTexts();
    expect(hints.filter((s) => FIRST_PERSON.test(withoutAwaiting(s)))).toEqual([]);
    for (const a of AWAITING_OWNER) expect(hints.some((s) => s.includes(a)), a).toBe(true);
  });
});

describe('one name per thing, and "יחידה אחת"', () => {
  it('the hints name the board "בית המספרים", never "הלוח"', () => {
    for (const s of hintTexts()) expect(s).not.toMatch(/(^|[\s(])(ה|ב|על ה|ל)?לוח(?![א-ת])/);
  });

  it('the subtraction hint never says "1 יחידות" or "0 יחידות", for any count', () => {
    for (let need = 1; need <= 9; need++) {
      for (let have = 0; have < need; have++) {
        const text = getDynamicSocraticHint('regrouping_fluency', counts({ tens: 5, units: have }), { isSubtraction: true, numberA: 50, numberB: 10 + need }, {}, {});
        expect(text, `need ${need}, have ${have}`).toContain('צריך לחסר');
        expect(text, `need ${need}, have ${have}`).not.toMatch(/(^|\s)[01] יחידות/);
      }
    }
  });
});
