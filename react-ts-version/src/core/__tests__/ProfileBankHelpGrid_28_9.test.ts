/**
 * Four learner-side fixes of 28.9.2026, each driven through the real stores
 * and the real student listener (FirebaseSyncService). Only the Realtime
 * Database transport is replaced: onValue hands this file the listener, so a
 * test can deliver the learner record exactly as the teacher's write would.
 *
 * X14 — PRD 19 §ב: "שינוי פרופיל במהלך תרגיל פעיל נשמר כהתאמה ממתינה (Pending
 *       Adaptation) ומוחל אך ורק במעבר לתרגיל הבא".
 * X16 — PRD 26: "Never load, prefetch, or fall back to an exercise from the
 *       non-matching bank under any circumstance." Owner, 28.9.2026: "ילד לא
 *       יתחיל שלב לפני שהוא עשה את השלבים הקודמים".
 * X59 — PRD 29 §ב: "helpRequested המאפשר מיתוג דו-כיווני לקריאת עזרה"; מסמך 03
 *       §3.1: "ניתנת לביטול בכל עת".
 * X60 — register deviation 18 (the "לוח חיבור" tab after the grid opened once
 *       in the meeting) and decision ב ("שום דבר לא סוגר אותו אוטומטית").
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const rtdb = vi.hoisted(() => ({
  listeners: new Map<string, (snap: any) => void>(),
  updates: [] as Array<{ path: string; value: Record<string, any> }>,
}));

vi.mock('firebase/database', async () => {
  const actual = await vi.importActual<any>('firebase/database');
  const pathOf = (r: any) => String(r?._path ?? '').replace(/^\//, '');
  return {
    ...actual,
    onValue: (q: any, cb: any) => {
      rtdb.listeners.set(pathOf(q), cb);
      return () => {};
    },
    update: (r: any, value: any) => {
      rtdb.updates.push({ path: pathOf(r), value });
      return Promise.resolve();
    },
    set: () => Promise.resolve(),
    onDisconnect: () => ({ set: () => Promise.resolve(), cancel: () => Promise.resolve() }),
  };
});

vi.mock('@/infrastructure/services/FirebaseSyncService', async () => {
  const actual = await vi.importActual<any>('@/infrastructure/services/FirebaseSyncService');
  return { ...actual, emitTelemetry: () => Promise.resolve() };
});

import {
  useWorkspaceStore,
  getActiveTasks,
  resolveLearningPath,
} from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { EMPTY_COUNTS } from '@/core/placeValue';
import { ENHANCED_SUPPORT_PROFILE_ID } from '@/core/supportProfile';
import { approvePath } from '@/test/approvedPath';
import { resetThrottledWrites } from '@/infrastructure/services/ThrottledRtdbWriter';

const STUDENT = 'student_user3';
const ws = () => useWorkspaceStore.getState();
const svc = firebaseSyncService as any;
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

/** 142 + 23 = 165, no carry: a learner on either profile can solve it. */
const T1 = getSessionTasks(4, 'remediation_path').find((t) => t.id === 's4_r_t1') as SessionTask;
const T2 = getSessionTasks(4, 'remediation_path').find((t) => t.id === 's4_r_t2') as SessionTask;

/** The learner record as the teacher's writes leave it; delivered to the student listener. */
let record: Record<string, any> = {};
function deliver(changes: Record<string, any>) {
  record = { ...record, ...changes };
  for (const [k, v] of Object.entries(changes)) if (v === null) delete record[k];
  const cb = rtdb.listeners.get(`users/students/${STUDENT}`);
  expect(cb, 'the student listener is subscribed').toBeTruthy();
  cb!({ exists: () => true, val: () => ({ ...record }) });
}
const enhanced = { support_profile_id: ENHANCED_SUPPORT_PROFILE_ID, enhanced_support_profile: true };
const standard = { support_profile_id: null, enhanced_support_profile: false };

function signIn() {
  useAuthStore.setState({ user: { uid: STUDENT, student_id: 3 } as any, role: 'student', isAuthenticated: true });
  useStore.setState({ students: {} as any });
  record = {};
  ws().resetWorkspace();
  svc.startSync(STUDENT, { uid: STUDENT });
}

/** Meeting 4 on the two exercises above, the way a learner reaches them. */
function startMeeting4() {
  approvePath('remediation_path');
  ws().initSession(4, false);
  useWorkspaceStore.setState({ dynamicTasks: [T1, T2], standardTaskIdx: 0 } as any);
}

/** Solve 142 + 23 and press "התקדם": the next exercise starts. */
function solveFirstExercise() {
  useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, hundreds: 1, tens: 6, units: 5 } });
  ws().setAnswerDigit('units', '5');
  ws().setAnswerDigit('tens', '6');
  ws().setAnswerDigit('hundreds', '1');
  ws().proceed();
  expect(ws().standardTaskIdx, 'the next exercise started').toBe(1);
}

/** The Module 9 lock on a carry column (47 + 28): on only for the applied enhanced profile. */
const lockOn = () => ws().isColumnInputLocked('units', 47, 28, false);

afterEach(() => {
  vi.useRealTimers();
});

/* ── X14 ─────────────────────────────────────────────────────────────────── */

describe('X14 — a support-profile change waits for the next exercise (PRD 19 §ב)', () => {
  beforeEach(() => {
    signIn();
  });

  it('with no exercise on screen the first read of the record applies at once', () => {
    deliver(enhanced);
    expect(ws().activeSupportProfileId).toBe(ENHANCED_SUPPORT_PROFILE_ID);
    expect(ws().hasPendingSupportProfile).toBe(false);
  });

  it('switched ON mid-exercise: no lock and no grid gate until the next exercise, then both', () => {
    deliver(standard);
    startMeeting4();
    expect(lockOn()).toBe(false);

    deliver(enhanced);
    expect(ws().activeSupportProfileId, 'the exercise on screen keeps its profile').toBeNull();
    expect(ws().hasPendingSupportProfile).toBe(true);
    expect(lockOn()).toBe(false);

    solveFirstExercise();
    expect(ws().activeSupportProfileId).toBe(ENHANCED_SUPPORT_PROFILE_ID);
    expect(ws().hasPendingSupportProfile).toBe(false);
    expect(lockOn()).toBe(true);
  });

  it('switched OFF mid-exercise: the lock stays for this exercise and goes at the next', () => {
    deliver(enhanced);
    startMeeting4();
    expect(lockOn()).toBe(true);

    deliver(standard);
    expect(ws().activeSupportProfileId).toBe(ENHANCED_SUPPORT_PROFILE_ID);
    expect(lockOn()).toBe(true);

    solveFirstExercise();
    expect(ws().activeSupportProfileId).toBeNull();
    expect(lockOn()).toBe(false);
  });

  it('switched on and back off within one exercise: nothing is left waiting', () => {
    deliver(standard);
    startMeeting4();
    deliver(enhanced);
    deliver(standard);
    expect(ws().hasPendingSupportProfile).toBe(false);
    solveFirstExercise();
    expect(ws().activeSupportProfileId).toBeNull();
  });

  it('a branch start, a meeting start and a restore each apply a waiting change', () => {
    // branch
    deliver(standard);
    approvePath('green_path');
    ws().initSession(4, false);
    deliver(enhanced);
    useWorkspaceStore.setState({ flowStatus: 'task' });
    expect(ws().activeSupportProfileId).toBeNull();
    ws().selectBranch('challenge');
    expect(ws().activeSupportProfileId).toBe(ENHANCED_SUPPORT_PROFILE_ID);

    // meeting start
    deliver(standard);
    expect(ws().activeSupportProfileId, 'still the branch exercise').toBe(ENHANCED_SUPPORT_PROFILE_ID);
    ws().initSession(5, false);
    expect(ws().activeSupportProfileId).toBeNull();

    // restore (a reload)
    deliver(enhanced);
    expect(ws().activeSupportProfileId).toBeNull();
    ws().restoreSession({ sessionNumber: 5, flowStatus: 'task', standardTaskIdx: 0, activeBankPath: 'green_path' });
    expect(ws().activeSupportProfileId).toBe(ENHANCED_SUPPORT_PROFILE_ID);
  });

  it('on the choice screen (no exercise in progress) a change applies at once', () => {
    deliver(standard);
    startMeeting4();
    useWorkspaceStore.setState({ flowStatus: 'choice_branch' });
    deliver(enhanced);
    expect(ws().activeSupportProfileId).toBe(ENHANCED_SUPPORT_PROFILE_ID);
  });

  it('the lock, the grid gate and the hesitation radar read only the applied value', () => {
    const store = src('application/useWorkspaceStore.ts');
    const page = src('features/workspace/StudentWorkspacePage.tsx');
    const radar = src('application/useCognitiveHesitationRadar.ts');
    const listener = src('infrastructure/services/FirebaseSyncService.ts');
    expect(store).not.toMatch(/\(authUser as any\)\?\.support_profile_id/);
    expect(store).not.toMatch(/\(s as any\)\.support_profile_id/);
    expect(store.match(/const supportProfile = s\.activeSupportProfileId;/g)).toHaveLength(2);
    expect(page).toContain('useWorkspaceStore((s) => s.activeSupportProfileId === ENHANCED_SUPPORT_PROFILE_ID)');
    expect(page).not.toContain('hasEnhancedSupportProfile(myData');
    expect(radar).toContain('const supportProfileId = wsState.activeSupportProfileId;');
    expect(listener).not.toContain('wsOverrides.support_profile_id');
    expect(listener).toContain('receiveSupportProfile(');
  });
});

/* ── X16 ─────────────────────────────────────────────────────────────────── */

describe('X16 — never the wrong path’s bank (PRD 26; owner, 28.9.2026)', () => {
  beforeEach(() => {
    signIn();
  });

  it('an unknown path is "no path": meetings 3–8 load no exercise, never the green bank', () => {
    expect(resolveLearningPath()).toBeNull();
    for (const m of [3, 4, 5, 6, 7, 8] as const) {
      ws().initSession(m, false);
      expect(ws().activeBankPath, `meeting ${m}`).toBeNull();
      expect(getActiveTasks(ws()), `meeting ${m}`).toEqual([]);
    }
    // Meeting 1 has one bank for everyone.
    ws().initSession(1, false);
    expect(getActiveTasks(ws()).length).toBeGreaterThan(0);
  });

  it('(a) a reload restores the bank the meeting was pinned to, before the record arrives', () => {
    approvePath('remediation_path');
    ws().initSession(4, false);
    const snapshot = JSON.parse(JSON.stringify(svc.getSyncableWorkspaceState()));
    expect(snapshot.activeBankPath).toBe('remediation_path');

    // The reload: a fresh store, and no learner record yet.
    useStore.setState({ students: {} as any });
    ws().resetWorkspace();
    ws().restoreSession(snapshot);
    expect(ws().activeBankPath).toBe('remediation_path');
    expect(getActiveTasks(ws()).map((t) => t.id)).toEqual(getSessionTasks(4, 'remediation_path').map((t) => t.id));
  });

  it('(a) an older snapshot without the pin, before the record arrives, loads nothing', () => {
    ws().restoreSession({ sessionNumber: 4, flowStatus: 'task', standardTaskIdx: 2 });
    expect(getActiveTasks(ws())).toEqual([]);
  });

  it('(b) a reload inside a branch rebuilds the branch from the pinned path', () => {
    ws().restoreSession({
      sessionNumber: 4,
      flowStatus: 'task',
      standardTaskIdx: 7,
      selectedBranch: 'challenge',
      activeBankPath: 'remediation_path',
    });
    const ids = getActiveTasks(ws()).map((t) => t.id);
    expect(ids).toEqual([
      ...getSessionTasks(4, 'remediation_path').map((t) => t.id),
      ...getSessionBranchTasks(4, 'challenge', 'remediation_path').map((t) => t.id),
    ]);
  });

  it('(b) choosing a branch takes it from the pinned path, even when the record says another', () => {
    approvePath('remediation_path');
    ws().initSession(4, false);
    approvePath('green_path'); // changed mid-exercise; applies at the next boundary
    useWorkspaceStore.setState({ standardTaskIdx: 7, flowStatus: 'choice_branch' });
    ws().selectBranch('reinforcement');
    const branchIds = getSessionBranchTasks(4, 'reinforcement', 'remediation_path').map((t) => t.id);
    expect(getActiveTasks(ws()).slice(7).map((t) => t.id)).toEqual(branchIds);
  });

  it('(b) without any path, choosing a branch loads nothing', () => {
    ws().initSession(4, false);
    useWorkspaceStore.setState({ standardTaskIdx: 7, flowStatus: 'choice_branch' });
    ws().selectBranch('challenge');
    expect(ws().selectedBranch).toBeNull();
    expect(ws().flowStatus).toBe('choice_branch');
  });

  it('(d) a path the server reset to null is gone from the learner store, not kept from before', () => {
    deliver({ pedagogicalPath: 'green_path', teacher_gate_approved: true, routeStatus: 'APPROVED' });
    expect(resolveLearningPath()).toBe('green_path');
    deliver({ pedagogicalPath: null, teacher_gate_approved: false, routeStatus: null });
    expect(resolveLearningPath()).toBeNull();
  });

  it('(d) the client resets write pedagogicalPath: null, as the server reset does', () => {
    const store = src('application/useStore.ts');
    expect(store).not.toContain("pedagogicalPath: 'green_path'");
    expect(store.match(/pedagogicalPath: null,/g)).toHaveLength(2);
  });

  it('a record that loses its path mid-meeting keeps the meeting on its pinned path at the next exercise', () => {
    approvePath('remediation_path');
    ws().initSession(4, false);
    expect(getActiveTasks(ws())[0]?.id).toBe('s4_r_t1');
    useStore.setState({ students: {} as any });
    solveFirstExercise();
    expect(ws().activeBankPath).toBe('remediation_path');
    expect(getActiveTasks(ws())[1]?.id).toBe('s4_r_t2');
  });
});

/* ── X59 ─────────────────────────────────────────────────────────────────── */

describe('X59 — the call-teacher button follows the record (PRD 29 §ב)', () => {
  const helpWrites = () => rtdb.updates.filter((u) => u.path === `users/students/${STUDENT}` && 'helpRequested' in u.value);

  beforeEach(() => {
    vi.useFakeTimers();
    resetThrottledWrites();
    signIn();
    deliver(standard);
    startMeeting4();
    rtdb.updates.length = 0;
  });

  it('a call survives the next exercise and can be taken back there', () => {
    ws().requestSilentHelp();
    vi.advanceTimersByTime(1100);
    expect(ws().hasRequestedBasicHelp).toBe(true);
    deliver({ helpRequested: true });

    solveFirstExercise();
    expect(ws().hasRequestedBasicHelp, 'still called in the next exercise').toBe(true);

    ws().requestSilentHelp();
    vi.advanceTimersByTime(1100);
    expect(ws().hasRequestedBasicHelp).toBe(false);
    expect(helpWrites().at(-1)?.value.helpRequested).toBe(false);
  });

  it('once the teacher marks it handled, the next press calls again', () => {
    ws().requestSilentHelp();
    vi.advanceTimersByTime(1100);
    deliver({ helpRequested: true });

    // StudentLearningConditionsDrawer: helpRequested:false.
    deliver({ helpRequested: false });
    expect(ws().hasRequestedBasicHelp).toBe(false);

    ws().requestSilentHelp();
    vi.advanceTimersByTime(1100);
    expect(ws().hasRequestedBasicHelp).toBe(true);
    expect(helpWrites().at(-1)?.value.helpRequested).toBe(true);
  });

  it('a record update that arrives before the press is written does not undo the press', () => {
    ws().requestSilentHelp();
    deliver({ lastPing: 1 }); // a heartbeat, helpRequested still unset on the server
    expect(ws().hasRequestedBasicHelp).toBe(true);
  });

  it('a reload shows the call the record still carries', () => {
    deliver({ helpRequested: true });
    ws().resetWorkspace();
    svc.startSync(STUDENT, { uid: STUDENT });
    expect(ws().hasRequestedBasicHelp).toBe(false);
    deliver({});
    expect(ws().hasRequestedBasicHelp).toBe(true);
  });

  it('a new meeting does not clear it either', () => {
    deliver({ helpRequested: true });
    approvePath('remediation_path');
    ws().initSession(5, false);
    expect(ws().hasRequestedBasicHelp).toBe(true);
  });
});

/* ── X60 ─────────────────────────────────────────────────────────────────── */

describe('X60 — the grid and its return tab belong to the meeting (register 18, decision ב)', () => {
  beforeEach(() => {
    signIn();
    deliver(enhanced);
    startMeeting4();
  });

  it('an open grid stays open across an exercise change', () => {
    ws().openAdditionHelper();
    solveFirstExercise();
    expect(ws().isAdditionHelperOpen).toBe(true);
    expect(ws().additionHelperOffered).toBe(true);
  });

  it('the return tab stays after an exercise change', () => {
    ws().openAdditionHelper();
    ws().closeAdditionHelper();
    solveFirstExercise();
    expect(ws().additionHelperOffered).toBe(true);
    expect(ws().isAdditionHelperOpen).toBe(false);
  });

  it('both survive a reload', () => {
    ws().openAdditionHelper();
    const open = JSON.parse(JSON.stringify(svc.getSyncableWorkspaceState()));
    expect(open.isAdditionHelperOpen).toBe(true);
    expect(open.additionHelperOffered).toBe(true);
    ws().resetWorkspace();
    ws().restoreSession(open);
    expect(ws().isAdditionHelperOpen).toBe(true);
    expect(ws().additionHelperOffered).toBe(true);

    ws().closeAdditionHelper();
    const closed = JSON.parse(JSON.stringify(svc.getSyncableWorkspaceState()));
    ws().resetWorkspace();
    ws().restoreSession(closed);
    expect(ws().isAdditionHelperOpen).toBe(false);
    expect(ws().additionHelperOffered, 'the tab is back after the reload').toBe(true);
  });

  it('a new meeting starts without them', () => {
    ws().openAdditionHelper();
    approvePath('remediation_path');
    ws().initSession(5, false);
    expect(ws().isAdditionHelperOpen).toBe(false);
    expect(ws().additionHelperOffered).toBe(false);
  });

  it('the profile gate still decides whether they are shown (enhanced profile, not meetings 2 or 8)', () => {
    const page = src('features/workspace/StudentWorkspacePage.tsx');
    // …and only in an addition exercise (owner, 1.10.2026, D7).
    expect(page).toContain('const isAdditionBoardEnabled = hasEnhancedSupport && sessionNumber >= 3 && sessionNumber <= 7 && isAdditionOnScreen;');
    expect(page).toContain('const isAdditionOnScreen = useWorkspaceStore((s) => isAdditionExercise(selectStandardTask(s)));');
    expect(page).toMatch(/isAdditionBoardEnabled && \(\s*<AnimatePresence>/);
    expect(page).toContain('isAdditionBoardEnabled && additionHelperOffered && !isAdditionHelperOpen');
  });
});
