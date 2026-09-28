/**
 * The owner's decisions of 28.9.2026 (register: שהC.1 option א, שהC.2,
 * שהB.2, שהB.4), and the "four errors" count as מסמך 03 writes it: "ארבע
 * מחיקות או הקלדות שגויות רצופות באותו טור" (שהB.3 — deletions count nothing —
 * departs from that wording and is not applied). Each clause of each rule has
 * a test here, driven through the real store; telemetry is captured at
 * emitTelemetry.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import {
  useWorkspaceStore,
  nextDigitErrorStreak,
  nextDigitErrorStreakOnDelete,
  socraticCardColumnIndex,
} from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { REPRESENTATION_LOCKS } from '@/data/representationLocks';
import { EMPTY_COUNTS, type Place, type PlaceCounts } from '@/core/placeValue';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { describeEvent } from '@/infrastructure/services/LearnerJourneyService';

const ws = () => useWorkspaceStore.getState();
const flush = () => new Promise((r) => setTimeout(r, 0));
const UNIT: Record<Place, number> = { units: 1, tens: 10, hundreds: 100, thousands: 1000 };

function allTasks(): SessionTask[] {
  const out: SessionTask[] = [];
  for (const m of [1, 3, 4, 5, 6, 7, 8] as const) {
    for (const p of ['green_path', 'remediation_path'] as const) {
      out.push(...(getSessionTasks(m as any, p) ?? []));
      out.push(...getSessionBranchTasks(m, 'reinforcement', p), ...getSessionBranchTasks(m, 'challenge', p));
    }
  }
  return out;
}
const byId = (id: string) => {
  const t = allTasks().find((x) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  return t;
};

function load(meeting: number, task: SessionTask, profile?: string) {
  ws().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1, ...(profile ? { support_profile_id: profile } : {}) } } as any);
  useWorkspaceStore.setState({
    // Module 19 §ב: the lock reads the profile applied at the exercise's start.
    activeSupportProfileId: profile ?? null,
    sessionNumber: meeting, dynamicTasks: [task], standardTaskIdx: 0, flowStatus: 'task',
    helpState: 'none', currentState: 'PROBLEM_ACTIVE', socraticTriggerReason: null, socraticCardPlace: null,
    operandDigits: { a: {}, b: {} }, // resetWorkspace keeps them; a real task load (resetTaskInteraction) clears them
  } as any);
  sent.events.length = 0;
}
const board = (c: Partial<PlaceCounts>) => useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, ...c } });
const boardOf = (n: number) =>
  board({ thousands: Math.floor(n / 1000) % 10, hundreds: Math.floor(n / 100) % 10, tens: Math.floor(n / 10) % 10, units: n % 10 });
const proceed = () => ws().proceed();
const sub = () => ws().feedback?.sub ?? '';
const completed = () => sent.events.filter((e) => e.event_type === 'PROBLEM_COMPLETE');

/* ── RULE 1 — skeleton exercises (שהC.1 option א) ─────────────────────────── */

const NEW_BOARD_TEXT = 'הלבנים שבבית המספרים אינן מראות את תוצאת התרגיל ואינן מראות את המספר שגיליתם. בדקו שוב.';
const OLD_BOARD_TEXT = 'הלבנים שבבית המספרים אינן מתאימות לתוצאת התרגיל. בדקו שוב.';
const WRONG_DIGIT_TEXT = 'הספרה החסרה שכתבתם אינה נכונה. בדקו שוב בעזרת הלבנים בלוח.';

describe('Rule 1 — skeleton exercises of meetings 3–7 accept the result or the discovered number', () => {
  // s7_r_t2: 31▢ + 254 = 568, the units of the first addend hidden.
  const t = () => byId('s7_r_t2');
  beforeEach(() => load(7, t()));

  it('the numbers are what the test assumes', () => {
    expect([t().numberA, t().numberB, t().correctAnswer, t().hiddenDigits]).toEqual([314, 254, 568, { a: ['units'] }]);
  });

  it('a board showing the result, with the right digit, is solved (PROBLEM_COMPLETE)', () => {
    boardOf(568);
    ws().setOperandDigit('a', 'units', '4');
    proceed();
    expect(ws().feedback?.correct).toBe(true);
    expect(completed()).toHaveLength(1);
  });

  it('a board showing the discovered number (314), with the right digit, is solved', () => {
    boardOf(314);
    ws().setOperandDigit('a', 'units', '4');
    proceed();
    expect(ws().feedback?.correct).toBe(true);
    expect(completed()).toHaveLength(1);
  });

  it('any other board, with the right digit, fails with the new text (no numbers in it)', () => {
    for (const other of [254, 567, 315]) {
      load(7, t());
      boardOf(other);
      ws().setOperandDigit('a', 'units', '4');
      proceed();
      expect(ws().feedback?.correct).toBe(false);
      expect(sub()).toBe(NEW_BOARD_TEXT);
      expect(completed()).toHaveLength(0);
    }
    expect(NEW_BOARD_TEXT).not.toMatch(/\d/);
  });

  it("a wrong digit with the child's candidate on the board gets the wrong-digit text, before the board check", () => {
    boardOf(315); // the child built 315 and wrote 5
    ws().setOperandDigit('a', 'units', '5');
    proceed();
    expect(sub()).toBe(WRONG_DIGIT_TEXT);
    // …and a wrong digit on an unrelated board: still the digit first.
    load(7, t());
    boardOf(100);
    ws().setOperandDigit('a', 'units', '5');
    proceed();
    expect(sub()).toBe(WRONG_DIGIT_TEXT);
  });

  it('order: the empty board comes first, even before a wrong digit', () => {
    // "ממשיכים" stays disabled until every hidden box has a digit (selectCanProceed),
    // so the missing-digit step is not reachable from the button.
    ws().setOperandDigit('a', 'units', '5');
    proceed();
    // The existing empty_board failure.
    expect(ws().feedback?.title).toBe('בונים בבית המספרים 🧱');
  });

  it('10 or more in a column is checked after the board: 3 hundreds and 14 units (= 314) is overcrowded', () => {
    board({ hundreds: 3, units: 14 });
    ws().setOperandDigit('a', 'units', '4');
    proceed();
    expect(sub()).toContain('10 לבנים או יותר');
  });

  it('a subtraction skeleton accepts the discovered minuend (s7_g_challenge_1, ▢,▢▢▢ − 2,587 = 5,416)', () => {
    const c = byId('s7_g_challenge_1');
    load(7, c);
    boardOf(8003);
    (['thousands', 'hundreds', 'tens', 'units'] as Place[]).forEach((p) =>
      ws().setOperandDigit('a', p, String(Math.floor(8003 / UNIT[p]) % 10))
    );
    proceed();
    expect(ws().feedback?.correct).toBe(true);
  });

  it('unchanged: an ordinary exercise still needs the result on the board, with the old text', () => {
    const o = byId('s4_g_t1');
    load(4, o);
    boardOf(o.numberA!);
    proceed();
    expect(sub()).toBe(OLD_BOARD_TEXT);
  });

  it('unchanged: a missingResultDigit exercise (s4_r_t7) still needs the result, with the old text', () => {
    const m = byId('s4_r_t7');
    load(4, m);
    boardOf(328);
    proceed();
    expect(sub()).toBe(OLD_BOARD_TEXT);
  });

  it('unchanged: meeting 8 skeletons never look at the board', () => {
    const e = byId('s8_r_t7'); // 4▢6 + 281 = 737
    load(8, e);
    ws().setOperandDigit('a', 'tens', '5');
    proceed();
    expect(ws().feedback?.correct).toBe(true);
  });
});

/* ── RULE 2 — meeting 6 reinforcement text (שהC.2) ───────────────────────── */

describe('Rule 2 — meeting 6 reinforcement asks the child to check each column', () => {
  const NEW = 'בנו את המחוסר בבית המספרים. בדקו בכל טור אם יש בו מספיק לבנים כדי להחסיר.';
  it('the four no-borrow reinforcement exercises carry the new sentence, and nothing else does', () => {
    const withNew = allTasks().filter((t) => (t.instructionHe ?? '').includes(NEW)).map((t) => t.id);
    expect([...new Set(withNew)].sort()).toEqual(['s6_g_reinforce_1', 's6_g_reinforce_2', 's6_r_reinforce_1', 's6_r_reinforce_2']);
    expect(allTasks().some((t) => (t.instructionHe ?? '').includes('אין כאן צורך בפריטה'))).toBe(false);
  });
  it('the rest of the instruction is unchanged', () => {
    expect(byId('s6_r_reinforce_1').instructionHe).toBe(
      `פתרו חיסור עם אפסים: 305 − 102. ${NEW} החסירו את הכמות הנדרשת וכתבו את התוצאה בשורת התוצאה.`
    );
  });
});

/* ── RULE 4 — the "four errors" streak (שהB.2; מסמך 03 "ארבע מחיקות או הקלדות שגויות") ── */

describe('Rule 4 — nextDigitErrorStreak, clause by clause', () => {
  const at = (n: number, p: Place | null) => ({ digitErrorStreak: n, digitErrorStreakPlace: p });
  it('a wrong digit adds 1 in the same column', () => {
    expect(nextDigitErrorStreak(at(2, 'tens'), 'tens', false)).toEqual(at(3, 'tens'));
  });
  it('a wrong digit in another column restarts the streak there at 1', () => {
    expect(nextDigitErrorStreak(at(3, 'tens'), 'units', false)).toEqual(at(1, 'units'));
    expect(nextDigitErrorStreak(at(0, null), 'units', false)).toEqual(at(1, 'units'));
  });
  it('a correct digit resets it to 0', () => {
    expect(nextDigitErrorStreak(at(3, 'tens'), 'hundreds', true)).toEqual(at(0, null));
  });
  it('is_correct === null leaves it unchanged', () => {
    expect(nextDigitErrorStreak(at(3, 'tens'), 'units', null)).toEqual(at(3, 'tens'));
  });
});

describe('Rule 4 — nextDigitErrorStreakOnDelete, clause by clause', () => {
  const at = (n: number, p: Place | null) => ({ digitErrorStreak: n, digitErrorStreakPlace: p });
  it('erasing a wrong digit leaves the streak as it is (that attempt was counted when typed)', () => {
    expect(nextDigitErrorStreakOnDelete(at(2, 'tens'), 'tens', false)).toEqual(at(2, 'tens'));
    expect(nextDigitErrorStreakOnDelete(at(0, null), 'tens', false)).toEqual(at(0, null));
  });
  it('erasing a correct digit adds 1 in the same column', () => {
    expect(nextDigitErrorStreakOnDelete(at(2, 'tens'), 'tens', true)).toEqual(at(3, 'tens'));
  });
  it('a deletion in another column restarts the streak there at 1', () => {
    expect(nextDigitErrorStreakOnDelete(at(3, 'tens'), 'units', true)).toEqual(at(1, 'units'));
    expect(nextDigitErrorStreakOnDelete(at(0, null), 'units', true)).toEqual(at(1, 'units'));
  });
  it('erasing a digit the exercise has no answer for counts as a deletion', () => {
    expect(nextDigitErrorStreakOnDelete(at(1, 'units'), 'units', null)).toEqual(at(2, 'units'));
  });
});

describe('Rule 4 — the card, driven through the store (meeting 4, 1,245 + 328 = 1,573)', () => {
  const t = () => byId('s4_g_t1');
  beforeEach(() => load(4, t()));
  const cardOpen = () => ws().helpState === 'socratic' && ws().socraticTriggerReason === 'consecutive_errors_4';

  it('the numbers are what the test assumes (tens need no carry, so trigger 3 stays out)', () => {
    expect([t().numberA, t().numberB]).toEqual([1245, 328]);
  });

  it('four wrong digits typed over each other open the card at the fourth (the first counts too)', async () => {
    for (const d of ['9', '8', '6']) ws().setAnswerDigit('tens', d);
    await flush();
    expect(ws().digitErrorStreak).toBe(3);
    expect(cardOpen()).toBe(false);
    ws().setAnswerDigit('tens', '5');
    await flush();
    expect(cardOpen()).toBe(true);
  });

  it('a wrong digit into an empty box counts when typed; erasing it does not count it again', async () => {
    for (let i = 0; i < 3; i++) {
      ws().setAnswerDigit('tens', '6');
      ws().setAnswerDigit('tens', '');
    }
    expect(ws().digitErrorStreak).toBe(3);
    ws().setAnswerDigit('tens', '6');
    await flush();
    expect(cardOpen()).toBe(true);
  });

  it('erasing a correct digit counts as a deletion: correct, erase, then three wrong digits open the card', async () => {
    ws().setAnswerDigit('tens', '7'); // correct: 0
    ws().setAnswerDigit('tens', ''); // the deletion: 1
    expect(ws().digitErrorStreak).toBe(1);
    for (const d of ['9', '8']) ws().setAnswerDigit('tens', d);
    await flush();
    expect(cardOpen()).toBe(false);
    ws().setAnswerDigit('tens', '6');
    await flush();
    expect(cardOpen()).toBe(true);
  });

  it('typing a correct digit and erasing it, again and again, never reaches four: the correct digit resets each time', async () => {
    for (let i = 0; i < 6; i++) {
      ws().setAnswerDigit('tens', '7');
      ws().setAnswerDigit('tens', '');
    }
    await flush();
    expect(ws().digitErrorStreak).toBe(1);
    expect(ws().helpState).not.toBe('socratic');
  });

  it('erasing a whole correct answer, one column after another, does not open the card (הB.4: one column per streak)', async () => {
    ws().setAnswerDigit('units', '3');
    ws().setAnswerDigit('tens', '7');
    ws().setAnswerDigit('hundreds', '5');
    ws().setAnswerDigit('thousands', '1');
    for (const p of ['units', 'tens', 'hundreds', 'thousands'] as const) ws().setAnswerDigit(p, '');
    await flush();
    expect(ws().digitErrorStreak).toBe(1);
    expect(ws().digitErrorStreakPlace).toBe('thousands');
    expect(cardOpen()).toBe(false);
  });

  it('four wrong digits in four different columns do not open it (one column per streak)', async () => {
    ws().setAnswerDigit('units', '9'); // units need a carry: may open trigger 3, so close it
    await flush();
    ws().closeHelp?.();
    useWorkspaceStore.setState({ helpState: 'none' as any, currentState: 'PROBLEM_ACTIVE' as any, socraticTriggerReason: null });
    ws().setAnswerDigit('tens', '9');
    ws().setAnswerDigit('hundreds', '9');
    ws().setAnswerDigit('thousands', '9');
    await flush();
    expect(ws().digitErrorStreak).toBe(1);
    expect(ws().digitErrorStreakPlace).toBe('thousands');
    expect(cardOpen()).toBe(false);
  });

  it('a correct digit in another column resets the streak', () => {
    for (const d of ['9', '8', '6']) ws().setAnswerDigit('tens', d);
    ws().setAnswerDigit('hundreds', '5');
    expect(ws().digitErrorStreak).toBe(0);
  });

  it('memory circles and undo leave the streak unchanged', () => {
    for (const d of ['9', '8']) ws().setAnswerDigit('tens', d);
    ws().setCarryDigit('tens', '1');
    ws().setCarryDigit('tens', '');
    ws().setCarryDigit('hundreds', '7');
    expect(ws().digitErrorStreak).toBe(2);
    ws().undo();
    expect(ws().digitErrorStreak).toBe(2);
    expect(ws().digitErrorStreakPlace).toBe('tens');
  });

  it('the streak returns to 0 once the card is shown, and the card belongs to the streak column', async () => {
    const hint = vi.spyOn(SocraticEngine, 'getSocraticHint');
    for (const d of ['9', '8', '6', '5']) ws().setAnswerDigit('tens', d);
    // The answer row auto-advances the cursor to the next box.
    ws().setFocusedPlace('hundreds');
    await flush();
    expect(cardOpen()).toBe(true);
    expect(ws().digitErrorStreak).toBe(0);
    expect(ws().socraticCardPlace).toBe('tens');
    expect(socraticCardColumnIndex(ws())).toBe(1); // SOCRATIC_CARD_SHOWN.column_index
    // The engine was asked about the tens (active_column_index 1), not the hundreds.
    const monitoring = hint.mock.calls.at(-1)?.[7] as any;
    expect(monitoring?.activeColumnIndex).toBe(1);
    hint.mockRestore();
  });

  it('a card opened for another reason does not reset the streak', async () => {
    for (const d of ['9', '8', '6']) ws().setAnswerDigit('tens', d);
    ws().openSocraticCard('hesitation_45s');
    await flush();
    expect(ws().helpState).toBe('socratic');
    expect(ws().digitErrorStreak).toBe(3);
    expect(ws().socraticCardPlace).toBeNull();
  });

  it('a card opened for another reason keeps the focused box as its column', () => {
    useWorkspaceStore.setState({ socraticTriggerReason: 'hesitation_45s', socraticCardPlace: null, focusedPlace: 'hundreds' } as any);
    expect(socraticCardColumnIndex(ws())).toBe(2);
  });

  it('the streak resets to 0 when the next exercise loads (advance → startTask → resetTaskInteraction)', () => {
    const first = byId('s4_r_t1'); // 142 + 23 = 165, no carry
    load(4, first);
    useWorkspaceStore.setState({ dynamicTasks: [first, byId('s4_r_t2')] } as any);
    boardOf(165);
    ws().setAnswerDigit('units', '5');
    ws().setAnswerDigit('tens', '6');
    ws().setAnswerDigit('hundreds', '1');
    // A streak left over from the exercise (set directly: a solved exercise ends on correct digits).
    useWorkspaceStore.setState({ digitErrorStreak: 3, digitErrorStreakPlace: 'tens' });
    proceed();
    expect(ws().standardTaskIdx).toBe(1);
    expect(ws().digitErrorStreak).toBe(0);
    expect(ws().digitErrorStreakPlace).toBeNull();
  });

  it('the streak resets to 0 when a task loads', () => {
    for (const d of ['9', '8', '6']) ws().setAnswerDigit('tens', d);
    load(4, t());
    expect(ws().digitErrorStreak).toBe(0);
    expect(ws().digitErrorStreakPlace).toBeNull();
  });

  it('unchanged: DIGIT_ENTERED is_correct, DIGIT_DELETED, typedErrorCount and the submission counter', () => {
    ws().setAnswerDigit('tens', '9');
    ws().setAnswerDigit('tens', '');
    ws().setAnswerDigit('tens', '7');
    const kinds = sent.events.map((e) => [e.event_type, e.details?.is_correct ?? null]);
    expect(kinds).toEqual([
      ['DIGIT_ENTERED', false],
      ['DIGIT_DELETED', null],
      ['DIGIT_ENTERED', true],
    ]);
    expect(ws().typedErrorCount).toBe(1);
    expect(ws().consecutiveErrorCount).toBe(0);
  });

  it('meeting 2: the card stays blocked', async () => {
    load(4, t());
    useWorkspaceStore.setState({ sessionNumber: 2 } as any);
    ws().openSocraticCard('consecutive_errors_4', 'tens');
    await flush();
    expect(ws().helpState).not.toBe('socratic');
  });
});

describe('Rule 4 — missing-digit boxes use the same streak (meetings 5–8)', () => {
  it('four wrong hidden digits in one column open the card for that column (s5_r_t7, 4▢2 − 128)', async () => {
    const t = byId('s5_r_t7');
    load(5, t);
    for (const d of ['9', '8', '7']) ws().setOperandDigit('a', 'tens', d);
    await flush();
    expect(ws().helpState).not.toBe('socratic');
    ws().setOperandDigit('a', 'tens', '6');
    await flush();
    expect(ws().socraticTriggerReason).toBe('consecutive_errors_4');
    expect(ws().socraticCardPlace).toBe('tens');
  });

  it('other triggers keep the old "already solved" guard in a skeleton with a filled-in wrong digit', async () => {
    load(7, byId('s7_r_t2')); // 31▢ + 254 = 568
    ws().setOperandDigit('a', 'units', '5');
    ws().openSocraticCard('hesitation_45s');
    ws().openSocraticCard('consecutive_errors_4'); // the wrong-submission source: no column
    await flush();
    expect(ws().helpState).not.toBe('socratic');
  });

  // The banks have no exercise with both a hidden operand digit and an open
  // result-row box, so the two sources meet only through the shared rule.
  it('hidden digits: wrong digits accumulate, erasing a wrong one adds nothing, a correct one resets, erasing it counts', () => {
    const t = byId('s7_r_t3'); // 3▢6 + 271 = 657, the tens hidden
    load(7, t);
    ws().setOperandDigit('a', 'tens', '1');
    ws().setOperandDigit('a', 'tens', '2');
    expect(ws().digitErrorStreak).toBe(2);
    ws().setOperandDigit('a', 'tens', '');
    expect(ws().digitErrorStreak).toBe(2);
    ws().setOperandDigit('a', 'tens', '8');
    expect(ws().digitErrorStreak).toBe(0);
    ws().setOperandDigit('a', 'tens', '');
    expect(ws().digitErrorStreak).toBe(1);
    expect(ws().digitErrorStreakPlace).toBe('tens');
  });
});

describe('Rule 4 — the report label is the documents\' wording', () => {
  it('SOCRATIC_CARD_SHOWN consecutive_errors_4 reads "ארבע מחיקות או הקלדות שגויות רצופות" (מסמכים 03, 04)', () => {
    const d = describeEvent({
      eventType: 'SOCRATIC_CARD_SHOWN',
      details: { trigger_reason: 'consecutive_errors_4' },
      columnIndex: 1,
    } as any);
    expect(d.detail).toBe('ארבע מחיקות או הקלדות שגויות רצופות');
  });
});

/* ── RULE 6 — enhanced-support lock in representation exercises (שהB.4) ──── */

describe('Rule 6 — only the conversion columns lock, for enhanced support only', () => {
  const ENH = 'enhanced_cognitive_support';
  const locked = (p: Place) => ws().isRepresentationColumnLocked(p);

  it('every declared lock names a representation exercise, and matches its numbers', () => {
    const PL: Place[] = ['units', 'tens', 'hundreds', 'thousands'];
    for (const [id, lock] of Object.entries(REPRESENTATION_LOCKS)) {
      const t = byId(id);
      expect(t.type).toBe('representation');
      const req = { ...EMPTY_COUNTS, ...(t.requiredCounts ?? {}) };
      const init = { ...EMPTY_COUNTS, ...((t as any).initialCounts ?? {}) };
      const val = PL.reduce((s, p) => s + req[p] * UNIT[p], 0);
      expect(val).toBe(t.numberA);
      const start = id === 's7_g_t6' ? { ...EMPTY_COUNTS, thousands: 1, hundreds: 16, tens: 13 } : init; // the given quantity
      for (const p of lock.columns) {
        if (lock.conversion === 'decomposition') {
          // The receiving column ends with ten or more blocks — except s7_g_t5,
          // where the decomposition happens mid-way (4 hundreds cannot give 6).
          if (id === 's7_g_t5') expect([p, 3400 + 1000 - 600]).toEqual(['hundreds', 3800]);
          else expect(req[p]).toBeGreaterThanOrEqual(10);
        } else {
          // The source column starts with ten or more and ends below ten.
          expect(start[p]).toBeGreaterThanOrEqual(10);
          expect(req[p]).toBeLessThan(10);
        }
      }
    }
    for (const none of ['s3_r_t1', 's3_r_t5', 's3_g_t1', 's3_g_t5', 's3_r_reinforce_1', 's3_g_reinforce_1', 's7_r_t6']) {
      expect(REPRESENTATION_LOCKS[none]).toBeUndefined();
    }
  });

  it('meeting 3, 5,230 → 4 thousands, 11 hundreds, 13 tens: hundreds and tens lock; units and thousands are open', () => {
    load(3, byId('s3_g_t4'), ENH);
    board({ thousands: 5, hundreds: 2, tens: 3 });
    expect([locked('hundreds'), locked('tens'), locked('units'), locked('thousands')]).toEqual([true, true, false, false]);
  });

  it('a column opens when the blocks decompose into it, and locks again on undo', () => {
    load(3, byId('s3_g_t4'), ENH);
    board({ thousands: 5, hundreds: 2, tens: 3 });
    ws().splitBlockClick('thousands'); // a thousand into ten hundreds
    expect(locked('hundreds')).toBe(false);
    expect(locked('tens')).toBe(true);
    ws().undo();
    expect(locked('hundreds')).toBe(true);
  });

  it('a composition opens its source column (s1_r_group26: units grouped into tens)', () => {
    load(1, byId('s1_r_group26'), ENH);
    board({ units: 26 });
    expect(locked('units')).toBe(true);
    expect(locked('tens')).toBe(false);
    ws().groupColumnClick('units');
    expect(locked('units')).toBe(false);
  });

  it('a grouping does not open a decomposition column (s3_g_t4: 12 hundreds grouped)', () => {
    load(3, byId('s3_g_t4'), ENH);
    board({ thousands: 5, hundreds: 12, tens: 3 });
    ws().groupColumnClick('hundreds');
    expect(ws().conversionsByColumn.composed.hundreds).toBe(true);
    expect(locked('hundreds')).toBe(true);
  });

  it('every representation exercise that needs a conversion has a lock (none can silently lose it)', () => {
    const PL: Place[] = ['units', 'tens', 'hundreds', 'thousands'];
    const standard = (n: number) => Object.fromEntries(PL.map((p) => [p, Math.floor(n / UNIT[p]) % 10]));
    const same = (a: any, b: any) => PL.every((p) => (a[p] ?? 0) === (b[p] ?? 0));
    const reps = [...new Map(allTasks().filter((t) => t.type === 'representation').map((t) => [t.id, t])).values()];
    const needs = reps
      .filter((t) => {
        const init = (t as any).initialCounts;
        return !same(t.requiredCounts, standard(t.numberA!)) || (init && !same(init, standard(t.numberA!)));
      })
      .map((t) => t.id);
    // s7_g_t5 and s7_g_t6 end in standard form; their conversions are in the instruction.
    expect([...needs, 's7_g_t5', 's7_g_t6'].sort()).toEqual(Object.keys(REPRESENTATION_LOCKS).sort());
  });

  it('safety valve: a board equal to requiredCounts opens every column', () => {
    load(3, byId('s3_r_t3'), ENH); // 45 tens, dragged directly
    board({ tens: 45 });
    expect(locked('tens')).toBe(false);
  });

  it('an exercise with no conversion has no locked column (s3_g_t1)', () => {
    load(3, byId('s3_g_t1'), ENH);
    expect((['units', 'tens', 'hundreds', 'thousands'] as Place[]).some(locked)).toBe(false);
  });

  it('never for other learners, never in meetings 2 or 8', () => {
    load(3, byId('s3_g_t4'));
    expect(locked('hundreds')).toBe(false);
    load(3, byId('s3_g_t4'), ENH);
    useWorkspaceStore.setState({ sessionNumber: 8 } as any);
    expect(locked('hundreds')).toBe(false);
    load(3, byId('s3_g_t4'), ENH);
    useWorkspaceStore.setState({ sessionNumber: 2 } as any);
    expect(locked('hundreds')).toBe(false);
  });

  it("KEYBOARD_LOCK_BLOCKED carries the column and the exercise's own conversion", () => {
    load(7, byId('s7_g_t6'), ENH);
    ws().recordBlockedKeystroke('tens');
    const ev = sent.events.find((e) => e.event_type === 'KEYBOARD_LOCK_BLOCKED');
    expect(ev.column_index).toBe(1);
    expect(ev.details.conversion_required).toBe('composition');
    sent.events.length = 0;
    load(3, byId('s3_g_t2'), ENH);
    ws().recordBlockedKeystroke('hundreds');
    const ev2 = sent.events.find((e) => e.event_type === 'KEYBOARD_LOCK_BLOCKED');
    expect(ev2.column_index).toBe(2);
    expect(ev2.details.conversion_required).toBe('decomposition');
  });
});
