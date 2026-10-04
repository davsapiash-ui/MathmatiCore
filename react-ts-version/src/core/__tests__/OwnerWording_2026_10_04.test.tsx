/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * Owner's wording decisions of 4.10.2026 ("כן לכולם", student-journey audit, group G7):
 *  1. Station 2's correction round: "משימה נוספת" over the new exercise in round numbers,
 *     "משימה חוזרת" over the task that returns.
 *  2. 320, 2,100, 4,200: a way with unit blocks is refused, with its own toast; never 150.
 *  3. The two missing-result-digit exercises (400 − 156, 328 + 145) say what to do with the blocks.
 *  4. (2,730 — on its own branch, claude/sj-g7b-2730-opening-blocks.)
 *  5. Station 8: "פתרו את תרגיל החיבור: 1,245 + 328. כתבו את התשובה בשורת התוצאה."
 *  6. The reflection board, stage 2: the tools' names only; "ממשיכים".
 */

vi.mock('firebase/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/database')>();
  const noop = async () => undefined;
  return {
    ...actual,
    ref: vi.fn((_db: unknown, path = '') => ({ _path: path })),
    set: vi.fn(noop),
    update: vi.fn(noop),
    remove: vi.fn(noop),
    get: vi.fn(async () => ({ exists: () => false, val: () => null })),
    push: vi.fn(() => ({ key: 'k', _path: 'k' })),
    onValue: vi.fn(() => () => undefined),
    onDisconnect: vi.fn(() => ({ set: noop, cancel: noop })),
    runTransaction: vi.fn(noop),
    serverTimestamp: vi.fn(() => 0),
  };
});

const emitted = vi.hoisted(() => [] as any[]);
vi.mock('@/infrastructure/services/FirebaseSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/services/FirebaseSyncService')>();
  return { ...actual, emitTelemetry: vi.fn(async (e: any) => { emitted.push(e); }) };
});
vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <span data-testid="speech" data-text={text} />,
}));

import { useWorkspaceStore, judgeStandardTask, getActiveTasks } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';
import { currentTaskLabelHe } from '@/application/taskLabel';
import { taskPositionLabelHe, TASK_LABEL_HE } from '@/core/taskPositionLabel';
import { TASKS as DIAGNOSTIC_TASKS } from '@/core/QMatrix';
import { hasProbeExercise } from '@/core/qmatrixFlow';
import { EMPTY_COUNTS, type PlaceCounts } from '@/core/placeValue';
import { tts } from '@/infrastructure/services/TTSService';
import { getSessionTasks, SESSION1_TASKS, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { S4_ADD, S6_SUB, S8_ADD, S8_SUB, NO_UNIT_BLOCKS_TITLE_HE, NO_UNIT_BLOCKS_SUB_HE } from '@/data/taskBuilders';
import { MathText } from '@/features/workspace/tasks/MathText';
import { FeedbackToast } from '@/features/workspace/overlays/FeedbackToast';
import { REFLECTION_TEXT_HE, STRATEGY_OPTIONS, reflectionSpeech } from '@/presentation/components/student/Session8ReflectionScreen';

const ws = () => useWorkspaceStore.getState();
const STUDENT = 'student_user6';

const bank: SessionTask[] = [...SESSION1_TASKS];
for (const m of [3, 4, 5, 6, 7, 8] as const) {
  for (const p of ['green_path', 'remediation_path'] as const) {
    bank.push(...getSessionTasks(m, p));
    if (m !== 8) bank.push(...getSessionBranchTasks(m, 'reinforcement', p), ...getSessionBranchTasks(m, 'challenge', p));
  }
}
const byId = (id: string) => {
  const t = bank.find((x) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  return t;
};

/** The exercise on screen, as a task start leaves it. */
function load(meeting: number, task: SessionTask) {
  ws().resetWorkspace();
  useWorkspaceStore.setState({
    sessionNumber: meeting,
    dynamicTasks: [task],
    standardTaskIdx: 0,
    flowStatus: 'task',
    awaitingNext: false,
    openingScreenSeen: true,
    helpState: 'closed',
    currentState: 'PROBLEM_ACTIVE',
    operandDigits: { a: {}, b: {} },
  } as any);
  emitted.length = 0;
}
const board = (c: Partial<PlaceCounts>) => useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, ...c } });
const verdict = () => {
  const s = ws();
  return judgeStandardTask(s, getActiveTasks(s)[s.standardTaskIdx]) as any;
};

beforeEach(() => {
  useAuthStore.setState({ user: { uid: STUDENT, student_id: 6, role: 'student', name: 'user6' } as any, role: 'student', isAuthenticated: true } as any);
  useStore.setState({ students: { [STUDENT]: { pedagogicalPath: 'green_path' } } as any });
  ws().resetWorkspace();
  emitted.length = 0;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('1 — station 2, the correction round: two headings, each its toast\'s words', () => {
  const qflow = (idx: number, subphase: 'subtask' | 'retry') => ({
    taskIdx: idx,
    phase: 'correction' as const,
    subphase,
    failedTasks: [DIAGNOSTIC_TASKS[idx].id],
    correctionIdx: 0,
    results: {},
  });
  const probes = DIAGNOSTIC_TASKS.map((t, i) => (hasProbeExercise(t) ? i : -1)).filter((i) => i >= 0);

  it('the label: "משימה נוספת" for the new exercise, "משימה חוזרת" for the task that returns', () => {
    expect(TASK_LABEL_HE.correctionProbe).toBe('משימה נוספת');
    expect(TASK_LABEL_HE.correction).toBe('משימה חוזרת');
    expect(taskPositionLabelHe({ sessionNumber: 2, isCorrection: true, isCorrectionProbe: true, position: 3, total: 7 })).toBe('משימה נוספת');
    expect(taskPositionLabelHe({ sessionNumber: 2, isCorrection: true, position: 3, total: 7 })).toBe('משימה חוזרת');
    // Outside the correction round the flag means nothing.
    expect(taskPositionLabelHe({ sessionNumber: 2, isCorrectionProbe: true, position: 3, total: 7 })).toBe('משימה 3 מתוך 7');
  });

  it('the store: tasks 3, 6 and 7 show the new exercise first, then the task itself; the others only return', () => {
    expect(probes).toEqual([2, 5, 6]);
    ws().initSession(2, false);
    for (let idx = 0; idx < DIAGNOSTIC_TASKS.length; idx++) {
      if (probes.includes(idx)) {
        useWorkspaceStore.setState({ qflow: qflow(idx, 'subtask'), flowStatus: 'task' } as any);
        expect(currentTaskLabelHe(ws()), `task ${idx + 1}, the new exercise`).toBe('משימה נוספת');
      }
      useWorkspaceStore.setState({ qflow: qflow(idx, 'retry'), flowStatus: 'task' } as any);
      expect(currentTaskLabelHe(ws()), `task ${idx + 1}, the task again`).toBe('משימה חוזרת');
    }
    // The first round is numbered, as before.
    useWorkspaceStore.setState({ qflow: { ...qflow(2, 'subtask'), phase: 'primary', failedTasks: [] } } as any);
    expect(currentTaskLabelHe(ws())).toBe(`משימה 3 מתוך ${DIAGNOSTIC_TASKS.length}`);
  });

  it('rendered: the heading of the task card (the chat\'s help message carries the same label)', async () => {
    const { TaskCard } = await import('@/features/workspace/tasks/TaskCard');
    ws().initSession(2, false);
    useWorkspaceStore.setState({ qflow: qflow(2, 'subtask'), flowStatus: 'task', openingScreenSeen: true } as any);
    render(<TaskCard />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('משימה נוספת');
    cleanup();
    useWorkspaceStore.setState({ qflow: qflow(2, 'retry') } as any);
    render(<TaskCard />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('משימה חוזרת');
  });
});

describe('2 — 320, 2,100, 4,200: a way with unit blocks is refused; 150 is not', () => {
  const NO_UNITS: Array<[string, Partial<PlaceCounts>, Partial<PlaceCounts>]> = [
    ['s3_r_challenge_1', { hundreds: 3, tens: 1, units: 10 }, { hundreds: 3, tens: 2 }],
    ['s3_g_t7', { thousands: 2, tens: 9, units: 10 }, { thousands: 2, hundreds: 1 }],
    ['s3_g_challenge_1', { thousands: 4, hundreds: 1, tens: 8, units: 20 }, { thousands: 4, hundreds: 2 }],
  ];

  it('the toast, word for word', () => {
    expect(NO_UNIT_BLOCKS_TITLE_HE).toBe('בִּדְקוּ אֶת טוּר הַיְחִידוֹת 🤔');
    expect(NO_UNIT_BLOCKS_SUB_HE).toBe('בתרגיל הזה בונים את המספר בלי לבני יחידה. קבצו כל 10 לבני יחידה ללבנת עשרת אחת.');
    // Read aloud: "10 לבני" is said in the feminine, like every count of blocks.
    expect((tts as any).cleanTextForSpeech(NO_UNIT_BLOCKS_SUB_HE)).toContain('קבצו כל עשר לבני יחידה ללבנת עשרת אחת');
  });

  it('only these three exercises carry the rule; each says "בלבד"', () => {
    expect(bank.filter((t) => t.noUnitBlocks).map((t) => t.id).sort()).toEqual(['s3_g_challenge_1', 's3_g_t7', 's3_r_challenge_1']);
    expect(byId('s3_r_challenge_1').instructionHe).toContain('מצאו דרכים שונות לייצג את המספר 320 באמצעות מאות ועשרות בלבד. ');
    expect(byId('s3_g_t7').instructionHe).toContain('מצאו דרכים שונות לייצג את המספר 2,100 באמצעות אלפים, מאות ועשרות בלבד. ');
    expect(byId('s3_g_challenge_1').instructionHe).toContain('מצאו דרכים שונות לייצג את המספר 4,200 באמצעות אלפים, מאות ועשרות בלבד. ');
    expect(byId('s7_r_t7').noUnitBlocks).toBeUndefined();
    expect(byId('s7_r_t7').instructionHe).not.toContain('בלבד');
  });

  for (const [id, withUnits, without] of NO_UNITS) {
    it(`${id}: the number with unit blocks is refused with the toast and counts as a wrong press; without them it is recorded`, () => {
      load(3, byId(id));
      board(withUnits);
      ws().addRepresentation();
      expect(ws().q3Reps).toHaveLength(0);
      expect(ws().feedback).toMatchObject({ correct: false, title: 'בִּדְקוּ אֶת טוּר הַיְחִידוֹת 🤔', sub: 'בתרגיל הזה בונים את המספר בלי לבני יחידה. קבצו כל 10 לבני יחידה ללבנת עשרת אחת.' });
      // Counted like the other refusals of "הוספת ייצוג" in station 3.
      expect(ws().wrongAnswerStreak).toBe(1);
      expect(ws().boardCheckFailures).toBe(1);
      board(without);
      ws().addRepresentation();
      expect(ws().q3Reps).toEqual([{ ...EMPTY_COUNTS, ...without }]);
      expect(ws().wrongAnswerStreak).toBe(0);
    });
  }

  it('a board that does not show the number keeps its own toast, also with unit blocks on it', () => {
    load(3, byId('s3_r_challenge_1'));
    board({ hundreds: 3, units: 5 });
    ws().addRepresentation();
    expect(ws().feedback?.title).toBe('דַּיְּקוּ אֶת הַמִּבְנֶה 🔍');
  });

  it('the refusal sends what the other refusals send — no event of its own', () => {
    load(3, byId('s3_g_t7'));
    board({ thousands: 2 }); // 2,000: not the number
    ws().addRepresentation();
    const wrongValue = emitted.map((e) => e.event_type);
    const afterWrongValue = { failures: ws().boardCheckFailures, streak: ws().wrongAnswerStreak };
    load(3, byId('s3_g_t7'));
    board({ thousands: 2, tens: 9, units: 10 });
    ws().addRepresentation();
    expect(emitted.map((e) => e.event_type)).toEqual(wrongValue);
    expect({ failures: ws().boardCheckFailures, streak: ws().wrongAnswerStreak }).toEqual(afterWrongValue);
  });

  it('the toast on screen: the same note as the even-tens one, with its read-aloud button', () => {
    load(3, byId('s3_g_t7'));
    board({ thousands: 2, tens: 9, units: 10 });
    ws().addRepresentation();
    render(<FeedbackToast placement="inline" />);
    const toast = screen.getByTestId('feedback-toast');
    expect(toast.textContent).toContain('בתרגיל הזה בונים את המספר בלי לבני יחידה. קבצו כל 10 לבני יחידה ללבנת עשרת אחת.');
    expect(toast.querySelector('[data-testid="speech"]')).toBeTruthy();
  });

  it('150 (s7_r_t7): every way with an even number of tens has unit blocks — both are recorded', () => {
    load(7, byId('s7_r_t7'));
    board({ hundreds: 1, tens: 4, units: 10 });
    ws().addRepresentation();
    board({ tens: 14, units: 10 });
    ws().addRepresentation();
    expect(ws().q3Reps).toHaveLength(2);
    expect(verdict().kind).toBe('success');
  });

  it('station 2\'s own "another way" task is untouched', () => {
    ws().initSession(2, false);
    const idx = DIAGNOSTIC_TASKS.findIndex((t) => t.type === 'flexible_decomp');
    if (idx < 0) return;
    useWorkspaceStore.setState({ qflow: { taskIdx: idx, phase: 'primary', subphase: 'subtask', failedTasks: [], correctionIdx: 0, results: {} }, flowStatus: 'task' } as any);
    const n = (DIAGNOSTIC_TASKS[idx] as any).numberA as number;
    board({ tens: Math.floor(n / 10) - 1, units: (n % 10) + 10 });
    ws().addRepresentation();
    expect(ws().feedback?.title).not.toBe(NO_UNIT_BLOCKS_TITLE_HE);
  });
});

describe('3 — a result digit missing: the instruction says what to do with the blocks', () => {
  it('400 − 156 (s6_r_t7), word for word', () => {
    expect(byId('s6_r_t7').instructionHe).toBe(
      'בתרגיל 400 − 156 חסרה ספרת העשרות בשורת התוצאה. בנו את המחוסר בבית המספרים. אם בטור אין מספיק לבנים, אפשר לפרוט לבנה מהטור שמשמאלו: לחצו עליה או גררו אותה אל אותו טור. אחרי שפרטתם, רשמו בעיגולי הזיכרון כמה לבנים יש עכשיו בכל טור שהשתנה. הוציאו מבית המספרים את הכמות הנדרשת. כתבו את הספרה החסרה בתיבה הריקה.'
    );
  });

  it('328 + 145 (s4_r_t7), word for word', () => {
    expect(byId('s4_r_t7').instructionHe).toBe(
      'בתרגיל 328 + 145 חסרה ספרת העשרות בשורת התוצאה. ייצגו את המספרים בעזרת לבנים. כאשר מצטברות 10 לבנים בטור, לחצו על הכפתור "קבצו 10" שבראש הטור ורשמו את ההמרה בעיגול הזיכרון. כתבו את הספרה החסרה בתיבה הריקה.'
    );
  });

  it('the exercises themselves did not change: the numbers, the missing digit, the check', () => {
    expect(byId('s6_r_t7')).toMatchObject({ numberA: 400, numberB: 156, correctAnswer: 244, isSubtraction: true, revealedResultDigits: ['units', 'hundreds'] });
    expect(byId('s4_r_t7')).toMatchObject({ numberA: 328, numberB: 145, correctAnswer: 473, revealedResultDigits: ['units', 'hundreds'] });
  });

  it('the shared sentences are the stations\' own: no other exercise changed', () => {
    expect(S4_ADD('507 + 125')).toBe('פתרו במאונך: 507 + 125. ייצגו את המספרים בעזרת לבנים. כאשר מצטברות 10 לבנים בטור, לחצו על הכפתור "קבצו 10" שבראש הטור ורשמו את ההמרה בעיגול הזיכרון. רשמו את התוצאה בשורת התוצאה.');
    expect(S6_SUB('500 − 287')).toBe('פתרו חיסור עם אפסים: 500 − 287. בנו את המחוסר בבית המספרים. אם בטור אין מספיק לבנים, אפשר לפרוט לבנה מהטור שמשמאלו: לחצו עליה או גררו אותה אל אותו טור. אחרי שפרטתם, רשמו בעיגולי הזיכרון כמה לבנים יש עכשיו בכל טור שהשתנה. הוציאו מבית המספרים את הכמות הנדרשת וכתבו את התוצאה בשורת התוצאה.');
    expect(byId('s4_r_t6').instructionHe).toBe(S4_ADD('507 + 125'));
    expect(byId('s6_r_t6').instructionHe).toBe(S6_SUB('500 − 287'));
  });

  it('400 − 156 is the one instruction over 300 characters: its lines sit closer, every other instruction keeps its spacing', async () => {
    expect(bank.filter((t) => (t.instructionHe ?? '').length > 300).map((t) => t.id)).toEqual(['s6_r_t7']);
    const { TaskCard } = await import('@/features/workspace/tasks/TaskCard');
    const shown = (meeting: number, id: string) => {
      load(meeting, byId(id));
      render(<TaskCard />);
      const box = screen.getByTestId('task-instruction');
      const out = { cls: box.querySelector('p')!.className, lineHeight: box.style.getPropertyValue('--instruction-leading') };
      cleanup();
      return out;
    };
    expect(shown(6, 's6_r_t7').lineHeight).toBe('1.4');
    for (const [m, id] of [[6, 's6_r_t6'], [4, 's4_r_t7'], [8, 's8_g_t1']] as const) {
      expect(shown(m, id).lineHeight, id).toBe('');
      // 1.55 unless the box says otherwise.
      expect(shown(m, id).cls, id).toContain('leading-[var(--instruction-leading,1.55)]');
    }
    // The size of the text is the same for the long one.
    expect(shown(6, 's6_r_t7').cls).toBe(shown(6, 's6_r_t6').cls);
  });

  it('both fit what the coaching function accepts as an instruction (400 characters)', () => {
    for (const id of ['s6_r_t7', 's4_r_t7']) expect(byId(id).instructionHe.length, id).toBeLessThanOrEqual(400);
  });
});

describe('5 — station 8: "פתרו את תרגיל החיבור: …. כתבו את התשובה בשורת התוצאה."', () => {
  it('the two sentences, word for word', () => {
    expect(S8_ADD('1,245 + 328')).toBe('פתרו את תרגיל החיבור: 1,245 + 328. כתבו את התשובה בשורת התוצאה.');
    expect(S8_SUB('5,432 − 2,118')).toBe('פתרו את תרגיל החיסור: 5,432 − 2,118. כתבו את התשובה בשורת התוצאה.');
    expect(byId('s8_g_t1').instructionHe).toBe('פתרו את תרגיל החיבור: 1,245 + 328. כתבו את התשובה בשורת התוצאה.');
    expect(byId('s8_g_t3').instructionHe).toBe('פתרו את תרגיל החיסור: 5,432 − 2,118. כתבו את התשובה בשורת התוצאה.');
  });

  it('all eleven plain exercises of station 8 carry it', () => {
    const plain = [...getSessionTasks(8, 'green_path'), ...getSessionTasks(8, 'remediation_path')].filter((t) => !t.hiddenDigits);
    expect(plain).toHaveLength(11);
    for (const t of plain) {
      expect(t.instructionHe, t.id).toMatch(t.isSubtraction
        ? /^פתרו את תרגיל החיסור: [\d,]+ − [\d,]+\. כתבו את התשובה בשורת התוצאה\.$/
        : /^פתרו את תרגיל החיבור: [\d,]+ \+ [\d,]+\. כתבו את התשובה בשורת התוצאה\.$/);
    }
  });

  it('on screen the exercise is isolated left to right inside the sentence, never mirrored', () => {
    for (const [text, ex] of [
      [byId('s8_g_t1').instructionHe, '1,245 + 328'],
      [byId('s8_g_t3').instructionHe, '5,432 − 2,118'],
      [byId('s8_r_t4').instructionHe, '78 − 25'],
    ] as const) {
      const { container } = render(<p dir="rtl"><MathText text={text} /></p>);
      const bdi = container.querySelectorAll('bdi');
      expect(bdi).toHaveLength(1);
      expect(bdi[0].getAttribute('dir')).toBe('ltr');
      expect(bdi[0].textContent).toBe(ex);
      expect(container.textContent).toBe(text);
      cleanup();
    }
  });

  it('read aloud: the sign is said, the exercise in its order', () => {
    expect((tts as any).cleanTextForSpeech(byId('s8_g_t3').instructionHe)).toMatch(/פתרו את תרגיל החיסור: .* פחות .*\. כתבו את התשובה בשורת התוצאה\./);
    expect((tts as any).cleanTextForSpeech(byId('s8_g_t1').instructionHe)).toMatch(/פתרו את תרגיל החיבור: .* ועוד .*\. כתבו את התשובה בשורת התוצאה\./);
  });

  it('station 2 keeps its own words', () => {
    const texts = DIAGNOSTIC_TASKS.map((t) => t.instructionHe);
    expect(texts.filter((t) => t === 'פתרו את תרגיל החיסור וכתבו את התשובה בשורת התוצאה!')).toHaveLength(2);
    expect(texts.filter((t) => t === 'פתרו את תרגיל החיבור וכתבו את התשובה בשורת התוצאה!')).toHaveLength(1);
  });
});

describe('6 — the reflection board, stage 2: the tools by their names', () => {
  it('the question, the three options, the button', () => {
    expect(REFLECTION_TEXT_HE.strategyQuestion).toBe('מה עזר לכם להצליח היום בפתרון התרגילים?');
    expect(REFLECTION_TEXT_HE.strategyInstruction).toBe('אפשר לסמן יותר מתשובה אחת.');
    expect(STRATEGY_OPTIONS.map((o) => [o.id, o.label])).toEqual([
      ['undo', 'כפתור ביטול הפעולה'],
      ['memory', 'עיגולי הזיכרון'],
      ['hints', 'השאלות בכרטיס החניכה'],
    ]);
    expect(REFLECTION_TEXT_HE.next).toBe('ממשיכים');
    expect(REFLECTION_TEXT_HE.back).toBe('חזרה');
    expect(REFLECTION_TEXT_HE.finish).toBe('סיום התחנה');
  });

  it('what is read aloud follows the same words', () => {
    expect(reflectionSpeech(2)).toBe(
      'שלב שני מתוך שלושה. מה עזר לכם להצליח היום בפתרון התרגילים? אפשר לסמן יותר מתשובה אחת. כפתור ביטול הפעולה. עיגולי הזיכרון. השאלות בכרטיס החניכה.'
    );
  });
});
