/**
 * What the learner's task zone says about an exercise of stations 1 and 3–7:
 * a topic heading, one goal line, the steps ("מה עושים:") with the lines that
 * depend on a condition, and the sentences of the done signal.
 *
 * Owner, 8.10.2026: the wording proposal for the learner screens
 * (learner_texts_proposal, sections א and ג) and the task-zone design spec,
 * approved as recommended (PRD 7.13). The rules the proposal sets (section 0):
 *  1. one heading line: "משימת היכרות: <topic>" / "משימה N מתוך 7: <topic>";
 *  2. one goal line — what is given or what is found — that does not repeat a step;
 *  3. "מה עושים:" — numbered only when there is more than one action;
 *  4. a step that depends on a condition ("אם בטור…", "כשמצטברות…") is an
 *     unnumbered line under its step, never ticked (Module 26: the instruction
 *     never says in advance where or how many times to convert);
 *  5. one verb per action: בנו (build), כתבו (write in a box), רשמו (memory
 *     circle only), פרטו / קבצו.
 *
 * Tick rule (section ג): a step says the instruction was carried out, never
 * that the result is right —
 *  - "board": a step that names exactly what to build or convert ticks when
 *    the board is so. It stays ticked through a later step only where that
 *    step changes the board by instruction (PRD 14 §ב rule (1): "למשל כשמוציאים
 *    לבנים") — a subtraction's take-away (takeAwayTrack) and station 7's "הוסיפו
 *    …, ואז הסירו …" (builtTrack); elsewhere it shows the board as it is now;
 *  - "none": a step whose board is the result, or where the learner decides
 *    whether and how much (take away, group every 10, "גלו") — checked on
 *    "ממשיכים" only;
 *  - "fill": the writing step ticks when every box is filled, right or wrong;
 *  - "checklist": station 1's tool steps and the target task 347 keep the
 *    PRD's own checklist (core/session1Checklist.ts), the rule the proceed
 *    button follows.
 *
 * Exercise numbers, boards and checks are the exercise's own; nothing here
 * changes them. The texts are built from the exercise's data and from the
 * station's approved instruction sentences, so they cannot drift from the
 * numbers on the board. Station 2 and station 8 have no guide (PRD, unchanged).
 */
import type { SessionTask } from '@/data/sessionTasks';
import { BLOCK_NAME_HE } from '@/data/taskBuilders';
import { countsEqual, EMPTY_COUNTS, getValue, type Place, type PlaceCounts } from './placeValue';
import { resultBoxCount } from './placeCues';
import { instructionLines } from './instructionLines';
import {
  answerTextFromDigits,
  effectiveArithmetic,
  hiddenDigitsStatus,
  pendingRepresentationConversion,
  type ColumnConversions,
} from '@/application/useWorkspaceStore';

export type TickRule =
  | { kind: 'none' }
  | { kind: 'fill' }
  | { kind: 'checklist'; index: number }
  /**
   * The board's value is `value` (any arrangement of blocks). `sticky`: a later
   * step changes the board by instruction ("הוסיפו …, ואז הסירו …"), so once
   * built it stays built (WorkspaceState.builtTrack) until the board is emptied
   * or the build is undone.
   */
  | { kind: 'boardValue'; value: number; sticky?: true }
  /** The board holds exactly these blocks. `conversionsDone`: and the exercise's conversions are done with the blocks. */
  | { kind: 'boardCounts'; counts: PlaceCounts; conversionsDone?: boolean }
  /** The flexible exercise's "הוספת ייצוג": at least `n` ways recorded. */
  | { kind: 'reps'; n: number };

export interface GuideStep {
  label: string;
  tick: TickRule;
  /** Lines that depend on a condition, under the step: no number, never ticked. */
  subs?: string[];
}

export interface TaskGuide {
  /** The topic after "משימת היכרות:" / "משימה N מתוך 7:" — null where no topic is approved yet. */
  topicHe: string | null;
  goalHe: string | null;
  steps: GuideStep[];
  /**
   * Said in the done box before the proceed sentence, once every step that
   * ticks has ticked: a tool step's sentence (what happened), the target
   * task's "נכון! …347." (PRD), or "כתבתם תשובה." when the last step writes.
   */
  doneNoteHe: string | null;
  /** "נכון! …" — the feedback after "ממשיכים" accepted the answer; null keeps the store's own words. */
  correctHe: string | null;
}

/* ── shared pieces ── */

const RLM = '‏';
/** 4,500 — the thousands comma the instructions use. */
export const fmt = (n: number) => n.toLocaleString('en-US');
const minus = '−';

const WROTE_ANSWER_HE = 'כתבתם תשובה.';
const WRITE_RESULT_HE = 'כתבו את התוצאה בשורת התוצאה.';
const WRITE_MISSING_HE = 'כתבו את הספרה החסרה בתיבה הריקה.';
const BUILD_MINUEND_HE = 'בנו את המחוסר בבית המספרים.';
const TAKE_AWAY_HE = 'הוציאו מבית המספרים את הכמות הנדרשת.';
const BORROW_SUBS_HE = [
  'אם בטור אין מספיק לבנים, אפשר לפרוט לבנה מהטור שמשמאלו: לחצו עליה או גררו אותה אל אותו טור.',
  'אחרי שפרטתם, רשמו בעיגולי הזיכרון כמה לבנים יש עכשיו בכל טור שהשתנה.',
];
const GROUP_SUBS_HE = ['כשמצטברות 10 לבנים בטור, לחצו על הכפתור "קבצו 10" שבראש הטור.', 'רשמו את ההמרה בעיגול הזיכרון.'];

const step = (label: string, tick: TickRule = { kind: 'none' }, subs?: string[]): GuideStep => (subs ? { label, tick, subs } : { label, tick });
const fill: TickRule = { kind: 'fill' };

/** "713 + 94" with the instruction's own formatting, taken from its text. */
function exerciseText(task: SessionTask): string {
  const a = fmt(task.numberA ?? 0);
  const b = fmt(task.numberB ?? 0);
  return `${a} ${task.isSubtraction ? minus : '+'} ${b}`;
}

function resultOf(task: SessionTask): number {
  const a = task.numberA ?? 0;
  const b = task.numberB ?? 0;
  return task.isSubtraction ? a - b : a + b;
}

/* ── station 1 (proposal, section א) ── */

const STATION1: Record<string, Omit<TaskGuide, 'doneNoteHe'> & { doneNoteHe?: string | null }> = {
  s1_sandbox_controlled: {
    topicHe: 'מכירים את הלבנים',
    goalHe: 'ברוכים הבאים למתמטיקאור! בתחנה הראשונה מכירים את הכלים: שחקו וחקרו בחופשיות.',
    steps: [step('', { kind: 'checklist', index: 0 })],
    doneNoteHe: 'כל לבנה שגררתם שינתה את הספרה בטור שלה.',
    correctHe: null,
  },
  s1_decompose_hundred: {
    topicHe: 'פורטים לבנה ללבנים קטנות',
    goalHe: 'בבית המספרים יש 230. עקבו אחר השינוי כשפורטים לבנה.',
    steps: [step('', { kind: 'checklist', index: 0 })],
    doneNoteHe: 'הלבנים השתנו, אבל המספר נשאר 230.',
    correctHe: null,
  },
  s1_build_305: {
    topicHe: 'בונים את המספר 305',
    goalHe: 'כשתצליחו, הסתכלו בבית המספרים: איזו ספרה מופיעה ליד שם כל טור?',
    // The second item appears only for a child who built 305 another way (session1Checklist).
    steps: [step('', { kind: 'checklist', index: 0 }), step('', { kind: 'checklist', index: 1 })],
    doneNoteHe: 'בטור העשרות אין לבנים, ולכן ליד שמו מופיעה הספרה 0.',
    correctHe: null,
  },
  s1_undo_trash: {
    topicHe: 'מבטלים פעולה ומנקים',
    goalHe: 'גלו איך חוזרים צעד אחורה ואיך מתחילים מחדש.',
    steps: [step('', { kind: 'checklist', index: 0 }), step('', { kind: 'checklist', index: 1 })],
    doneNoteHe: 'עכשיו אתם יודעים לבטל פעולה ולנקות את בית המספרים. מותר לנסות ולטעות.',
    correctHe: null,
  },
  s1_r_words703: {
    topicHe: 'ממילים לספרות',
    goalHe: 'המספר הוא שבע מאות ושלוש.',
    steps: [step('בנו את המספר בבית המספרים', { kind: 'boardValue', value: 703 }), step('כתבו אותו בספרות בשורת התוצאה', fill)],
    correctHe: 'נכון! במספר שבע מאות ושלוש אין עשרות, ולכן בטור העשרות כותבים 0: 703.',
  },
  s1_r_value368: {
    topicHe: 'מוצאים את ערך הספרה',
    goalHe: 'המספר הוא 368. מה הערך של הספרה 6 במספר הזה?',
    steps: [step('בנו את המספר 368 בבית המספרים', { kind: 'boardValue', value: 368 }), step('כתבו את הערך של הספרה 6 בשורת התוצאה', fill)],
    correctHe: 'נכון! הספרה 6 נמצאת בטור העשרות, ולכן הערך שלה 60.',
  },
  s1_r_words482: {
    topicHe: 'ממילים לספרות',
    goalHe: 'המספר הוא ארבע מאות שמונים ושתיים.',
    steps: [step('בנו את המספר בבית המספרים', { kind: 'boardValue', value: 482 }), step('כתבו אותו בספרות בשורת התוצאה', fill)],
    correctHe: 'נכון! ארבע מאות שמונים ושתיים כותבים בספרות 482.',
  },
  s1_r_group26: {
    topicHe: 'מקבצים לבני יחידה לעשרות',
    goalHe: 'בטור היחידות יש לבני יחידה.',
    steps: [
      // PRD 14 §ב, task 8: sentences name the button "קבצו 10" (Module 7, the button's name in sentences).
      step('קבצו כל 10 לבני יחידה ללבנת עשרת אחת: לחצו על הכפתור "קבצו 10" שבראש הטור'),
      step('כתבו בשורת התוצאה כמה עשרות וכמה יחידות קיבלתם', fill),
    ],
    correctHe: 'נכון! הלבנים מסודרות אחרת, אבל המספר נשאר 26.',
  },
  s1_target_347: {
    topicHe: 'בודקים אם המספר משתנה',
    goalHe: 'משימת היעד: איזה מספר, לדעתכם, מייצגות הלבנים לאחר הפריטה?',
    steps: [0, 1, 2].map((index) => step('', { kind: 'checklist', index })),
    // The PRD's sentence (Module 14 §ב, task 9), said in the box as soon as the checklist is done.
    doneNoteHe: 'נכון! הלבנים מסודרות אחרת, אבל המספר נשאר 347.',
    correctHe: null,
  },
  s1_t8: {
    topicHe: 'מחברים בעזרת הלבנים',
    goalHe: 'פתרו: 713 + 94.',
    steps: [
      step('בנו בבית המספרים את 713 ואת 94', { kind: 'boardValue', value: 807 }, [
        // PRD 14 §ב, task 10: the station's own condition line.
        GROUP_SUBS_HE[0],
        'רשמו את ההמרה בעיגול הזיכרון שמעל הטור שאליו עברה הלבנה החדשה.',
      ]),
      step('כתבו את התוצאה בשורת התוצאה', fill),
    ],
    correctHe: `נכון! קיבצתם 10 לבני עשרת ללבנת מאה אחת, ולכן בטור העשרות 0: ${RLM}713 + 94 = 807.`,
  },
  s1_r_sub61: {
    topicHe: 'מחסרים בעזרת הלבנים',
    goalHe: `פתרו: 61 ${minus} 24.`,
    steps: [
      step('בנו את 61 בבית המספרים', { kind: 'boardValue', value: 61 }),
      step('גררו לפח האשפה את הלבנים שאתם מחסרים', { kind: 'none' }, BORROW_SUBS_HE),
      step('כתבו את התוצאה בשורת התוצאה', fill),
    ],
    correctHe: `נכון! ${RLM}61 ${minus} 24 = 37, וגם בבית המספרים נשארו 37.`,
  },
  s1_r_sub806: {
    topicHe: 'מחסרים בעזרת הלבנים',
    goalHe: `פתרו: 806 ${minus} 351.`,
    steps: [
      step('בנו את 806 בבית המספרים', { kind: 'boardValue', value: 806 }),
      step('גררו לפח האשפה את הלבנים שאתם מחסרים', { kind: 'none' }, BORROW_SUBS_HE),
      step('כתבו את התוצאה בשורת התוצאה', fill),
    ],
    correctHe: `נכון! ${RLM}806 ${minus} 351 = 455, וגם בבית המספרים נשארו 455.`,
  },
};

/* ── stations 3–7 (proposal, section א, built per kind of exercise) ── */

/** One heading for every exercise of the station (proposal: "אותה כותרת לכל שבעת תרגילי התחנה"). */
const STATION_TOPIC: Partial<Record<number, string>> = { 4: 'מחברים במאונך', 5: 'מחסרים במאונך', 6: 'מחסרים במאונך' };

const PLACE_BY_NAME: Record<string, Place> = Object.fromEntries(Object.entries(BLOCK_NAME_HE).map(([p, n]) => [n, p as Place]));
const ORDER: Place[] = ['units', 'tens', 'hundreds', 'thousands'];
const above = (p: Place) => ORDER[ORDER.indexOf(p) + 1];
const below = (p: Place) => ORDER[ORDER.indexOf(p) - 1];
const counts = (c: Partial<PlaceCounts>): PlaceCounts => ({ ...EMPTY_COUNTS, ...c });
const noDot = (s: string) => s.replace(/[.]$/, '');

/** "פרטו לבנת מאה אחת לעשר לבני עשרת." / "קבצו שוב 10 לבני מאה ללבנת אלף אחת." → the block the conversion starts from. */
function conversionOf(line: string): { verb: 'break' | 'group'; from: Place } | null {
  const m = line.match(/(פרטו|קבצו)(?: שוב)? (?:לבנת (\S+) אחת|10 לבני (\S+))/);
  if (!m) return null;
  const from = PLACE_BY_NAME[m[2] ?? m[3]];
  return from ? { verb: m[1] === 'פרטו' ? 'break' : 'group', from } : null;
}

/** compose_break / compose_group (taskBuilders): build, convert (once or twice), say which number the blocks make. */
function composeGuide(task: SessionTask): TaskGuide {
  const lines = instructionLines(task.instructionHe);
  const conversions = lines.map(conversionOf);
  const convLines = lines.filter((_, i) => conversions[i]);
  const convs = conversions.filter((c): c is NonNullable<typeof c> => c !== null);
  const question = lines.find((l) => l.endsWith('?')) ?? null;
  // The boards along the way, from the board the exercise ends on back to the one built.
  const boards: PlaceCounts[] = [counts(task.requiredCounts ?? {})];
  for (let i = convs.length - 1; i >= 0; i--) {
    const c = { ...boards[0] };
    const { verb, from } = convs[i];
    if (verb === 'break') {
      c[from] += 1;
      c[below(from)] -= 10;
    } else {
      c[from] += 10;
      c[above(from)] -= 1;
    }
    boards.unshift(c);
  }
  const fromNames = [...new Set(convs.map((c) => c.from))];
  const isBreak = convs[0]?.verb === 'break';
  const topicHe = isBreak
    ? `פורטים ${fromNames.map((p) => `לבנת ${BLOCK_NAME_HE[p]}`).join(' ו')}`
    : `מקבצים לבני ${BLOCK_NAME_HE[fromNames[0] ?? 'units']} ל${GROUP_TARGET_HE[above(fromNames[0] ?? 'units')]}`;
  return {
    topicHe,
    goalHe: question,
    steps: [
      step(noDot(lines[0]), { kind: 'boardCounts', counts: boards[0] }),
      ...convLines.map((l, i) =>
        step(noDot(l), { kind: 'boardCounts', counts: boards[i + 1], conversionsDone: i === convLines.length - 1 })
      ),
      step('כתבו בשורת התוצאה איזה מספר מייצגות הלבנים עכשיו', fill),
    ],
    doneNoteHe: WROTE_ANSWER_HE,
    correctHe: `נכון! הלבנים מסודרות אחרת, אבל המספר נשאר ${fmt(task.numberA ?? 0)}.`,
  };
}

/** "מקבצים לבני יחידה לעשרות" (station 1) — the place a group of ten becomes, in the plural. */
const GROUP_TARGET_HE: Record<Place, string> = { units: 'יחידות', tens: 'עשרות', hundreds: 'מאות', thousands: 'אלפים' };

/** read_write: "בנו בבית המספרים את המספר <words>. כתבו אותו בספרות בשורת התוצאה." — like 703 and 482. */
function readWriteGuide(task: SessionTask): TaskGuide {
  const words = task.instructionHe.match(/את המספר (.+?)\. כתבו/)?.[1] ?? '';
  const value = task.numberA ?? 0;
  return {
    topicHe: 'ממילים לספרות',
    goalHe: `המספר הוא ${words}.`,
    steps: [step('בנו את המספר בבית המספרים', { kind: 'boardValue', value }), step('כתבו אותו בספרות בשורת התוצאה', fill)],
    doneNoteHe: WROTE_ANSWER_HE,
    correctHe: `נכון! ${words} כותבים בספרות ${fmt(value)}.`,
  };
}

/** Station 4's addition (S4_ADD) and its missing result digit (S4_MISSING_TENS). */
function additionGuide(task: SessionTask, sessionNumber: number): TaskGuide {
  const lines = instructionLines(task.instructionHe);
  const ex = exerciseText(task);
  const r = resultOf(task);
  const missing = Boolean(task.revealedResultDigits?.length);
  return {
    topicHe: STATION_TOPIC[sessionNumber] ?? null,
    goalHe: lines[0],
    steps: [
      step(`בנו בבית המספרים את ${fmt(task.numberA ?? 0)} ואת ${fmt(task.numberB ?? 0)}`, { kind: 'boardValue', value: r }, GROUP_SUBS_HE),
      step(noDot(missing ? WRITE_MISSING_HE : WRITE_RESULT_HE), fill),
    ],
    doneNoteHe: WROTE_ANSWER_HE,
    correctHe: missing ? missingDigitCorrectHe(task) : `נכון! ${RLM}${ex} = ${fmt(r)}, וגם בבית המספרים בניתם ${fmt(r)}.`,
  };
}

/** Stations 5–6's subtraction (S5_SUB / S6_SUB) and its missing result digit (S6_MISSING_TENS). */
function subtractionGuide(task: SessionTask, sessionNumber: number): TaskGuide {
  const lines = instructionLines(task.instructionHe);
  const ex = exerciseText(task);
  const r = resultOf(task);
  const missing = Boolean(task.revealedResultDigits?.length);
  return {
    topicHe: STATION_TOPIC[sessionNumber] ?? null,
    goalHe: lines[0],
    steps: [
      step(noDot(BUILD_MINUEND_HE), { kind: 'boardValue', value: task.numberA ?? 0 }),
      step(noDot(TAKE_AWAY_HE), { kind: 'none' }, BORROW_SUBS_HE),
      step(noDot(missing ? WRITE_MISSING_HE : WRITE_RESULT_HE), fill),
    ],
    doneNoteHe: WROTE_ANSWER_HE,
    correctHe: missing ? missingDigitCorrectHe(task) : `נכון! ${RLM}${ex} = ${fmt(r)}, וגם בבית המספרים נשארו ${fmt(r)}.`,
  };
}

/** "נכון! הספרה החסרה היא 8: 386 + 271 = 657." — one missing digit only; more keep the store's words. */
function missingDigitCorrectHe(task: SessionTask): string | null {
  const a = task.numberA ?? 0;
  const b = task.numberB ?? 0;
  const r = resultOf(task);
  const hidden = [...(task.hiddenDigits?.a ?? []).map((p) => ({ n: a, p })), ...(task.hiddenDigits?.b ?? []).map((p) => ({ n: b, p }))];
  const missingResult = task.revealedResultDigits ? ORDER.filter((p) => r >= (p === 'units' ? 0 : 10 ** ORDER.indexOf(p)) && !task.revealedResultDigits!.includes(p)).map((p) => ({ n: r, p })) : [];
  const all = task.hiddenDigits ? hidden : missingResult;
  if (all.length !== 1) return null;
  const { n, p } = all[0];
  const d = Math.floor(n / 10 ** ORDER.indexOf(p)) % 10;
  return `נכון! הספרה החסרה היא ${d}: ${RLM}${fmt(a)} ${task.isSubtraction ? minus : '+'} ${fmt(b)} = ${fmt(r)}.`;
}

/** A skeleton (hidden operand digits): the exercise is the goal; "גלו …" and "כתבו …" are the steps. */
function skeletonGuide(task: SessionTask, sessionNumber: number): TaskGuide {
  const lines = instructionLines(task.instructionHe);
  const [goal, act, ...rest] = lines;
  const parts = (act ?? '').split(/,? (?=וכתבו )/);
  const discover = parts[0] ?? '';
  const write = parts[1] ? parts[1].replace(/^ו/, '') : '';
  const count = (task.hiddenDigits?.a?.length ?? 0) + (task.hiddenDigits?.b?.length ?? 0);
  return {
    topicHe: STATION_TOPIC[sessionNumber] ?? (count > 1 ? 'מגלים ספרות חסרות' : 'מגלים ספרה חסרה'),
    goalHe: goal ?? null,
    steps: [
      // "רוצים לחזור צעד אחד אחורה? לחצו על כפתור ביטול הפעולה ↺." stays, as a line under the step.
      step(noDot(discover), { kind: 'none' }, rest.length ? [rest.join(' ')] : undefined),
      ...(write ? [step(noDot(write), fill)] : []),
    ],
    doneNoteHe: WROTE_ANSWER_HE,
    correctHe: missingDigitCorrectHe(task),
  };
}

/**
 * Everything else (the flexible exercise, the missing part, station 7's error
 * analysis and its add-then-remove exercises, the comparison of two
 * exercises): the instruction's own sentences, in its order, by the rules of
 * section 0 — a question or a statement is the goal, an action is a step, a
 * writing step ticks when filled. No topic is approved for these yet.
 */
function sentencesGuide(task: SessionTask, sessionNumber: number): TaskGuide {
  const lines = instructionLines(task.instructionHe);
  const goal: string[] = [];
  const steps: GuideStep[] = [];
  let reps = 0;
  const isAction = (l: string) => /^(בנו|כתבו|רשמו|פרטו|קבצו|גררו|לחצו|הוציאו|גלו|מצאו את|הוסיפו|השאירו|אחר כך|בכל טור)/.test(l);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    // "רוצים לחזור צעד אחד אחורה? לחצו על כפתור ביטול הפעולה ↺." — a line under the last step.
    if (/^רוצים /.test(l) && steps.length) {
      const tip = [l, lines[i + 1]].filter(Boolean).join(' ');
      steps[steps.length - 1] = { ...steps[steps.length - 1], subs: [...(steps[steps.length - 1].subs ?? []), tip] };
      i++;
      continue;
    }
    if (l.endsWith('?') || !isAction(l)) {
      goal.push(l);
      continue;
    }
    if (/"הוספת ייצוג"/.test(l)) {
      reps++;
      steps.push(step(noDot(l), { kind: 'reps', n: reps }));
      continue;
    }
    const build = l.match(/^בנו (?:בבית המספרים )?את המספר ([\d,]+)(?: בבית המספרים)?\.$/);
    if (build) {
      const value = Number(build[1].replace(/,/g, ''));
      // A later instruction that adds or removes blocks (station 7's add-then-remove).
      const changesLater = lines.slice(i + 1).some((x) => /^(הוסיפו|הסירו|הוציאו)/.test(x));
      steps.push(step(noDot(l), changesLater ? { kind: 'boardValue', value, sticky: true } : { kind: 'boardValue', value }));
      continue;
    }
    steps.push(step(noDot(l), /^כתבו /.test(l) ? fill : { kind: 'none' }));
  }
  const writes = steps.some((s) => s.tick.kind === 'fill');
  return {
    topicHe: STATION_TOPIC[sessionNumber] ?? null,
    goalHe: goal.join(' ') || null,
    steps,
    doneNoteHe: writes ? WROTE_ANSWER_HE : null,
    correctHe: null,
  };
}

/** The task zone's guide for an exercise, or null (station 2, station 8, an exercise of another kind). */
export function taskGuide(task: SessionTask | null | undefined, sessionNumber: number): TaskGuide | null {
  if (!task || sessionNumber === 2 || sessionNumber === 8) return null;
  if (sessionNumber === 1) {
    const g = STATION1[task.id];
    return g ? { doneNoteHe: g.steps.some((s) => s.tick.kind === 'fill') ? WROTE_ANSWER_HE : null, ...g } : null;
  }
  if (task.representationKind === 'read_write') return readWriteGuide(task);
  if (task.representationKind === 'decompose') {
    // "בנו … את המספר 450 מלבני עשרת בלבד" names exactly the blocks: it ticks when the board is so.
    const g = sentencesGuide(task, sessionNumber);
    return { ...g, steps: g.steps.map((st, i) => (i === 0 ? { ...st, tick: { kind: 'boardCounts', counts: counts(task.requiredCounts ?? {}) } } : st)) };
  }
  if (task.representationKind === 'compose_break' || task.representationKind === 'compose_group') return composeGuide(task);
  if (task.type === 'vertical_addition' || task.type === 'addition_simple') {
    if (task.hiddenDigits) return skeletonGuide(task, sessionNumber);
    const shaped = task.isSubtraction ? /מחוסר בבית המספרים/.test(task.instructionHe) : /ייצגו את המספרים בעזרת לבנים/.test(task.instructionHe);
    if (shaped) return task.isSubtraction ? subtractionGuide(task, sessionNumber) : additionGuide(task, sessionNumber);
  }
  return sentencesGuide(task, sessionNumber);
}

/** What the read-aloud button of the guide block reads: topic, goal, then each step with its lines. */
export function guideSpeechHe(heading: string, guide: TaskGuide, labels: string[]): string {
  const parts = [heading, guide.goalHe ?? '', ...guide.steps.flatMap((s, i) => [labels[i] ?? s.label, ...(s.subs ?? [])])];
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (/[.!?:]$/.test(p) ? p : `${p}.`))
    .join(' ');
}

/* ── ticks (proposal, section ג) ── */

export interface GuideTickState {
  sessionNumber: number;
  isASD: boolean;
  counts: PlaceCounts;
  answerDigits: Partial<Record<Place, string>>;
  operandDigits: { a: Partial<Record<Place, string>>; b: Partial<Record<Place, string>> };
  probeAnswer: string;
  q3Reps: unknown[];
  conversionsByColumn: ColumnConversions;
  takeAwayTrack: { taskId: string; held: boolean } | null;
  /** The board has held a sticky step's number in this exercise (WorkspaceState.builtTrack). */
  builtTrack: { taskId: string; value: number; held: boolean } | null;
  /** Station 1's checklist for this exercise (session1Checklist), when it has one. */
  checklist: { label: string; done: boolean }[] | null;
}

/** Every box the exercise asks the learner to write in holds a digit — right or wrong. */
export function answerFilled(task: SessionTask, s: GuideTickState): boolean {
  if (task.type === 'missing_element') return s.probeAnswer.trim() !== '';
  if (task.type === 'representation') {
    if (task.representationKind) return answerTextFromDigits(s.answerDigits) !== '';
    const value = typeof task.correctAnswer === 'number' ? task.correctAnswer : task.numberA ?? 0;
    return ORDER.slice(0, String(value).length).every((p) => (s.answerDigits[p] ?? '') !== '');
  }
  if (task.type === 'vertical_addition' || task.type === 'addition_simple') {
    const { a, b, target } = effectiveArithmetic(task, s.isASD);
    if (task.hiddenDigits) return hiddenDigitsStatus(s, task, a, b).complete;
    if (task.revealedResultDigits?.length) {
      const missing = ORDER.slice(0, String(target).length).filter((p) => !task.revealedResultDigits!.includes(p));
      return missing.every((p) => (s.answerDigits[p] ?? '') !== '');
    }
    // PRD 14 §ב, tick rule (3): "צעד הכתיבה מסומן כשכל התיבות מולאו" — every
    // box of the result row (resultBoxCount), the same for every answer, so
    // the tick never tells how long the answer is. Whether a subtraction's
    // highest box may stay empty when the result is shorter than the row
    // (204 − 112 = 92 in three boxes) is the owner's to decide (review O3).
    const boxes = resultBoxCount(s.sessionNumber, a, b, target);
    return ORDER.slice(0, boxes).every((p) => (s.answerDigits[p] ?? '') !== '');
  }
  return false;
}

/**
 * Whether each step's instruction is carried out (proposal §ג; PRD 14 §ב tick
 * rule (1)). Everything is derived from the workspace's own saved state, so a
 * tick survives a refresh (PRD: the learner returns "לאותו שלב עם אותה
 * התקדמות") and goes away when the learner undoes that very step:
 *  - a built number stays built through a later step that changes the board by
 *    instruction: a subtraction's minuend through takeAwayTrack, station 7's
 *    add-then-remove through builtTrack (both saved with the workspace and
 *    brought back by undo). Any other "build N" step shows whether the board is
 *    N now: the steps after it (writing, grouping) do not change its value, so a
 *    board that is no longer N is not built (chief re-review S-A);
 *  - in a build-and-convert chain, a step is done when its board is on screen
 *    or a later board step of the chain is done (the board after a break shows
 *    that the blocks before it were built).
 */
export function guideTicksNow(guide: TaskGuide, task: SessionTask, s: GuideTickState): boolean[] {
  const now = guide.steps.map((st) => {
    const t = st.tick;
    switch (t.kind) {
      case 'none':
        return false;
      case 'fill':
        return answerFilled(task, s);
      case 'checklist':
        return Boolean(s.checklist?.[t.index]?.done);
      case 'reps':
        return s.q3Reps.length >= t.n;
      case 'boardValue':
        if (task.isSubtraction && t.value === (task.numberA ?? -1) && s.takeAwayTrack?.taskId === task.id && s.takeAwayTrack.held) return true;
        if (t.sticky && s.builtTrack?.taskId === task.id && s.builtTrack.value === t.value && s.builtTrack.held) return true;
        return getValue(s.counts) === t.value;
      case 'boardCounts':
        if (!countsEqual(s.counts, t.counts)) return false;
        return (
          !t.conversionsDone ||
          pendingRepresentationConversion({ conversionsByColumn: s.conversionsByColumn, counts: s.counts }, { id: task.id, requiredCounts: task.requiredCounts }) === null
        );
    }
  });
  // A build-and-convert chain: a later board step done means the earlier ones were.
  for (let i = guide.steps.length - 2; i >= 0; i--) {
    if (guide.steps[i].tick.kind !== 'boardCounts' || now[i]) continue;
    now[i] = guide.steps.some((st, j) => j > i && st.tick.kind === 'boardCounts' && now[j]);
  }
  return now;
}

/**
 * The number a sticky "build N" step of this exercise waits for, or null —
 * the store keeps builtTrack for it (useWorkspaceStore, nextBuiltTrack).
 */
export function stickyBuildValue(task: SessionTask | null | undefined, sessionNumber: number): number | null {
  const step = taskGuide(task, sessionNumber)?.steps.find((st) => st.tick.kind === 'boardValue' && st.tick.sticky);
  return step && step.tick.kind === 'boardValue' ? step.tick.value : null;
}

/** A step that ticks ("none" steps are checked on "ממשיכים" only). */
export const ticks = (st: GuideStep) => st.tick.kind !== 'none';

