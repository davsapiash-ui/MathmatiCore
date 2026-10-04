/**
 * The review of 30.9.2026 on the coaching cards (branch claude/coaching-question-hints):
 *  1. no engine card of stations 1 and 3–7 gives a column's current block count;
 *  2. the new block names ("3 לבני מאה", "לבנת מאה אחת") are read as counts;
 *  3. C1 and C7 wait until the conversion the instruction names is done
 *     (s7_g_t1: both groupings); before that, a card about the conversion;
 *  4. an empty board in stations 3 and 7: build first what the instruction names;
 *  5. C6 once per exercise; s7_g_t1's box and "התקדם" wait for BOTH groupings;
 *  6. the single answer box records only what changed since the last press —
 *     at least one wrong digit per wrong press — and the last press survives a reload.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const sent = vi.hoisted(() => ({ events: [] as any[] }));
vi.mock('@/infrastructure/services/FirebaseSyncService', async () => {
  const actual = await vi.importActual<any>('@/infrastructure/services/FirebaseSyncService');
  return {
    ...actual,
    emitTelemetry: (e: any) => {
      sent.events.push(e);
      return Promise.resolve();
    },
  };
});

// The store first: FirebaseSyncService (mocked above) and the store import each other.
import { useWorkspaceStore, getActiveTasks, staticCardContextFor, pendingRepresentationConversion } from '@/application/useWorkspaceStore';
import { SocraticEngine, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import {
  exerciseCard,
  statesBoardCount,
  countGroupsIn,
  revealsSecretInCounts,
  contradictsRequiredRepresentation,
  secretNumbersOf,
  wrongHintViolation,
  type StaticCardContext,
} from '@/infrastructure/services/staticSocraticCards';
import { useAuthStore } from '@/application/useAuthStore';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { EMPTY_COUNTS, type Place, type PlaceCounts } from '@/core/placeValue';
import { approvePath } from '@/test/approvedPath';

type Counts = { units: number; tens: number; hundreds: number; thousands: number };
const EMPTY: Counts = { units: 0, tens: 0, hundreds: 0, thousands: 0 };
const PLACES: Place[] = ['units', 'tens', 'hundreds', 'thousands'];
const digitsOf = (n: number): Counts => ({
  units: n % 10, tens: Math.floor(n / 10) % 10, hundreds: Math.floor(n / 100) % 10, thousands: Math.floor(n / 1000) % 10,
});

const bank: SessionTask[] = [];
for (const m of [3, 4, 5, 6, 7] as const) {
  for (const p of ['green_path', 'remediation_path'] as const) {
    bank.push(...getSessionTasks(m, p), ...getSessionBranchTasks(m, 'reinforcement', p), ...getSessionBranchTasks(m, 'challenge', p));
  }
}
const byId = (id: string) => {
  const t = bank.find((x) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  return t;
};
const ws = () => useWorkspaceStore.getState();
const textsOf = (h: SocraticHintResponse) => [h.questionHe, ...h.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])];
const rows = (h: SocraticHintResponse) => h.choices.map((c) => [c.textHe, c.feedbackHe, c.isCorrect]);
const q = (task: any, counts: Counts = EMPTY, ctx?: StaticCardContext) => SocraticEngine.getSynchronousTaskHint(task, counts, ctx);

function load(task: SessionTask, profile?: string) {
  ws().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1, ...(profile ? { support_profile_id: profile } : {}) } } as any);
  useWorkspaceStore.setState({
    activeSupportProfileId: profile ?? null,
    sessionNumber: Number(task.id[1]), dynamicTasks: [task, { ...task, id: `${task.id}_next` }], standardTaskIdx: 0, flowStatus: 'task',
    helpState: 'none', currentState: 'PROBLEM_ACTIVE', taskStartTime: Date.now(),
  } as any);
  sent.events.length = 0;
}
const drop = (place: Place, n = 1) => {
  for (let i = 0; i < n; i++) ws().applyDrop({ source: 'palette', sourcePlace: place, target: { kind: 'column', place } });
};
const buildBlocks = (c: Partial<PlaceCounts>) => PLACES.forEach((p) => drop(p, c[p] ?? 0));
const ctxOf = (task: SessionTask) => staticCardContextFor(ws(), task.id, task);
const served = (task: SessionTask) => q(task, ws().counts, ctxOf(task));
const digitsEntered = () => sent.events.filter((e) => e.event_type === 'DIGIT_ENTERED');
const judged = (events: any[]) => events.map((e) => [e.column_index, e.details.digit_value, e.details.is_correct]);

beforeEach(() => {
  sent.events.length = 0;
});

/* ── 1 ── */

describe('1. a column\'s current block count is not written in the engine\'s card', () => {
  it('statesBoardCount reads the counts the board holds now, in every wording', () => {
    const counts = { ...EMPTY, units: 7, tens: 12, hundreds: 3 };
    expect(statesBoardCount(['בטור היחידות יש 7 יחידות. מה עושים?'], counts)).toBe('units');
    expect(statesBoardCount(['יש 12 לבני עשרת'], counts)).toBe('tens');
    expect(statesBoardCount(['יש 12 לבנים בטור העשרות'], counts)).toBe('tens');
    expect(statesBoardCount(['בטור העשרות יש 12 לבנים.'], counts)).toBe('tens');
    expect(statesBoardCount(['בונים 3 לבני מאה'], counts)).toBe('hundreds');
    // Not what the board holds now.
    expect(statesBoardCount(['בטור היחידות יש 8 יחידות'], counts)).toBeNull();
    // The names of a regrouping and a threshold are not counts.
    const ten = { ...EMPTY, units: 10, tens: 1, hundreds: 1 };
    expect(statesBoardCount(['מקבצים 10 יחידות לעשרת אחת'], ten)).toBeNull();
    expect(statesBoardCount(['לחצו על לבנת מאה אחת'], ten)).toBeNull();
    expect(statesBoardCount(['בטור העשרות יש 12 לבנים או יותר. מה עושים?'], counts)).toBeNull();
    expect(statesBoardCount(['בטור היחידות אין אף יחידה'], counts)).toBeNull();
  });

  const aiCard = (question: string) => ({
    data: {
      error_category: 'procedural',
      guiding_question: question,
      options: [
        { id: 'opt_1', option_text: 'מחברים את הלבנים שבטור היחידות', feedback_text: 'נכון מאוד! התחילו בטור היחידות.', is_correct: true },
        { id: 'opt_2', option_text: 'מתחילים מהטור השמאלי', feedback_text: 'רמז: אם בטור היחידות יהיו 10 יחידות או יותר, מה יקרה בטור העשרות?', is_correct: false },
        { id: 'opt_3', option_text: 'מוחקים לבנים', feedback_text: 'רמז: אם תמחקו לבנים, האם המספר יישאר אותו מספר?', is_correct: false },
      ],
    },
  });
  const ask = (task: any, sessionNumber: number, counts: Counts) =>
    SocraticEngine.fetchGroundedGeminiSocraticQuery({
      currentTask: task,
      targetNode: 'regrouping_fluency',
      activeColumnName: 'יחידות',
      counts,
      qMatrixAnchor: q(task, counts),
      monitoring: { sessionNumber },
    });
  afterEach(() => { vi.restoreAllMocks(); });

  it('stations 3–7 and station 1: the card that counts for the child is refused, and the static card is shown', async () => {
    const t = byId('s4_g_t1'); // 1,245 + 328
    const question = 'בתרגיל 1,245 + 328, בטור היחידות יש 6 יחידות. מה עושים?';
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(aiCard(question));
    for (const m of [1, 3, 4, 5, 6, 7]) {
      expect(await ask(t, m, { ...EMPTY, units: 6, tens: 4 }), `meeting ${m}`).toBeNull();
    }
    // The same text where the board holds another count is not a count of the board.
    expect(await ask(t, 4, { ...EMPTY, units: 13, tens: 6 })).not.toBeNull();
  });

  it('s3_r_t1: "בונים 3 לבני מאה ו-4 לבני עשרת" gives away 340 and is refused', async () => {
    const t = byId('s3_r_t1');
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue({
      data: {
        error_category: 'conceptual',
        guiding_question: 'איך בונים את המספר שבהנחיה?',
        options: [
          { id: 'opt_1', option_text: 'בונים 3 לבני מאה ו-4 לבני עשרת', feedback_text: 'נכון מאוד! בנו אותן.', is_correct: true },
          { id: 'opt_2', option_text: 'בונים 4 לבני מאה', feedback_text: 'רמז: כמה מאות יש במספר?', is_correct: false },
          { id: 'opt_3', option_text: 'כותבים בלי לבנות', feedback_text: 'רמז: מה ההנחיה מבקשת לעשות קודם?', is_correct: false },
        ],
      },
    });
    expect(await ask(t, 3, EMPTY)).toBeNull();
  });
});

/* ── 2 ── */

describe('2. the block names of 30.9.2026 are read as counts', () => {
  it('"3 לבני מאה ו-4 לבני עשרת", "לבנת מאה אחת", "12 לבנים עשרת"', () => {
    expect(countGroupsIn('בונים 3 לבני מאה ו-4 לבני עשרת')).toEqual([{ hundreds: 3, tens: 4 }]);
    expect(countGroupsIn('לבנת מאה אחת ו-4 לבני עשרת')).toEqual([{ hundreds: 1, tens: 4 }]);
    expect(countGroupsIn('12 לבנים עשרת ו-5 לבני יחידה')).toEqual([{ tens: 12, units: 5 }]);
    expect(countGroupsIn('5 לבני אלף, 2 לבני מאה ו-3 לבני עשרת')).toEqual([{ thousands: 5, hundreds: 2, tens: 3 }]);
    // The old words still read.
    expect(countGroupsIn('3 מאות ו-4 עשרות')).toEqual([{ hundreds: 3, tens: 4 }]);
  });

  it('s3_r_t1 (340 in words): the blocks give the number away, and marking them wrong contradicts the instruction', () => {
    const t = byId('s3_r_t1');
    const secrets = secretNumbersOf(t);
    expect(secrets).toContain(340);
    expect(revealsSecretInCounts(['בונים 3 לבני מאה ו-4 לבני עשרת'], secrets)).toBe(340);
    expect(revealsSecretInCounts(['לבנת מאה אחת ועוד 6 לבני עשרת'], [160])).toBe(160);
    expect(contradictsRequiredRepresentation(t, [{ textHe: 'בונים 3 לבני מאה ו-4 לבני עשרת', isCorrect: false }])).toBe(true);
    expect(contradictsRequiredRepresentation(t, [{ textHe: 'בונים 2 לבני מאה ו-14 לבני עשרת', isCorrect: true }])).toBe(true);
    expect(contradictsRequiredRepresentation(t, [{ textHe: 'בונים 3 לבני מאה ו-4 לבני עשרת', isCorrect: true }])).toBe(false);
    // A step is not a choice of blocks.
    expect(contradictsRequiredRepresentation(t, [{ textHe: 'פורטים לבנת מאה אחת לעשר לבני עשרת', isCorrect: false }])).toBe(false);
  });
});

/* ── 3 ── */

const BREAK_Q = 'נסו לחשוב: ההנחיה מבקשת לפרוט לבנת מאה אחת לעשר לבני עשרת. איך פורטים אותה?';
const C1_Q = 'נסו לחשוב: לפני הפריטה בניתם מספר. האם הפריטה שינתה אותו?';
const C7_Q = 'נסו לחשוב: לפני ההקבצה בניתם מספר. האם ההקבצה שינתה אותו?';
const C7_Q_TWO = 'נסו לחשוב: לפני ההקבצות בניתם מספר. האם ההקבצות שינו אותו?';

describe('3. C1 and C7 wait for the conversion; before it, the conversion the instruction names', () => {
  it('the break card: the block and the click, in the instruction\'s words; no count, no answer', () => {
    const t = byId('s3_r_t2'); // 3 hundreds and 4 tens, break a hundred → 340
    const c = exerciseCard(t, { ...EMPTY, hundreds: 3, tens: 4 }, { conversionDone: false, pendingConversion: 'tens' })!;
    expect(c.questionHe).toBe(BREAK_Q);
    expect(rows(c)).toEqual([
      ['לוחצים על לבנת מאה', 'נכון מאוד! לחצו על לבנת מאה כדי לפרוט אותה.', true],
      ['מוסיפים לבני עשרת חדשות', 'רמז: אם תוסיפו לבנים חדשות, האם המספר יישאר אותו מספר?', false],
      ['כותבים את המספר בלי לפרוט', 'רמז: מה ההנחיה מבקשת לעשות לפני שכותבים את המספר?', false],
    ]);
    // Since 2.10.2026 (audit D5) every card has a kind: its next level is
    // what the click gives ("מה מופיע בבית המספרים כשלוחצים על לבנת מאה?").
    expect(c.cardKind).toBe('break_as_asked');
    expect(exerciseCard(t, { ...EMPTY, hundreds: 3, tens: 4 }, { conversionDone: false, pendingConversion: 'tens', shownKinds: ['break_as_asked'] })!.questionHe)
      .toBe('נסו לחשוב: מה מופיע בבית המספרים כשלוחצים על לבנת מאה?');
    expect(wrongHintViolation(c)).toBeNull();
    expect(revealsSecretInCounts(textsOf(c), secretNumbersOf(t))).toBeNull();
    expect(textsOf(c).join(' ')).not.toMatch(/340/);
  });

  it('every break and grouping of the banks: the block the instruction breaks or the column it groups', () => {
    const expected: Record<string, string> = {
      s3_r_t4: 'נסו לחשוב: ההנחיה מבקשת לפרוט לבנת עשרת אחת לעשר לבני יחידה. איך פורטים אותה?',
      s3_g_t2: 'נסו לחשוב: ההנחיה מבקשת לפרוט לבנת אלף אחת לעשר לבני מאה. איך פורטים אותה?',
      s3_g_t4: 'נסו לחשוב: ההנחיה מבקשת לפרוט לבנת אלף אחת לעשר לבני מאה. איך פורטים אותה?',
      s7_r_t1: 'נסו לחשוב: ההנחיה מבקשת לקבץ 10 לבני עשרת ללבנת מאה אחת. איך מקבצים אותן?',
      s7_g_reinforce_2: 'נסו לחשוב: ההנחיה מבקשת לקבץ 10 לבני מאה ללבנת אלף אחת. איך מקבצים אותן?',
    };
    // The blocks the instruction builds, before the conversion.
    const builtBefore: Record<string, Partial<Counts>> = {
      s3_r_t4: { tens: 8, units: 5 }, s3_g_t2: { thousands: 3, hundreds: 4 }, s3_g_t4: { thousands: 5, hundreds: 2, tens: 3 },
      s7_r_t1: { tens: 12, units: 5 }, s7_g_reinforce_2: { hundreds: 14, tens: 3 },
    };
    for (const [id, question] of Object.entries(expected)) {
      const t = byId(id);
      const c = exerciseCard(t, { ...EMPTY, ...builtBefore[id] }, { conversionDone: false })!;
      expect(c.questionHe, id).toBe(question);
      expect(wrongHintViolation(c), id).toBeNull();
      expect(t.instructionHe, id).toContain(question.replace('נסו לחשוב: ההנחיה מבקשת ל', '').replace(/\. איך .*$/, '').replace(/^פרוט/, 'פרטו').replace(/^קבץ/, 'קבצו'));
    }
    // s3_g_t4's second break: the hundred, once the thousand is broken.
    const second = exerciseCard(byId('s3_g_t4'), { ...EMPTY, thousands: 4, hundreds: 12, tens: 3 }, { conversionDone: false, pendingConversion: 'tens' })!;
    expect(second.questionHe).toBe(BREAK_Q);
    // The button of the grouping, named as S4_ADD names it.
    const g = exerciseCard(byId('s7_r_t1'), { ...EMPTY, tens: 12, units: 5 }, { conversionDone: false, pendingConversion: 'tens' })!;
    expect(rows(g)).toEqual([
      ['לוחצים על הכפתור "קבצו 10" שבראש הטור', 'נכון מאוד! לחצו על הכפתור "קבצו 10" שבראש טור העשרות.', true],
      ['מוסיפים לבנת מאה חדשה', 'רמז: אם תוסיפו לבנה חדשה, האם המספר יישאר אותו מספר?', false],
      ['כותבים את המספר בלי לקבץ', 'רמז: מה ההנחיה מבקשת לעשות לפני שכותבים את המספר?', false],
    ]);
  });

  it('s7_g_t1, the second grouping: "לקבץ שוב", as the instruction says it', () => {
    const t = byId('s7_g_t1');
    expect(t.instructionHe).toContain('קבצו שוב 10 לבני מאה ללבנת אלף אחת');
    const c = exerciseCard(t, { ...EMPTY, thousands: 1, hundreds: 15 }, { conversionDone: false, pendingConversion: 'hundreds', conversionAgain: true })!;
    expect(c.questionHe).toBe('נסו לחשוב: ההנחיה מבקשת לקבץ שוב 10 לבני מאה ללבנת אלף אחת. איך מקבצים אותן?');
  });

  it('through the store: s3_r_t2 gets the break card until the child breaks, then C1', () => {
    const t = byId('s3_r_t2');
    load(t);
    buildBlocks({ hundreds: 3, tens: 4 });
    expect(ctxOf(t)).toMatchObject({ conversionDone: false, pendingConversion: 'tens', conversionAgain: false });
    expect(served(t).questionHe).toBe(BREAK_Q);
    ws().splitBlockClick('hundreds');
    expect(ctxOf(t)).toMatchObject({ conversionDone: true, pendingConversion: null });
    expect(served(t).questionHe).toBe(C1_Q);
    // Undo takes the break back: the break card again.
    ws().undo();
    expect(served(t).questionHe).toBe(BREAK_Q);
  });

  it('through the store: s7_g_t1 waits for BOTH groupings before C7', () => {
    const t = byId('s7_g_t1');
    load(t);
    drop('hundreds', 25);
    expect(ctxOf(t)).toMatchObject({ conversionDone: false, pendingConversion: 'hundreds', conversionAgain: false });
    ws().groupColumnClick('hundreds');
    expect(ctxOf(t)).toMatchObject({ conversionDone: false, pendingConversion: 'hundreds', conversionAgain: true });
    // 15 hundreds: the live grouping card speaks, never C7.
    expect(served(t).questionHe).not.toBe(C7_Q);
    expect(served(t).questionHe).not.toBe(C7_Q_TWO);
    ws().groupColumnClick('hundreds');
    expect(ctxOf(t)).toMatchObject({ conversionDone: true, pendingConversion: null });
    // Two groupings: the plural, as the instruction (owner, 4.10.2026).
    expect(served(t).questionHe).toBe(C7_Q_TWO);
  });

  it('without the store (no context), C1 and C7 speak once something is built, as before', () => {
    expect(q(byId('s3_r_t2'), { ...EMPTY, hundreds: 2, tens: 14 }).questionHe).toBe(C1_Q);
    expect(q(byId('s7_r_t1'), { ...EMPTY, hundreds: 1, tens: 2, units: 5 }).questionHe).toBe(C7_Q);
  });
});

/* ── 4 ── */

const BUILD_Q = 'נסו לחשוב: בית המספרים עדיין ריק. מה עושים קודם?';

describe('4. an empty board in stations 3 and 7: build first what the instruction names', () => {
  it('the card: no count, no number, the wrong options ask', () => {
    const c = q(byId('s3_r_t1'), EMPTY);
    expect(c.questionHe).toBe(BUILD_Q);
    expect(rows(c)).toEqual([
      ['בונים בבית המספרים את מה שההנחיה מבקשת', 'נכון מאוד! קראו את ההנחיה. בנו בבית המספרים את מה שהיא מבקשת.', true],
      ['כותבים מספר בשורת התוצאה', 'רמז: מה ההנחיה מבקשת לעשות לפני שכותבים?', false],
      ['מנחשים את התשובה', 'רמז: מה אפשר לבנות בבית המספרים במקום לנחש?', false],
    ]);
    expect(textsOf(c).join(' ')).not.toMatch(/\d/);
  });

  it('where "which number is built" or C1/C7 would have spoken to an empty board', () => {
    for (const id of ['s3_r_t1', 's3_g_t1', 's3_r_reinforce_1', 's3_r_t2', 's3_g_t4', 's7_r_t1', 's7_g_t1', 's7_g_reinforce_2', 's7_r_t6', 's7_g_t5', 's7_g_t6']) {
      expect(q(byId(id), EMPTY).questionHe, id).toBe(BUILD_Q);
    }
  });

  it('C2 keeps speaking on an empty board, C3 does not; a built board is unchanged; station 4 builds first too', () => {
    expect(q(byId('s3_r_t3'), EMPTY).questionHe).toBe('נסו לחשוב: כמה לבני עשרת שוות ללבנת מאה אחת?');
    // C3 ("יש טור שאין בו לבנים") says nothing to a board with no blocks at all (review, 30.9.2026).
    for (const id of ['s3_r_t5', 's3_g_t5']) {
      expect(q(byId(id), EMPTY).questionHe, id).toBe(BUILD_Q);
      expect(q(byId(id), { ...EMPTY, ...byId(id).requiredCounts }).questionHe, id).toBe('נסו לחשוב: יש טור שאין בו לבנים. מה כותבים במספר בשביל הטור הזה?');
    }
    // 2.10.2026 (audit D10): a board that is not yet the number is compared with
    // its words first; "which number is built" speaks once it is.
    expect(q(byId('s3_r_t1'), { ...EMPTY, hundreds: 3 }).questionHe).toBe('נסו לחשוב: איך בודקים שבית המספרים מראה את המספר שבהנחיה?');
    expect(q(byId('s3_r_t1'), { ...EMPTY, hundreds: 3, tens: 4 }).questionHe).toBe('נסו לחשוב: איך יודעים איזה מספר בנוי בבית המספרים?');
    // Changed 1.10.2026 (owner, via the coordinator: every misleading cell gets
    // a fitting card; analysts' matrix 4.2): the carry card spoke of 10 blocks
    // in a column of an empty board. Station 4 builds first too; its second
    // card names what is built.
    expect(q(byId('s4_g_t1'), EMPTY).questionHe).toBe(BUILD_Q);
    expect(q(byId('s4_g_t1'), EMPTY, { shownKinds: ['build_first'] }).questionHe).toBe('נסו לחשוב: מה בונים בבית המספרים בתרגיל 1,245 + 328?');
  });
});

/* ── 5 ── */

describe('5. C6 once per exercise; s7_g_t1 waits for both groupings', () => {
  it('C6, then the column-by-column check (owner\'s D9, 1.10.2026), then the exercise\'s own addition card', () => {
    for (const id of ['s7_r_t5', 's7_g_t4']) {
      const t = byId(id);
      // A partial board (the first number alone gets "which number is missing" since 1.10.2026).
      const counts = { ...EMPTY, tens: 1 };
      expect(exerciseCard(t, counts, {})!.cardKind, id).toBe('error_analysis');
      // D9: the second card checks the student's work column by column, and names no column.
      const second = exerciseCard(t, counts, { shownKinds: ['error_analysis'] })!;
      expect(second.cardKind, id).toBe('error_analysis_2');
      expect(second.questionHe, id).toBe('נסו לחשוב: איך בודקים בכל טור אם התלמיד צדק?');
      expect(second.questionHe, id).not.toMatch(/טור (היחידות|העשרות|המאות|האלפים)/);
      const third = exerciseCard(t, counts, { shownKinds: ['error_analysis', 'error_analysis_2'] })!;
      expect(third.questionHe, id).toContain(`בתרגיל ${id === 's7_r_t5' ? '247 + 135' : '4,857 + 3,568'}`);
    }
  });

  it('the lock lists the hundreds twice; one grouping leaves one pending', () => {
    const t = byId('s7_g_t1');
    load(t);
    drop('hundreds', 25);
    expect(pendingRepresentationConversion(ws(), t)).toBe('hundreds');
    ws().groupColumnClick('hundreds');
    expect(pendingRepresentationConversion(ws(), t)).toBe('hundreds');
    ws().groupColumnClick('hundreds');
    expect(pendingRepresentationConversion(ws(), t)).toBeNull();
    ws().undo();
    expect(pendingRepresentationConversion(ws(), t)).toBe('hundreds');
  });

  it('enhanced support: the box opens only after BOTH groupings', () => {
    const t = byId('s7_g_t1');
    load(t, 'enhanced_cognitive_support');
    drop('hundreds', 25);
    expect(ws().isRepresentationAnswerLocked()).toBe(true);
    ws().groupColumnClick('hundreds');
    expect(ws().isRepresentationAnswerLocked()).toBe(true);
    ws().groupColumnClick('hundreds');
    expect(ws().isRepresentationAnswerLocked()).toBe(false);
  });

  it('"התקדם" asks for the child\'s own two groupings: one grouping onto a hand-built thousand is not enough', () => {
    const t = byId('s7_g_t1');
    load(t);
    buildBlocks({ thousands: 1, hundreds: 15 });
    ws().groupColumnClick('hundreds');
    expect(ws().counts).toEqual({ ...EMPTY_COUNTS, thousands: 2, hundreds: 5 });
    ws().setRepresentationAnswer('2500');
    ws().proceed();
    expect(ws().feedback?.sub ?? '').toContain('המשימה היא לקבץ בעצמכם');
    expect(sent.events.some((e) => e.event_type === 'PROBLEM_COMPLETE')).toBe(false);
  });

  it('the count of groupings survives a reload of the snapshot, and an older snapshot counts a done column once', async () => {
    const { normalizeColumnConversions } = await import('@/application/useWorkspaceStore');
    const t = byId('s7_g_t1');
    load(t);
    drop('hundreds', 25);
    ws().groupColumnClick('hundreds');
    const saved = normalizeColumnConversions(JSON.parse(JSON.stringify(ws().conversionsByColumn)));
    expect(saved.times?.composed?.hundreds).toBe(1);
    expect(pendingRepresentationConversion({ conversionsByColumn: saved }, t)).toBe('hundreds');
    const older = normalizeColumnConversions({ composed: { hundreds: true } });
    expect(pendingRepresentationConversion({ conversionsByColumn: older }, t)).toBe('hundreds');
    expect(pendingRepresentationConversion({ conversionsByColumn: older }, byId('s7_g_reinforce_2'))).toBeNull();
  });
});

/* ── 6 ── */

describe('6. the single answer box: only what changed, at least one wrong digit per wrong press', () => {
  it('a re-press records the wrong digits that changed; an unchanged wrong answer records one', () => {
    load(byId('s3_r_t1'));
    buildBlocks({ hundreds: 3, tens: 4 });
    ws().setRepresentationAnswer('304');
    ws().proceed();
    expect(judged(digitsEntered())).toEqual([[0, 4, false], [1, 0, false], [2, 3, true]]);
    ws().setRepresentationAnswer('314'); // the tens 1: changed, still wrong; the units 4: unchanged, wrong
    ws().proceed();
    expect(judged(digitsEntered().slice(3))).toEqual([[1, 1, false]]);
    ws().proceed(); // the same wrong answer
    expect(judged(digitsEntered().slice(4))).toEqual([[0, 4, false]]);
    ws().setRepresentationAnswer('340');
    ws().proceed();
    expect(judged(digitsEntered().slice(5))).toEqual([[0, 0, true], [1, 4, true]]);
  });

  it('the last press is in the snapshot: after a reload, unchanged digits are not recorded again', () => {
    const svc = firebaseSyncService as any;
    ws().resetWorkspace();
    approvePath('remediation_path');
    ws().initSession(3, false, 0);
    const idx = getActiveTasks(ws()).findIndex((x) => x.id === 's3_r_t1');
    ws().initSession(3, false, idx);
    expect(getActiveTasks(ws())[ws().standardTaskIdx].id).toBe('s3_r_t1');
    buildBlocks({ hundreds: 3, tens: 4 });
    ws().setRepresentationAnswer('304');
    sent.events.length = 0;
    ws().proceed();
    expect(digitsEntered()).toHaveLength(3);
    const saved = JSON.parse(JSON.stringify(svc.getSyncableWorkspaceState()));
    expect(saved.lastSubmittedAnswer).toBe('304');
    ws().resetWorkspace();
    approvePath('remediation_path');
    ws().restoreSession(saved);
    expect(ws().lastSubmittedAnswer).toBe('304');
    sent.events.length = 0;
    ws().setRepresentationAnswer('340');
    ws().proceed();
    // Only the units and the tens changed; the hundreds 3 is not recorded again.
    expect(judged(digitsEntered())).toEqual([[0, 0, true], [1, 4, true]]);
    // A snapshot without it (older, or nothing pressed yet): the next press records every digit.
    ws().restoreSession({ ...saved, lastSubmittedAnswer: undefined });
    expect(ws().lastSubmittedAnswer).toBeNull();
  });
});

/* ── Re-review of d315978e ── */

const BUILD_BEFORE_GROUP = 'נסו לחשוב: מה עושים לפני שמקבצים?';
const BUILD_BEFORE_BREAK = 'נסו לחשוב: מה עושים לפני שפורטים?';
const REBUILD_GROUP = 'נסו לחשוב: ההנחיה מבקשת שתקבצו בעצמכם. מה עושים עכשיו?';

describe('the conversion card follows what the board allows', () => {
  it('s7_r_t1 with 5 tens: the "קבצו 10" button is not there yet — build all the instruction\'s blocks first', () => {
    const t = byId('s7_r_t1');
    const c = exerciseCard(t, { ...EMPTY, tens: 5 }, { conversionDone: false, pendingConversion: 'tens' })!;
    expect(c.questionHe).toBe(BUILD_BEFORE_GROUP);
    expect(rows(c)).toEqual([
      ['בונים בבית המספרים את כל הלבנים שההנחיה מבקשת', 'נכון מאוד! בנו את כל הלבנים שבהנחיה. אחר כך לחצו על הכפתור "קבצו 10" שבראש טור העשרות.', true],
      ['מקבצים את הלבנים שכבר נמצאות בטור העשרות', 'רמז: כמה לבני עשרת מקבצים ללבנת מאה אחת?', false],
      ['כותבים את המספר בלי לקבץ', 'רמז: מה ההנחיה מבקשת לעשות לפני שכותבים את המספר?', false],
    ]);
    expect(wrongHintViolation(c)).toBeNull();
    // Through the store.
    load(t);
    buildBlocks({ tens: 5 });
    expect(served(t).questionHe).toBe(BUILD_BEFORE_GROUP);
  });

  it('s7_r_t1 with 1 hundred, 2 tens and 5 units built by hand: build the instruction\'s blocks again, then group', () => {
    const t = byId('s7_r_t1');
    load(t);
    buildBlocks({ hundreds: 1, tens: 2, units: 5 });
    const c = served(t);
    expect(c.questionHe).toBe(REBUILD_GROUP);
    expect(rows(c)).toEqual([
      ['בונים מחדש את הלבנים שבהנחיה, ואחר כך מקבצים', 'נכון מאוד! לחצו על פח האשפה כדי לנקות את בית המספרים. בנו את הלבנים שבהנחיה. אחר כך לחצו על הכפתור "קבצו 10" שבראש טור העשרות.', true],
      ['כותבים את המספר, כי הלבנים כבר מסודרות', 'רמז: מה ההנחיה מבקשת שתעשו בעצמכם לפני שכותבים?', false],
      ['מוסיפים לבנת מאה חדשה', 'רמז: אם תוסיפו לבנה חדשה, האם המספר יישאר אותו מספר?', false],
    ]);
    expect(revealsSecretInCounts(textsOf(c), secretNumbersOf(t))).toBeNull();
    expect(textsOf(c).join(' ')).not.toMatch(/125/);
  });

  it('s3_r_t2 with only tens: no hundred to break — build the instruction\'s blocks first', () => {
    const t = byId('s3_r_t2');
    load(t);
    buildBlocks({ tens: 4 });
    const c = served(t);
    expect(c.questionHe).toBe(BUILD_BEFORE_BREAK);
    expect(rows(c)).toEqual([
      ['בונים בבית המספרים את כל הלבנים שההנחיה מבקשת', 'נכון מאוד! בנו את כל הלבנים שבהנחיה. אחר כך לחצו על לבנת מאה כדי לפרוט אותה.', true],
      ['פורטים לבנה אחרת שכבר נמצאת בבית המספרים', 'רמז: איזו לבנה ההנחיה מבקשת לפרוט?', false],
      ['כותבים את המספר בלי לפרוט', 'רמז: מה ההנחיה מבקשת לעשות לפני שכותבים את המספר?', false],
    ]);
    // The final board built by hand (2 hundreds, 14 tens): build again, then break.
    load(t);
    buildBlocks({ hundreds: 2, tens: 14 });
    expect(served(t).questionHe).toBe('נסו לחשוב: ההנחיה מבקשת שתפרטו בעצמכם. מה עושים עכשיו?');
    expect(served(t).choices[0].feedbackHe).toBe('נכון מאוד! לחצו על פח האשפה כדי לנקות את בית המספרים. בנו את הלבנים שבהנחיה. אחר כך לחצו על לבנת מאה כדי לפרוט אותה.');
  });
});

describe('statesBoardCount: what the exercise itself shows is not refused', () => {
  it('the active column\'s digits and the instruction\'s numbers are skipped; "N לבני ה-X" is read', () => {
    expect(statesBoardCount(['בטור היחידות יש 5 יחידות'], { ...EMPTY, units: 5 }, [5, 8])).toBeNull();
    expect(statesBoardCount(['בנו 12 לבני עשרת'], { ...EMPTY, tens: 12 }, [12, 5, 10])).toBeNull();
    expect(statesBoardCount(['בטור העשרות יש 12 לבני העשרת'], { ...EMPTY, tens: 12 })).toBe('tens');
    expect(statesBoardCount(['יש 7 לבני היחידה'], { ...EMPTY, units: 7 })).toBe('units');
    expect(countGroupsIn('5 לבני העשרת ו-3 לבני היחידה')).toEqual([{ tens: 5, units: 3 }]);
  });

  afterEach(() => { vi.restoreAllMocks(); });
  const aiCard = (question: string) => ({
    data: {
      error_category: 'procedural',
      guiding_question: question,
      options: [
        { id: 'opt_1', option_text: 'לוחצים על הכפתור "קבצו 10" שבראש הטור', feedback_text: 'נכון מאוד! לחצו על הכפתור.', is_correct: true },
        { id: 'opt_2', option_text: 'מוחקים לבנים', feedback_text: 'רמז: אם תמחקו לבנים, האם המספר יישאר אותו מספר?', is_correct: false },
        { id: 'opt_3', option_text: 'כותבים את המספר בלי לקבץ', feedback_text: 'רמז: מה ההנחיה מבקשת לעשות לפני שכותבים את המספר?', is_correct: false },
      ],
    },
  });
  const ask = (task: any, counts: Counts, column = 'יחידות') =>
    SocraticEngine.fetchGroundedGeminiSocraticQuery({
      currentTask: task, targetNode: 'regrouping_fluency', activeColumnName: column, counts,
      qMatrixAnchor: q(task, counts), monitoring: { sessionNumber: Number(task.id[1]) },
    });

  it('the engine: the instruction\'s "12 לבני עשרת" and the active column\'s digit are accepted', async () => {
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(aiCard('ההנחיה מבקשת לבנות 12 לבני עשרת. מה עושים עכשיו?'));
    expect(await ask(byId('s7_r_t1'), { ...EMPTY, tens: 12, units: 5 }, 'עשרות')).not.toBeNull();
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(aiCard('בתרגיל 1,245 + 328, בטור היחידות מחברים 5 יחידות ועוד 8 יחידות. מה עושים?'));
    expect(await ask(byId('s4_g_t1'), { ...EMPTY, units: 5, tens: 4 })).not.toBeNull();
    // A count that is neither: still refused.
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(aiCard('בטור העשרות יש 7 לבני העשרת. מה עושים?'));
    expect(await ask(byId('s7_r_t1'), { ...EMPTY, tens: 7, units: 5 }, 'עשרות')).toBeNull();
  });
});

describe('an older save of s7_g_t1 (no count of groupings) does not leave the child stuck', () => {
  it('the final board with the column marked converted counts both groupings as done', async () => {
    const { normalizeColumnConversions } = await import('@/application/useWorkspaceStore');
    const t = byId('s7_g_t1');
    const older = normalizeColumnConversions({ composed: { hundreds: true } });
    expect(pendingRepresentationConversion({ conversionsByColumn: older, counts: { ...EMPTY, thousands: 2, hundreds: 5 } }, t)).toBeNull();
    expect(pendingRepresentationConversion({ conversionsByColumn: older, counts: { ...EMPTY, thousands: 1, hundreds: 15 } }, t)).toBe('hundreds');
    // Not converted at all: still pending, whatever the board.
    expect(pendingRepresentationConversion({ conversionsByColumn: normalizeColumnConversions({}), counts: { ...EMPTY, thousands: 2, hundreds: 5 } }, t)).toBe('hundreds');
    // A new save knows the count: one grouping onto a hand-built thousand is one.
    const counted = normalizeColumnConversions({ composed: { hundreds: true }, times: { composed: { hundreds: 1 } } });
    expect(pendingRepresentationConversion({ conversionsByColumn: counted, counts: { ...EMPTY, thousands: 2, hundreds: 5 } }, t)).toBe('hundreds');
    // Through the store, as a reload leaves it.
    load(t);
    useWorkspaceStore.setState({ conversionsByColumn: older, counts: { ...EMPTY, thousands: 2, hundreds: 5 } } as any);
    ws().setRepresentationAnswer('2500');
    ws().proceed();
    expect(sent.events.some((e) => e.event_type === 'PROBLEM_COMPLETE')).toBe(true);
  });
});
