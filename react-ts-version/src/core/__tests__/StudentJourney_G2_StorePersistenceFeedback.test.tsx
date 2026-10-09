/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen, act } from '@testing-library/react';

/**
 * Student-journey audit, 4.10.2026 — group G2 (store logic, persistence,
 * feedback texts, answer boxes). One block per finding, through the real store
 * and the real components:
 *   A7-001   the representations of a two-ways exercise survive a reload;
 *   A6-102   meeting 8's reflection board: stage and answers survive a reload,
 *            reflection_step reaches the learner record at every stage;
 *   A6-103   the effort symbols are three rising bars;
 *   A6-107   "השמירה לא הצליחה" stays in stage 3, with a read-aloud button;
 *   A3-103   a digit in an answer box can be typed over;
 *   A3-116   Backspace in an empty box goes back one box;
 *   V-A3-101a a profile waiting on the opening screen is applied at "מתחילים";
 *   A3-104   meeting 2's progress dots: no green, no ✓;
 *   A3-112/113/114 meeting 2's toasts;
 *   A3-117 / UX-004 where the feedback toast sits;
 *   A5-F05, A5-F10, A7-004, A7-005 (= A4-F09), A7-011, A4-F01, A4-F03.
 */

const db = vi.hoisted(() => ({ updates: [] as Array<{ path: string; value: any }> }));
vi.mock('firebase/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/database')>();
  const noop = async () => undefined;
  return {
    ...actual,
    ref: vi.fn((_db: unknown, path = '') => ({ _path: path })),
    set: vi.fn(noop),
    update: vi.fn(async (r: any, value: any) => {
      db.updates.push({ path: r?._path, value });
    }),
    remove: vi.fn(noop),
    get: vi.fn(async () => ({ exists: () => false, val: () => null })),
    push: vi.fn(() => ({ key: 'k', _path: 'k' })),
    onValue: vi.fn(() => () => undefined),
    onDisconnect: vi.fn(() => ({ set: noop, cancel: noop })),
    runTransaction: vi.fn(noop),
    serverTimestamp: vi.fn(() => 0),
  };
});
vi.mock('@/infrastructure/services/FirebaseSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/services/FirebaseSyncService')>();
  return { ...actual, emitTelemetry: vi.fn(async () => undefined) };
});
vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <span data-testid="speech" data-text={text} />,
}));

import {
  useWorkspaceStore,
  judgeStandardTask,
  selectCanProceed,
  digitJustTyped,
  restoredReflectionDraft,
  freshReflectionDraft,
  boardBeforeConversion,
} from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { EMPTY_COUNTS, type PlaceCounts } from '@/core/placeValue';
import { TASKS } from '@/core/QMatrix';
import { Session8ReflectionScreen, REFLECTION_TEXT_HE } from '@/presentation/components/student/Session8ReflectionScreen';
import { FlexibleDecompTask } from '@/features/workspace/tasks/FlexibleDecompTask';
import { PlaceValueInputBoxes } from '@/features/workspace/tasks/PlaceValueInputBoxes';
import { ProgressDots } from '@/features/workspace/ProgressDots';
import { FeedbackToast } from '@/features/workspace/overlays/FeedbackToast';

const bank: SessionTask[] = [];
for (const m of [3, 4, 5, 6, 7, 8] as const) {
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
/** Without niqqud: the order of the marks differs between sources. */
const plain = (t: string) => t.normalize('NFC').replace(/[֑-ׇ]/g, '');
const svc = firebaseSyncService as any;

function load(meeting: number, task: SessionTask, extra: Record<string, unknown> = {}) {
  ws().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1, role: 'student' } } as any);
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
    ...extra,
  } as any);
}
const board = (c: Partial<PlaceCounts>) => useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, ...c } });
const boardOf = (n: number) =>
  board({ thousands: Math.floor(n / 1000) % 10, hundreds: Math.floor(n / 100) % 10, tens: Math.floor(n / 10) % 10, units: n % 10 });
const verdict = () => {
  const s = ws();
  return judgeStandardTask(s, s.dynamicTasks![s.standardTaskIdx]) as any;
};

/** What the database gives back: null and empty lists and objects are dropped. */
const likeTheDatabase = (value: unknown): any => {
  const prune = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      const out = v.map(prune).filter((x) => x !== undefined);
      return out.length ? out : undefined;
    }
    if (v && typeof v === 'object') {
      const out = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, prune(x)]).filter(([, x]) => x !== undefined));
      return Object.keys(out).length ? out : undefined;
    }
    return v === null ? undefined : v;
  };
  return prune(JSON.parse(JSON.stringify(value)));
};
/** The device copy: the same snapshot, through JSON (localStorage). */
const likeTheDevice = (value: unknown): any => JSON.parse(JSON.stringify(value));

beforeEach(() => {
  db.updates.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('A7-001: the representations of a two-ways exercise survive a reload', () => {
  for (const [name, copy] of [['database copy', likeTheDatabase], ['device copy', likeTheDevice]] as const) {
    it(`s3_g_t7 (2,100), one representation recorded — restored from the ${name}`, () => {
      load(3, byId('s3_g_t7'));
      boardOf(2100);
      ws().addRepresentation();
      expect(ws().q3Reps).toHaveLength(1);
      const saved = copy(svc.getSyncableWorkspaceState());
      expect(saved.q3Reps).toHaveLength(1);
      ws().resetWorkspace();
      ws().restoreSession({ ...saved, dynamicTasks: undefined });
      useWorkspaceStore.setState({ dynamicTasks: [byId('s3_g_t7')], standardTaskIdx: 0 } as any);
      expect(ws().q3Reps).toEqual([{ ...EMPTY_COUNTS, thousands: 2, hundreds: 1 }]);
      render(<FlexibleDecompTask targetNumber={2100} />);
      expect(screen.getByRole('button', { name: /הוספת ייצוג \(2\/2\)/ })).toBeTruthy();
    });
  }

  it('nothing recorded: the database drops the empty list, and it comes back empty', () => {
    load(3, byId('s3_g_t7'));
    const saved = likeTheDatabase(svc.getSyncableWorkspaceState());
    expect(saved.q3Reps).toBeUndefined();
    ws().restoreSession(saved);
    expect(ws().q3Reps).toEqual([]);
  });
});

describe('A6-102: the reflection board keeps its stage and answers through a reload', () => {
  function toReflection() {
    ws().resetWorkspace();
    useAuthStore.setState({ user: { uid: 'student_user4', student_id: 4, role: 'student' } } as any);
    ws().initSession(8, false);
    useWorkspaceStore.setState({ flowStatus: 'reflection', openingScreenSeen: true } as any);
  }

  it('stage 2 with a level and two strategies: restored from the database copy and from the device copy', () => {
    for (const copy of [likeTheDatabase, likeTheDevice]) {
      toReflection();
      ws().setReflectionEffort('MEDIUM');
      ws().setReflectionStep(2);
      ws().toggleReflectionStrategy('undo');
      ws().toggleReflectionStrategy('hints');
      const saved = copy(svc.getSyncableWorkspaceState());
      ws().resetWorkspace();
      expect(ws().reflectionDraft).toEqual(freshReflectionDraft());
      ws().restoreSession(saved);
      expect(ws().flowStatus).toBe('reflection');
      expect(ws().reflectionDraft).toEqual({ step: 2, effortLevel: 'MEDIUM', strategies: ['undo', 'hints'] });
    }
  });

  it('the board on screen after the restore shows stage 2, with the ticks', () => {
    toReflection();
    ws().setReflectionEffort('HARD');
    ws().setReflectionStep(2);
    ws().toggleReflectionStrategy('memory');
    const saved = likeTheDatabase(svc.getSyncableWorkspaceState());
    ws().resetWorkspace();
    ws().restoreSession(saved);
    render(<Session8ReflectionScreen onComplete={vi.fn()} metrics={{ undoCount: 0, errorCount: 0, guessCount: 0 }} />);
    expect(screen.getByText(REFLECTION_TEXT_HE.stepLabel(2))).toBeTruthy();
    const ticked = screen.getAllByRole('checkbox').filter((b) => b.getAttribute('aria-checked') === 'true');
    expect(ticked).toHaveLength(1);
    // Back to stage 1: the level chosen is still pressed.
    cleanup();
    act(() => ws().setReflectionStep(1));
    render(<Session8ReflectionScreen onComplete={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'מאמץ רב' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('every stage change reaches reflection_step on the learner record; reflection_completed is not touched', () => {
    toReflection();
    ws().setReflectionEffort('EASY');
    ws().setReflectionStep(2);
    ws().setReflectionStep(3);
    ws().setReflectionStep(2);
    const steps = db.updates.filter((u) => u.path === 'users/students/student_user4').map((u) => u.value);
    expect(steps.map((v) => v.reflection_step)).toEqual([2, 3, 2]);
    for (const v of steps) expect('reflection_completed' in v).toBe(false);
  });

  it('no stage 2 without a level; a new meeting starts the board afresh', () => {
    toReflection();
    ws().setReflectionStep(2);
    expect(ws().reflectionDraft.step).toBe(1);
    ws().setReflectionEffort('EASY');
    ws().setReflectionStep(3);
    ws().initSession(8, false);
    expect(ws().reflectionDraft).toEqual(freshReflectionDraft());
  });

  it('a snapshot without a draft, or a broken one, starts at stage 1', () => {
    expect(restoredReflectionDraft(undefined)).toEqual(freshReflectionDraft());
    expect(restoredReflectionDraft({ step: 3 })).toEqual(freshReflectionDraft());
    expect(restoredReflectionDraft({ step: 3, effortLevel: 'HARD', strategies: { 0: 'undo', 1: 7 } })).toEqual({ step: 3, effortLevel: 'HARD', strategies: ['undo'] });
  });
});

describe('A6-103 / A6-107: the reflection board on screen', () => {
  beforeEach(() => {
    ws().resetWorkspace();
  });

  it('each effort symbol is three bars of rising height, none of them a square', () => {
    render(<Session8ReflectionScreen onComplete={vi.fn()} />);
    const bars = Array.from(screen.getByRole('button', { name: 'מאמץ קל' }).querySelectorAll('span > span'));
    expect(bars.map((b) => b.className.match(/\bh-(\d+)\b/)?.[1])).toEqual(['6', '9', '12']);
    for (const b of bars) expect(b.className).toMatch(/\bw-3\b/);
  });

  it('a save that failed: the message stays under the finish button, with its own read-aloud; the next press clears it', async () => {
    useWorkspaceStore.setState({ reflectionDraft: { step: 3, effortLevel: 'EASY', strategies: [] } } as any);
    let answer: boolean = false;
    const onComplete = vi.fn(async () => answer);
    render(<Session8ReflectionScreen onComplete={onComplete} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: REFLECTION_TEXT_HE.finish }));
    });
    expect(screen.getByRole('alert').textContent).toBe('השמירה לא הצליחה. לחצו שוב על "סיום התחנה". אם זה לא עוזר, בקשו עזרה מהמורה.');
    const spoken = screen.getAllByTestId('speech').map((e) => e.getAttribute('data-text'));
    expect(spoken).toContain('השמירה לא הצליחה. לחצו שוב על סיום התחנה. אם זה לא עוזר, בקשו עזרה מהמורה.');
    answer = true;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: REFLECTION_TEXT_HE.finish }));
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(REFLECTION_TEXT_HE.notSaved).not.toMatch(/הצלחנו|נשמור/);
  });
});

describe('A3-103 / A3-116: a digit in an answer box can be corrected', () => {
  it('digitJustTyped keeps the digit just typed, on either side of the old one', () => {
    expect(digitJustTyped('56', '6')).toBe('5'); // caret before the 6
    expect(digitJustTyped('65', '6')).toBe('5'); // caret after the 6
    expect(digitJustTyped('5', '6')).toBe('5'); // the 6 selected, replaced
    expect(digitJustTyped('55', '5')).toBe('5');
    expect(digitJustTyped('', '6')).toBe('');
    expect(digitJustTyped('a7', '')).toBe('7');
    // an empty box keeps the first digit of a paste
    expect(digitJustTyped('123', '')).toBe('1');
  });

  function meeting2Boxes() {
    ws().resetWorkspace();
    useWorkspaceStore.setState({ sessionNumber: 2, answerDigits: {} } as any);
    render(<PlaceValueInputBoxes mode="three_digits" />);
    const row = screen.getByTestId('pv-result-row');
    return Array.from(row.querySelectorAll('input')) as HTMLInputElement[];
  }

  it('meeting 2: no maxLength; typing 5 before a 6 writes 5', () => {
    const [h] = meeting2Boxes();
    expect(h.getAttribute('maxlength')).toBeNull();
    fireEvent.change(h, { target: { value: '6' } });
    expect(ws().answerDigits.hundreds).toBe('6');
    fireEvent.change(h, { target: { value: '56' } });
    expect(ws().answerDigits.hundreds).toBe('5');
  });

  it('the digit is selected when the box gets focus', () => {
    const [h] = meeting2Boxes();
    fireEvent.change(h, { target: { value: '7' } });
    const select = vi.spyOn(h, 'select');
    fireEvent.focus(h);
    expect(select).toHaveBeenCalled();
  });

  it('Backspace in an empty box deletes the digit before it and moves there', () => {
    const [h, t] = meeting2Boxes();
    fireEvent.change(h, { target: { value: '7' } });
    expect(document.activeElement).toBe(t);
    fireEvent.keyDown(t, { key: 'Backspace' });
    expect(ws().answerDigits.hundreds ?? '').toBe('');
    expect(document.activeElement).toBe(h);
    // In the first box there is nothing before it.
    fireEvent.keyDown(h, { key: 'Backspace' });
    expect(document.activeElement).toBe(h);
  });
});

describe('V-A3-101a: a profile that waited on the opening screen applies at "מתחילים"', () => {
  it('station 2: received on the opening screen, applied when task 1 starts', () => {
    ws().resetWorkspace();
    ws().initSession(2, false);
    useWorkspaceStore.setState({ supportProfileApplied: true, activeSupportProfileId: null, flowStatus: 'task', openingScreenSeen: false } as any);
    ws().receiveSupportProfile('enhanced_cognitive_support');
    expect(ws().hasPendingSupportProfile).toBe(true);
    ws().markOpeningScreenSeen();
    expect(ws().hasPendingSupportProfile).toBe(false);
    expect(ws().activeSupportProfileId).toBe('enhanced_cognitive_support');
    expect(ws().openingScreenSeen).toBe(true);
  });
});

describe('A3-104: meeting 2 progress dots say nothing about right or wrong', () => {
  it('meeting 2: done dots are neutral, without ✓; meeting 3 keeps the green ✓', () => {
    ws().resetWorkspace();
    useWorkspaceStore.setState({ sessionNumber: 2 } as any);
    const { container, unmount } = render(<ProgressDots total={7} current={3} />);
    expect(container.textContent).not.toContain('✓');
    expect(container.innerHTML).not.toContain('bg-ws-success');
    unmount();
    useWorkspaceStore.setState({ sessionNumber: 3 } as any);
    const again = render(<ProgressDots total={7} current={3} />);
    expect(again.container.textContent).toContain('✓');
  });
});

describe('A3-112 / A3-113 / A3-114: meeting 2 toasts', () => {
  function meeting2At(taskIdx: number) {
    ws().resetWorkspace();
    useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1, role: 'student' } } as any);
    ws().initSession(2, false);
    useWorkspaceStore.setState({
      openingScreenSeen: true,
      qflow: { ...ws().qflow, taskIdx, phase: 'primary', subphase: 'main' },
    } as any);
  }

  it('an empty answer: the notice is neutral', () => {
    meeting2At(0);
    useWorkspaceStore.setState({ answerDigits: {}, probeAnswer: '', hasInteracted: true } as any);
    ws().proceed();
    expect(ws().feedback).toMatchObject({ neutral: true, title: 'הַקְלָדַת תְּשׁוּבָה ✏️' });
  });

  it('task 1 answered: "התשובה התקבלה!" without 👍, "עוברים למשימה הבאה"; the last task: no next task promised', () => {
    meeting2At(0);
    // Task 1's one answer box (owner, 4.10.2026).
    useWorkspaceStore.setState({ probeAnswer: '605' } as any);
    ws().proceed();
    expect(ws().feedback?.title).toBe('הַתְּשׁוּבָה הִתְקַבְּלָה!');
    expect(ws().feedback?.sub).toBe('עוֹבְרִים לַמְּשִׂימָה הַבָּאָה...');
    meeting2At(TASKS.length - 1);
    useWorkspaceStore.setState({ answerDigits: { hundreds: '1', tens: '2', units: '3' } } as any);
    ws().proceed();
    expect(ws().feedback?.title).toBe('הַתְּשׁוּבָה הִתְקַבְּלָה!');
    expect(ws().feedback?.sub).toBeUndefined();
  });

  it('PRD Module 14 §ב (v7.9): a wrong answer gets the same neutral texts — nothing tells right from wrong', () => {
    meeting2At(0);
    // 650 is not the answer of task 1 (605): the toast must not differ.
    useWorkspaceStore.setState({ probeAnswer: '650' } as any);
    ws().proceed();
    expect(ws().feedback).toMatchObject({ neutral: true, title: 'הַתְּשׁוּבָה הִתְקַבְּלָה!', sub: 'עוֹבְרִים לַמְּשִׂימָה הַבָּאָה...' });
    // Seven diagnostic tasks: the seventh is the last, and only it drops the sub.
    expect(TASKS).toHaveLength(7);
  });
});

describe('A3-117 / UX-004: where the feedback toast sits', () => {
  it('floating (meetings 2, 8): centred by its own transform, not by a class framer-motion overrides', () => {
    ws().resetWorkspace();
    useWorkspaceStore.setState({ feedback: { correct: true, neutral: true, title: 'הַתְּשׁוּבָה הִתְקַבְּלָה!' }, feedbackNonce: 1 } as any);
    render(<FeedbackToast />);
    const toast = screen.getByTestId('feedback-toast');
    expect(toast.className).not.toContain('-translate-x-1/2');
    expect(toast.style.transform).toContain('translateX(-50%)');
  });

  it('inline (meetings 1, 3–7): out of the flow, placed under the position label', () => {
    ws().resetWorkspace();
    useWorkspaceStore.setState({ feedback: { correct: false, title: 'כִּמְעַט... 🧐', sub: 'בדקו שוב.' }, feedbackNonce: 1 } as any);
    render(
      <div style={{ position: 'relative' }}>
        <FeedbackToast placement="inline" />
        <h1>משימה 1 מתוך 7</h1>
      </div>
    );
    const toast = screen.getByTestId('feedback-toast');
    expect(toast.className).toMatch(/\babsolute\b/);
    expect(toast.className).not.toMatch(/\bfixed\b|\btop-2\b/);
    // jsdom has no layout: the label's bottom is 0, so the note sits 4px under it.
    expect(toast.style.top).toBe('4px');
  });
});

describe('A5-F05: skeleton feedback counts the hidden digits', () => {
  it('three hidden digits (s7_g_t3): plural when empty, "לא כל הספרות" when wrong', () => {
    const t = byId('s7_g_t3');
    load(7, t);
    boardOf(5006);
    expect(verdict().sub).toBe('כתבו את הספרות החסרות בתיבות הריקות כדי להמשיך.');
    ws().setOperandDigit('a', 'hundreds', '9');
    ws().setOperandDigit('a', 'tens', '9');
    ws().setOperandDigit('a', 'units', '9');
    expect(verdict().sub).toBe('לא כל הספרות שכתבתם נכונות. בדקו שוב בעזרת הלבנים בבית המספרים.');
  });

  it('one hidden digit (s7_r_t2): singular, as before', () => {
    load(7, byId('s7_r_t2'));
    boardOf(568);
    expect(verdict().sub).toBe('כתבו את הספרה החסרה בתיבה הריקה כדי להמשיך.');
    ws().setOperandDigit('a', 'units', '9');
    expect(verdict().sub).toBe('הספרה החסרה שכתבתם אינה נכונה. בדקו שוב בעזרת הלבנים בבית המספרים.');
  });

  it('meeting 8 (s8_g_t7, three digits): plural, and no blocks', () => {
    load(8, byId('s8_g_t7'));
    expect(verdict().sub).toBe('כתבו את הספרות החסרות בתיבות הריקות כדי להמשיך.');
    for (const p of ['hundreds', 'tens', 'units'] as const) ws().setOperandDigit('a', p, '9');
    expect(verdict().sub).toBe('לא כל הספרות שכתבתם נכונות. בדקו שוב.');
  });
});

describe('A5-F10 / A7-005 / A4-F09: the memory-circle note', () => {
  // The ordinary success of a one-digit skeleton is its own "נכון! …" (owner, 9.10.2026; PRD 14 §ב).
  it('s5_r_t7 (4▢2 − 128), board on the discovered 442, circles empty: the ordinary success', () => {
    const t = byId('s5_r_t7');
    load(5, t);
    boardOf(442);
    ws().setOperandDigit('a', 'tens', '4');
    useWorkspaceStore.setState({ answerDigits: { hundreds: '3', tens: '1', units: '4' }, carryDigits: {} } as any);
    const v = verdict();
    expect(v.kind).toBe('success');
    expect(v.title).toBe('נכון!');
    expect(plain(v.sub)).toBe(plain('הספרה החסרה היא 4: \u200f442 − 128 = 314.'));
  });

  it('addition (s4): only המרה; subtraction (s5): only פריטה', () => {
    const add = bank.find((t) => t.id.startsWith('s4_') && t.type === 'vertical_addition' && t.requiresGrouping && !t.isSubtraction && !t.hiddenDigits && !t.revealedResultDigits)!;
    load(4, add);
    boardOf(add.correctAnswer as number);
    const target = (add.numberA ?? 0) + (add.numberB ?? 0);
    useWorkspaceStore.setState({ answerDigits: Object.fromEntries((['thousands', 'hundreds', 'tens', 'units'] as const).map((p, i) => [p, String(target).padStart(4, '0')[i]])) } as any);
    expect(verdict().sub).toBe('פתרתם נכון! בפעם הבאה, רשמו כל המרה בעיגולי הזיכרון שבראש הטורים.');

    const sub = byId('s5_g_t1');
    load(5, sub);
    const diff = (sub.numberA ?? 0) - (sub.numberB ?? 0);
    boardOf(diff);
    useWorkspaceStore.setState({ answerDigits: Object.fromEntries((['thousands', 'hundreds', 'tens', 'units'] as const).map((p, i) => [p, String(diff).padStart(4, '0')[i]])) } as any);
    expect(verdict().sub).toBe('פתרתם נכון! בפעם הבאה, אחרי כל פריטה רשמו בעיגולי הזיכרון כמה לבנים יש עכשיו בכל טור שהשתנה.');
  });
});

describe('A7-004: an empty board in subtraction asks for the first number only', () => {
  it('subtraction and addition', () => {
    load(5, byId('s5_g_t1'));
    expect(verdict().sub).toBe('עוד אין לבנים בבית המספרים. בנו את המספר הראשון שבתרגיל. לחצו על לבנה שמתחת לבית המספרים, או גררו אותה אליו.');
    const add = bank.find((t) => t.id.startsWith('s4_') && t.type === 'vertical_addition' && !t.isSubtraction)!;
    load(4, add);
    expect(verdict().sub).toBe('עוד אין לבנים בבית המספרים. לחצו על אחת הלבנים שמתחת לבית המספרים, או גררו אותה אליו, ובנו את המספרים שבתרגיל.');
  });
});

describe('A7-011: odd tens in an even-tens exercise', () => {
  it('s7_r_t7 (150): the actions name their result with its count', () => {
    load(7, byId('s7_r_t7'));
    board({ hundreds: 1, tens: 5 });
    ws().addRepresentation();
    expect(ws().feedback?.sub).toBe('בדרך הזאת מספר העשרות צריך להיות זוגי. פרטו עשרת אחת לעשר יחידות, או קבצו 10 יחידות לעשרת אחת.');
  });
});

describe('A4-F01: the blocks of the instruction built, the conversion not made', () => {
  it('s3_r_t2: 3 hundreds and 4 tens, nothing broken → "פרטו", the hundred named', () => {
    const t = byId('s3_r_t2');
    load(3, t);
    expect(boardBeforeConversion(t)).toEqual({ ...EMPTY_COUNTS, hundreds: 3, tens: 4 });
    board({ hundreds: 3, tens: 4 });
    useWorkspaceStore.setState({ answerDigits: { hundreds: '3', tens: '4', units: '0' } } as any);
    const v = verdict();
    expect(v).toMatchObject({ kind: 'failure', detail: 'conversion_skipped', title: 'פִּרְטוּ 🧱' });
    expect(v.sub).toBe('בניתם את הלבנים שבהנחיה. עכשיו לחצו על לבנת מאה כדי לפרוט אותה.');
  });

  it('s3_g_t4 (two breaks): the board before both is the one built', () => {
    expect(boardBeforeConversion(byId('s3_g_t4'))).toEqual({ ...EMPTY_COUNTS, thousands: 5, hundreds: 2, tens: 3 });
  });

  it('s7_r_t1: 12 tens and 5 units, nothing grouped → "קבצו", the button and its column named', () => {
    const t = byId('s7_r_t1');
    load(7, t);
    expect(boardBeforeConversion(t)).toEqual({ ...EMPTY_COUNTS, tens: 12, units: 5 });
    board({ tens: 12, units: 5 });
    const v = verdict();
    expect(v).toMatchObject({ kind: 'failure', detail: 'conversion_skipped', title: 'קַבְּצוּ 🧱' });
    expect(v.sub).toBe('בניתם את הלבנים שבהנחיה. עכשיו לחצו על הכפתור "קבצו 10" שבראש טור העשרות.');
  });

  it('any other wrong board keeps the existing sentence', () => {
    load(3, byId('s3_r_t2'));
    board({ hundreds: 3, tens: 3 });
    expect(verdict()).toMatchObject({ detail: 'wrong_representation' });
  });
});

describe('A4-F03: revealed result digits do not open "התקדם"', () => {
  for (const [id, meeting] of [['s4_r_t7', 4], ['s6_r_t7', 6]] as const) {
    it(`${id} on a fresh start: closed; a typed digit opens it`, () => {
      load(meeting, byId(id));
      expect(byId(id).revealedResultDigits?.length).toBeGreaterThan(0);
      expect(selectCanProceed(ws())).toBe(false);
      ws().setAnswerDigit('tens', '7');
      expect(selectCanProceed(ws())).toBe(true);
    });
  }
});
