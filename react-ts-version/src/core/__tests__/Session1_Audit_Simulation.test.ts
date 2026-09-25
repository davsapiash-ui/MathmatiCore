import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useWorkspaceStore, getActiveTasks, selectCanProceed } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { SESSION1_TASKS } from '@/data/sessionTasks';
import { session1Checklist } from '@/core/session1Checklist';
import { EMPTY_COUNTS, type Place, type PlaceCounts } from '@/core/placeValue';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';

/**
 * Technical audit of meeting 1 by simulation (25.9.2026).
 *
 * A child drives the real store through the nine tasks of SESSION1_TASKS with
 * the gestures the UI offers: palette taps/drags (applyDrop from 'palette'),
 * a click on a block to decompose it (splitBlockClick), the "קבץ 10" button
 * (groupColumnClick), a column block dragged to the trash (applyDrop to
 * 'trash'), the trash button (clearBoard), undo, and digits typed one at a
 * time from the units leftward (the answer rows move focus leftward).
 * Typing goes through the same locks the components apply
 * (isRepresentationInputLocked / isColumnInputLocked), so an enhanced-support
 * child can only type what the screen lets them type.
 *
 * Tests whose names start with "BUG:" fail on purpose — each demonstrates a
 * defect found by this audit.
 */

const STUDENT = 'student_user12';
const ENHANCED = 'enhanced_cognitive_support';

const ws = () => useWorkspaceStore.getState();
const taskId = () => getActiveTasks(ws())[ws().standardTaskIdx]?.id;
const task = () => getActiveTasks(ws())[ws().standardTaskIdx];
const counts = (c: Partial<PlaceCounts>) => ({ ...EMPTY_COUNTS, ...c });
const canProceed = () => selectCanProceed(ws());

/* ── gestures ── */
const tap = (place: Place, n = 1) => {
  for (let i = 0; i < n; i++) ws().applyDrop({ source: 'palette', sourcePlace: place, target: { kind: 'column', place } });
};
const toTrash = (place: Place, n = 1) => {
  for (let i = 0; i < n; i++) ws().applyDrop({ source: 'column', sourcePlace: place, target: { kind: 'trash' } });
};
const split = (place: Place) => ws().splitBlockClick(place);
const group = (place: Place) => ws().groupColumnClick(place);

/** A digit typed into a result cell, only if the component would accept it. Returns whether it was accepted. */
function type(place: Place, digit: string): boolean {
  const t = task();
  if (t?.type === 'representation') {
    if (ws().isRepresentationInputLocked()) return false;
  } else if (t && (t.type === 'addition_simple' || t.type === 'vertical_addition')) {
    if (ws().isColumnInputLocked(place, t.numberA ?? 0, t.numberB ?? 0, t.isSubtraction)) return false;
  }
  ws().setAnswerDigit(place, digit);
  return true;
}
/** Units first, then leftward — the order the answer row's focus moves. */
function typeNumber(n: number) {
  const s = String(n);
  const places: Place[] = ['units', 'tens', 'hundreds', 'thousands'];
  for (let i = 0; i < s.length; i++) type(places[i], s[s.length - 1 - i]);
}
const memo = (place: Place, v: string) => ws().setCarryDigit(place, v);

/** Presses "התקדם" and lets the success/failure toast run out. */
function proceed(ms = 4000) {
  ws().proceed();
  vi.advanceTimersByTime(ms);
}

/** The Realtime Database drops null values and empty objects. */
function viaDatabase(v: any): any {
  if (Array.isArray(v)) return v.map(viaDatabase);
  if (v && typeof v === 'object') {
    const out: Record<string, any> = {};
    for (const [k, x] of Object.entries(v)) {
      const y = viaDatabase(x);
      if (y === null || y === undefined) continue;
      if (typeof y === 'object' && !Array.isArray(y) && Object.keys(y).length === 0) continue;
      out[k] = y;
    }
    return out;
  }
  return v;
}

/** Browser reload: what the sync wrote, back through the database, into a fresh workspace. */
function reload() {
  const snap = viaDatabase(JSON.parse(JSON.stringify((firebaseSyncService as any).getSyncableWorkspaceState())));
  ws().resetWorkspace();
  ws().restoreSession(snap);
}

function expectClean(where: string) {
  const s = ws();
  expect(s.helpState, `${where}: helpState`).toBe('closed');
  expect(s.currentState, `${where}: currentState`).not.toBe('SOCRATIC_ACTIVE');
  expect(s.keyboardState, `${where}: keyboardState`).toBe('UNLOCKED');
  expect(s.isBoardLocked, `${where}: isBoardLocked`).toBe(false);
  expect(s.isSocraticCardLocked, `${where}: isSocraticCardLocked`).toBe(false);
}

function login(profile?: string) {
  useAuthStore.setState({
    user: { uid: STUDENT, name: 'user12', ...(profile ? { support_profile_id: profile } : {}) } as any,
    role: 'student',
    isAuthenticated: true,
  });
  useStore.setState({ students: { [STUDENT]: { id: STUDENT, highestCompletedMeeting: 0 } as any } as any });
}

/**
 * Each task split into a first half and the rest, both the natural way.
 * half + finish = the full correct solution of that task.
 */
interface Step { id: string; half: () => void; finish: () => void; board: PlaceCounts }
const STEPS: Step[] = [
  {
    id: 's1_sandbox_controlled',
    half: () => { tap('hundreds'); tap('tens', 2); },
    finish: () => { tap('hundreds'); tap('tens'); },
    board: counts({ hundreds: 2, tens: 3 }),
  },
  {
    id: 's1_decompose_hundred',
    half: () => { /* the board opens on 230 */ },
    finish: () => split('hundreds'),
    board: counts({ hundreds: 1, tens: 13 }),
  },
  {
    id: 's1_build_305',
    half: () => tap('hundreds', 3),
    finish: () => tap('units', 5),
    board: counts({ hundreds: 3, units: 5 }),
  },
  {
    id: 's1_undo_trash',
    half: () => ws().undo(),
    finish: () => ws().clearBoard(),
    board: counts({}),
  },
  {
    id: 's1_target_347',
    half: () => { tap('hundreds', 3); tap('tens', 4); tap('units', 7); split('tens'); type('units', '7'); },
    finish: () => { type('tens', '4'); type('hundreds', '3'); },
    board: counts({ hundreds: 3, tens: 3, units: 17 }),
  },
  {
    id: 's1_r_group26',
    half: () => group('units'),
    finish: () => { group('units'); typeNumber(26); },
    board: counts({ tens: 2, units: 6 }),
  },
  {
    id: 's1_t8',
    half: () => { tap('hundreds', 7); tap('tens', 1); tap('units', 3); tap('tens', 9); tap('units', 4); },
    finish: () => { group('tens'); memo('hundreds', '1'); typeNumber(807); },
    board: counts({ hundreds: 8, units: 7 }),
  },
  {
    id: 's1_r_sub61',
    half: () => { tap('tens', 6); tap('units', 1); split('tens'); memo('tens', '5'); memo('units', '11'); },
    finish: () => { toTrash('units', 4); toTrash('tens', 2); typeNumber(37); },
    board: counts({ tens: 3, units: 7 }),
  },
  {
    id: 's1_r_sub806',
    half: () => { tap('hundreds', 8); tap('units', 6); split('hundreds'); memo('hundreds', '7'); memo('tens', '10'); },
    finish: () => { toTrash('units', 1); toTrash('tens', 5); toTrash('hundreds', 3); typeNumber(455); },
    board: counts({ hundreds: 4, tens: 5, units: 5 }),
  },
];

/** Reach task `idx` the natural way, from the start of the meeting. */
function goTo(idx: number) {
  for (let i = 0; i < idx; i++) {
    expect(taskId()).toBe(STEPS[i].id);
    STEPS[i].half();
    STEPS[i].finish();
    proceed();
  }
  expect(taskId()).toBe(STEPS[idx].id);
}

function start(profile?: string, isASD = false) {
  login(profile);
  ws().resetWorkspace();
  ws().initSession(1, isASD, 0);
}

beforeEach(() => {
  vi.useFakeTimers();
  // The hint service is a Cloud Function; the static card is what the store opens with.
  vi.spyOn(SocraticEngine, 'getSocraticHint').mockResolvedValue(null as any);
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* ══════════════════════════════════════════════════════════════════════ */

describe('1. a full correct run, the way a child does it', () => {
  it('the steps under test are exactly meeting 1, in order', () => {
    expect(SESSION1_TASKS.map((t) => t.id)).toEqual(STEPS.map((s) => s.id));
  });

  for (const [label, profile, isASD] of [
    ['plain learner', undefined, false],
    ['isASD learner', undefined, true],
    ['enhanced-support learner', ENHANCED, false],
  ] as const) {
    it(`${label}: nine tasks, then the quiet end screen`, () => {
      start(profile, isASD);
      for (let i = 0; i < STEPS.length; i++) {
        const step = STEPS[i];
        expect(ws().standardTaskIdx, step.id).toBe(i);
        expect(taskId()).toBe(step.id);
        expectClean(`${step.id} start`);
        step.half();
        // A guided step is not done halfway (the exercises light "התקדם" on any board).
        if (task()!.type === 'session1_intro' || step.id === 's1_target_347') expect(canProceed(), `${step.id} half`).toBe(false);
        step.finish();
        expect(ws().counts, `${step.id} board`).toEqual(step.board);
        expect(canProceed(), `${step.id} done`).toBe(true);
        expectClean(`${step.id} before התקדם`);
        ws().proceed();
        if (i < STEPS.length - 1) {
          expect(ws().standardTaskIdx, `after ${step.id}`).toBe(i + 1);
          vi.advanceTimersByTime(3000);
          expect(ws().feedback).toBeNull();
        }
      }
      // last task: the celebration, then the end screen
      expect(ws().awaitingNext).toBe(true);
      vi.advanceTimersByTime(2600);
      expect(ws().flowStatus).toBe('sessionDone');
      expect(ws().awaitingNext).toBe(false);
      expect(useStore.getState().students[STUDENT]?.highestCompletedMeeting).toBe(1);
    });
  }

  it('each task opens on the board מסמך 03 gives it', () => {
    start();
    const opening: Record<string, PlaceCounts> = {
      s1_sandbox_controlled: counts({}),
      s1_decompose_hundred: counts({ hundreds: 2, tens: 3 }),
      s1_build_305: counts({}),
      s1_undo_trash: counts({ hundreds: 3, units: 5 }),
      s1_target_347: counts({}),
      s1_r_group26: counts({ units: 26 }),
      s1_t8: counts({}),
      s1_r_sub61: counts({}),
      s1_r_sub806: counts({}),
    };
    for (let i = 0; i < STEPS.length; i++) {
      expect(ws().counts, STEPS[i].id).toEqual(opening[STEPS[i].id]);
      STEPS[i].half();
      STEPS[i].finish();
      proceed();
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════ */

describe('2. typical mistakes: is there always a way forward?', () => {
  beforeEach(() => start());

  it('sandbox: "התקדם" before five blocks does nothing; the fifth block turns it on', () => {
    tap('units', 4);
    expect(canProceed()).toBe(false);
    ws().proceed();
    expect(ws().standardTaskIdx).toBe(0);
    tap('units');
    expect(canProceed()).toBe(true);
  });

  it('step 3: decomposing a ten instead of the hundred also completes the step', () => {
    goTo(1);
    split('tens');
    expect(ws().counts).toEqual(counts({ hundreds: 2, tens: 2, units: 10 }));
    expect(canProceed()).toBe(true);
  });

  it('step 4: 305 as 2 hundreds, 10 tens, 5 units → second item shown; the group button fixes it', () => {
    goTo(2);
    tap('hundreds', 2); tap('tens', 10); tap('units', 5);
    const items = session1Checklist('s1_build_305', ws() as any)!;
    expect(items.map((i) => i.done)).toEqual([true, false]);
    expect(canProceed()).toBe(false);
    group('tens');
    expect(ws().counts).toEqual(counts({ hundreds: 3, units: 5 }));
    expect(canProceed()).toBe(true);
  });

  it('step 4: 350 instead of 305 → blocks to the trash, units in, done', () => {
    goTo(2);
    tap('hundreds', 3); tap('tens', 5);
    expect(canProceed()).toBe(false);
    toTrash('tens', 5); tap('units', 5);
    expect(canProceed()).toBe(true);
  });

  it('step 5: trash first, then undo (brings the board back) — both items done', () => {
    goTo(3);
    ws().clearBoard();
    ws().undo();
    expect(ws().counts).toEqual(counts({ hundreds: 3, units: 5 }));
    expect(canProceed()).toBe(true);
    proceed();
    expect(taskId()).toBe('s1_target_347');
    expect(ws().counts).toEqual(counts({}));
  });

  it('347 dragged straight as 3H 3T 17U (no decomposition): recoverable, but "decompose a ten" alone does not tick', () => {
    goTo(4);
    tap('hundreds', 3); tap('tens', 3); tap('units', 17);
    typeNumber(347);
    const done = () => session1Checklist('s1_target_347', ws() as any)!.map((i) => i.done);
    expect(done()).toEqual([true, false, true]);
    // The child does what the pending item says: decompose a ten.
    split('tens');
    expect(ws().counts).toEqual(counts({ hundreds: 3, tens: 2, units: 27 }));
    expect(done()).toEqual([true, false, true]); // still ⏳ — the board is no longer 3/3/17
    // Way out: group the units back (the button is showing: 27 ≥ 10).
    group('units');
    expect(done()).toEqual([true, true, true]);
    expect(canProceed()).toBe(true);
  });

  it('347: decomposing the hundred by mistake → undo, decompose the ten', () => {
    goTo(4);
    tap('hundreds', 3); tap('tens', 4); tap('units', 7);
    split('hundreds');
    expect(ws().counts).toEqual(counts({ hundreds: 2, tens: 14, units: 7 }));
    ws().undo();
    split('tens');
    typeNumber(347);
    expect(canProceed()).toBe(true);
  });

  it('347: typing 337 (reading the blocks) gets no message at all — "התקדם" stays off silently', () => {
    goTo(4);
    tap('hundreds', 3); tap('tens', 4); tap('units', 7); split('tens');
    typeNumber(337);
    expect(canProceed()).toBe(false);
    ws().proceed();
    expect(ws().feedback).toBeNull(); // documented: only the ⏳ on item 3
    // retyping the tens fixes it
    type('tens', '4');
    expect(canProceed()).toBe(true);
  });

  it('347: typing before building is allowed and counts once the board is right', () => {
    goTo(4);
    typeNumber(347);
    expect(canProceed()).toBe(false);
    tap('hundreds', 3); tap('tens', 4); tap('units', 7); split('tens');
    expect(canProceed()).toBe(true);
  });

  it('26: grouping only once → a clear "not yet", then the second grouping passes', () => {
    goTo(5);
    group('units');
    typeNumber(26);
    proceed();
    expect(ws().standardTaskIdx).toBe(5);
    group('units');
    proceed();
    expect(taskId()).toBe('s1_t8');
  });

  it('26: the cubes replaced by 2 tens + 6 units from the palette → told to group; a ten dragged into the units, then grouped, passes', () => {
    goTo(5);
    ws().clearBoard();
    tap('tens', 2); tap('units', 6);
    typeNumber(26);
    proceed();
    expect(ws().standardTaskIdx).toBe(5);
    ws().applyDrop({ source: 'column', sourcePlace: 'tens', target: { kind: 'column', place: 'units' } });
    expect(ws().counts).toEqual(counts({ tens: 1, units: 16 }));
    group('units');
    proceed();
    expect(taskId()).toBe('s1_t8');
  });

  it('26: four wrong answers open the coaching card (an empty press counts for nothing); after it closes, typing, dragging, undo and "התקדם" all work', () => {
    goTo(5);
    // Register 17: pressing "התקדם" with nothing written is not a wrong answer…
    for (let i = 0; i < 4; i++) proceed();
    expect(ws().helpState).toBe('closed');
    // …a wrong answer is.
    typeNumber(19); proceed();
    expect(ws().helpState).toBe('closed'); // the first wrong answer: feedback only
    proceed();
    expect(ws().helpState).toBe('friction'); // the second (מסמך 03 §3.1): the beat, then the card
    ws().helpFrictionDone();
    expect(ws().helpState).toBe('socratic');
    expect(ws().socraticTriggerReason).toBe('repeated_errors');
    ['units','tens'].forEach((p) => ws().setAnswerDigit(p as Place, ''));
    ws().closeHelp();
    expectClean('after the card');
    group('units');
    tap('units');
    ws().undo();
    group('units');
    expect(ws().counts).toEqual(counts({ tens: 2, units: 6 }));
    typeNumber(26);
    proceed();
    expect(taskId()).toBe('s1_t8');
    expectClean('s1_t8 start');
  });

  it('713 + 94: a wrong tens digit before grouping opens trigger 3; after the X everything works; an ungrouped board is refused with a reason', () => {
    goTo(6);
    STEPS[6].half(); // 7H 10T 7U
    type('units', '7');
    type('tens', '1');
    vi.advanceTimersByTime(0);
    expect(ws().helpState).toBe('socratic');
    expect(ws().socraticTriggerReason).toBe('conversion_not_performed');
    type('tens', '0');
    ws().closeHelp(); // the card's X
    expectClean('card closed by X');
    type('hundreds', '8');
    proceed();
    expect(ws().standardTaskIdx).toBe(6); // 10 tens on the board
    group('tens');
    proceed();
    expect(taskId()).toBe('s1_r_sub61');
  });

  it('713 + 94: typing the answer before building → "build it"; the second wrong answer starts the friction beat (מסמך 03 §3.1), and after the card everything works', () => {
    goTo(6);
    typeNumber(807);
    proceed();
    expect(ws().standardTaskIdx).toBe(6);
    expect(ws().helpState).toBe('closed'); // the first refusal: feedback only
    type('hundreds', '7'); // 707
    tap('hundreds', 7); tap('units', 7);
    proceed();
    expect(ws().helpState).toBe('friction'); // the second: the beat, then the card
    ws().helpFrictionDone();
    expect(ws().helpState).toBe('socratic');
    expect(ws().socraticTriggerReason).toBe('repeated_errors');
    ws().closeHelp();
    tap('hundreds');
    type('hundreds', '8');
    proceed();
    expect(taskId()).toBe('s1_r_sub61');
  });

  it('61 − 24: both numbers built → refused; the trash and a rebuild pass', () => {
    goTo(7);
    tap('tens', 6); tap('units', 1); tap('tens', 2); tap('units', 4);
    typeNumber(37);
    proceed();
    expect(ws().standardTaskIdx).toBe(7);
    toTrash('tens', 2); toTrash('units', 4);
    split('tens');
    toTrash('units', 4); toTrash('tens', 2);
    proceed();
    expect(taskId()).toBe('s1_r_sub806');
  });

  it('61 − 24: "smaller from larger" (3 in the units) before decomposing opens trigger 3', () => {
    goTo(7);
    tap('tens', 6); tap('units', 1);
    type('units', '3');
    vi.advanceTimersByTime(0);
    expect(ws().socraticTriggerReason).toBe('conversion_not_performed');
    ws().closeHelp();
    split('tens'); toTrash('units', 4); toTrash('tens', 2);
    typeNumber(37);
    proceed();
    expect(taskId()).toBe('s1_r_sub806');
  });

  it('806 − 351: a second hundred decomposed → overcrowded tens refused; the group button fixes it', () => {
    goTo(8);
    tap('hundreds', 8); tap('units', 6);
    split('hundreds'); split('hundreds');
    toTrash('units', 1); toTrash('tens', 5); toTrash('hundreds', 3);
    expect(ws().counts).toEqual(counts({ hundreds: 3, tens: 15, units: 5 }));
    typeNumber(455);
    proceed();
    expect(ws().flowStatus).toBe('task');
    group('tens');
    ws().proceed();
    vi.advanceTimersByTime(2600);
    expect(ws().flowStatus).toBe('sessionDone');
  });
});

/* ══════════════════════════════════════════════════════════════════════ */

describe('3. a reload in the middle of every task', () => {
  for (let i = 0; i < STEPS.length; i++) {
    it(`${STEPS[i].id}: reload halfway, then finish`, () => {
      start();
      goTo(i);
      STEPS[i].half();
      const before = { counts: { ...ws().counts }, answer: { ...ws().answerDigits }, undo: ws().undoStack.length };
      reload();
      expect(taskId()).toBe(STEPS[i].id);
      expect(ws().counts).toEqual(before.counts);
      expect(ws().answerDigits).toEqual(before.answer);
      expect(ws().undoStack.length).toBe(before.undo);
      expectClean(`${STEPS[i].id} after reload`);
      STEPS[i].finish();
      expect(canProceed()).toBe(true);
      ws().proceed();
      vi.advanceTimersByTime(2600);
      if (i < STEPS.length - 1) expect(taskId()).toBe(STEPS[i + 1].id);
      else expect(ws().flowStatus).toBe('sessionDone');
    });
  }

  it('undo after a reload still reverses the last digit and the last block (step 6)', () => {
    start();
    goTo(4);
    tap('hundreds', 3); tap('tens', 4); tap('units', 7); split('tens');
    type('units', '7');
    reload();
    ws().undo();
    expect(ws().answerDigits.units ?? '').toBe('');
    ws().undo();
    expect(ws().counts).toEqual(counts({ hundreds: 3, tens: 4, units: 7 }));
  });

  it('a reload with the coaching card open resumes with it closed and everything usable', () => {
    start();
    goTo(6);
    STEPS[6].half();
    type('tens', '1');
    vi.advanceTimersByTime(0);
    expect(ws().helpState).toBe('socratic');
    reload();
    expectClean('after reload');
    STEPS[6].finish();
    proceed();
    expect(taskId()).toBe('s1_r_sub61');
  });

  it('a reload during the final celebration: "התקדם" is live again and ends the meeting', () => {
    start();
    goTo(8);
    STEPS[8].half(); STEPS[8].finish();
    ws().proceed();
    vi.advanceTimersByTime(1000);
    reload();
    expect(ws().flowStatus).toBe('task');
    expect(canProceed()).toBe(true);
    ws().proceed();
    vi.advanceTimersByTime(2600);
    expect(ws().flowStatus).toBe('sessionDone');
  });
});

/* ══════════════════════════════════════════════════════════════════════ */

describe('4. enhanced-support profile', () => {
  beforeEach(() => start(ENHANCED));

  it('347: the result row stays closed until the board is 3/3/17', () => {
    goTo(4);
    tap('hundreds', 3); tap('tens', 4); tap('units', 7);
    expect(type('units', '7')).toBe(false);
    split('tens');
    expect(type('units', '7')).toBe(true);
  });

  it('26: the result row opens at 2 tens and 6 units', () => {
    goTo(5);
    expect(type('units', '6')).toBe(false);
    group('units');
    expect(type('units', '6')).toBe(false);
    group('units');
    expect(type('units', '6')).toBe(true);
  });

  it('713 + 94 built straight as 807: the tens cell stays locked (friction, documented)', () => {
    goTo(6);
    tap('hundreds', 8); tap('units', 7);
    expect(type('units', '7')).toBe(true);
    expect(type('tens', '0')).toBe(false); // locked: no grouping happened
    expect(type('hundreds', '8')).toBe(true);
    proceed();
    expect(ws().standardTaskIdx).toBe(6); // "87" ≠ 807
    // Ways out: decompose a hundred and group it back, or write in the tens memory circle.
    split('hundreds'); group('tens');
    expect(type('tens', '0')).toBe(true);
    proceed();
    expect(taskId()).toBe('s1_r_sub61');
  });

  it('61 − 24: the units cell opens with the decomposition', () => {
    goTo(7);
    tap('tens', 6); tap('units', 1);
    expect(type('units', '7')).toBe(false);
    split('tens');
    expect(type('units', '7')).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════ */

describe('5. timing', () => {
  beforeEach(() => start());

  it('a wrong card option locks new cards for 30 s, then the lock lifts by itself', () => {
    goTo(6);
    STEPS[6].half();
    type('tens', '1');
    vi.advanceTimersByTime(0);
    ws().triggerSocraticPenaltyLockout('hint');
    ws().closeHelp();
    ws().openSocraticCard('hesitation_45s');
    expect(ws().helpState).toBe('closed');
    vi.advanceTimersByTime(31_000);
    ws().openSocraticCard('hesitation_45s');
    expect(ws().helpState).toBe('socratic');
    expect(ws().isSocraticCardLocked).toBe(false);
  });

  it('the 45 s hesitation card on the target task closes cleanly and the checklist still completes', () => {
    goTo(4);
    tap('hundreds', 3);
    ws().setKeyboardSocratic(); // what StudentWorkspacePage does at 45 s on a non-intro task
    expect(ws().helpState).toBe('socratic');
    tap('tens', 4); tap('units', 7); split('tens');
    typeNumber(347);
    expect(canProceed()).toBe(true); // the open card blocks nothing
    ws().closeHelp();
    expectClean('after the hesitation card');
    expect(canProceed()).toBe(true);
  });

  it('a digit typed while the card is open leaves it open — it closes by its X, a correct option or the next exercise', () => {
    goTo(4);
    tap('hundreds', 3);
    ws().setKeyboardSocratic();
    tap('tens', 4); tap('units', 7); split('tens');
    typeNumber(347);
    vi.advanceTimersByTime(10_000);
    expect(ws().helpState).toBe('socratic');
  });

    it('fixed: pressing the help button during the final celebration leaves the meeting unfinished forever', () => {
    goTo(8);
    STEPS[8].half(); STEPS[8].finish();
    ws().proceed();
    vi.advanceTimersByTime(500);
    ws().requestSilentHelp(); // a new toast replaces the nonce the end-of-meeting callback waits for
    vi.advanceTimersByTime(60_000);
    // stuck: awaitingNext stays true, "התקדם" is off, the end screen never comes
    expect(canProceed()).toBe(false);
    expect(ws().flowStatus).toBe('sessionDone');
  });

  it('a card closed by X and a new card opened by the next wrong digit: the new card stays (no stray close timer)', () => {
    goTo(6);
    STEPS[6].half();
    type('tens', '1'); // card A
    vi.advanceTimersByTime(0);
    type('tens', '2');
    vi.advanceTimersByTime(1000);
    ws().closeHelp(); // the child closes A
    vi.advanceTimersByTime(500);
    type('tens', '5'); // another wrong tens digit → card B
    vi.advanceTimersByTime(0);
    expect(ws().helpState).toBe('socratic');
    vi.advanceTimersByTime(1600);
    expect(ws().helpState).toBe('socratic');
  });
});

/* ══════════════════════════════════════════════════════════════════════ */

describe('6. the coaching card and the next exercise', () => {
  beforeEach(() => start());

  /** 26 loose cubes, the answer typed first, "התקדם" four times → the card. */
  function cardInGroup26() {
    goTo(5);
    typeNumber(26);
    for (let i = 0; i < 4; i++) proceed();
    expect(ws().helpState).toBe('socratic');
    group('units'); group('units');
    ws().proceed();
    vi.advanceTimersByTime(3000);
    expect(taskId()).toBe('s1_t8');
  }

  it('fixed: a card left open when the exercise is solved stays open on the next exercise', () => {
    cardInGroup26();
    expect(ws().helpState).toBe('closed');
  });

  it('fixed: that stale card swallows the next exercise\'s own trigger (713 + 94, wrong tens digit)', () => {
    cardInGroup26();
    STEPS[6].half();
    type('tens', '1');
    vi.advanceTimersByTime(0);
    expect(ws().socraticTriggerReason).toBe('conversion_not_performed');
  });
});
