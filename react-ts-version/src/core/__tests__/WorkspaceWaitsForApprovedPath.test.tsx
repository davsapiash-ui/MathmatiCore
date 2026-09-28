/**
 * @vitest-environment jsdom
 */
/**
 * X16, the page side. PRD 26: "Never load, prefetch, or fall back to an
 * exercise from the non-matching bank under any circumstance." Owner,
 * 28.9.2026: "ילד לא יתחיל שלב לפני שהוא עשה את השלבים הקודמים" — a learner
 * without an approved path (absent on meeting-2 day, or after an absolute
 * reset) waits on the waiting screen in meetings 3–7 until the teacher
 * approves a path in the gate. Never the green bank by default.
 *
 * The real StudentWorkspacePage and the real stores; the screens around the
 * workspace are stubs that say which one is showing, and the learner record
 * reaches the page the way the student listener puts it in the store.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const cls = vi.hoisted(() => ({
  session: { active: true, status: 'active', sessionNumber: 3 as number | null, startedAt: 1, isLoaded: true },
  cached: null as any,
}));

vi.mock('firebase/database', () => ({
  ref: (_db: unknown, path?: string) => ({ path }),
  onValue: () => () => {},
  update: () => Promise.resolve(),
  set: () => Promise.resolve(),
  get: () => Promise.resolve({ exists: () => false, val: () => null }),
  push: () => ({ key: 'k' }),
  onDisconnect: () => ({ set: () => Promise.resolve(), cancel: () => Promise.resolve() }),
  serverTimestamp: () => 0,
  runTransaction: () => Promise.resolve(),
}));
vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  auth: { currentUser: null },
  authReady: Promise.resolve(false), // no screen recording in this test
  fetchServerClockOffset: async () => 0,
  serverNow: () => Date.now(),
}));
vi.mock('@/infrastructure/services/FirebaseSyncService', () => ({
  firebaseSyncService: {
    getLocalSessionProgress: () => cls.cached,
    clearLocalSessionProgress: () => {},
    syncHighestCompletedMeeting: () => Promise.resolve(),
    syncQMatrix: () => Promise.resolve(),
  },
  emitTelemetry: () => Promise.resolve(),
  resolveLearningPath: () => null,
}));
vi.mock('@/application/useActiveClassSession', () => ({ useActiveClassSession: () => cls.session }));
vi.mock('@/application/useCognitiveHesitationRadar', () => ({ useCognitiveHesitationRadar: () => {} }));
vi.mock('@/infrastructure/services/SocraticEngine', () => ({ SocraticEngine: { prefetchSessionHints: () => {}, getSocraticHint: async () => null } }));
vi.mock('rrweb', () => ({ record: () => () => {} }));

// The screens around the workspace: each says which one is on screen.
vi.mock('@/presentation/components/student/BeeFlightWaitingScreen', () => ({
  BeeFlightWaitingScreen: () => <div data-testid="bee-screen" />,
}));
vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <button type="button" data-testid="speech" data-text={text} />,
}));
vi.mock('@/features/workspace/tasks/TaskCard', async () => {
  const { useWorkspaceStore, getActiveTasks } = await import('@/application/useWorkspaceStore');
  return {
    TaskCard: () => {
      const s = useWorkspaceStore();
      return <div data-testid="task-card">{getActiveTasks(s)[s.standardTaskIdx]?.id ?? ''}</div>;
    },
  };
});
vi.mock('@/features/workspace/WorkspaceTopbar', () => ({ WorkspaceTopbar: () => null }));
vi.mock('@/features/workspace/board/PlaceValueBoard', () => ({ PlaceValueBoard: () => null }));
vi.mock('@/features/workspace/board/DienesBlock', () => ({ DienesBlock: () => null }));
vi.mock('@/features/workspace/overlays/FeedbackToast', () => ({ FeedbackToast: () => null }));
vi.mock('@/features/workspace/overlays/HelpOverlays', () => ({ HelpOverlays: () => null, SocraticSidePanel: () => null }));
vi.mock('@/features/workspace/overlays/StudentChatOverlay', () => ({ StudentChatOverlay: () => null }));
vi.mock('@/features/workspace/board/AdaptiveAdditionGrid', () => ({ AdaptiveAdditionGrid: () => null, ADDITION_GRID_HE: 'לוח החיבור' }));
vi.mock('@/features/workspace/board/useLeftClearOfSidePanel', () => ({ useLeftClearOfSidePanel: () => 24 }));
vi.mock('@/features/workspace/ClosingSentence', () => ({ ClosingSentence: () => null }));
vi.mock('@/features/workspace/StationOpening', () => ({ StationOpening: () => <div data-testid="station-opening" /> }));
vi.mock('@/features/workspace/overlays/ReinforcementOrChallengeScreen', () => ({ ReinforcementOrChallengeScreen: () => null }));
vi.mock('@/presentation/components/student/Session8ReflectionScreen', () => ({ Session8ReflectionScreen: () => null, REFLECTION_TEXT_HE: {} }));
vi.mock('@/presentation/components/student/ProjectorWaitingScreen', () => ({ ProjectorWaitingScreen: () => null }));
vi.mock('@/presentation/components/student/SessionPausedOverlay', () => ({ SessionPausedOverlay: () => null }));
vi.mock('@/presentation/components/student/SessionClosedOverlay', () => ({ SessionClosedOverlay: () => null }));

import { StudentWorkspacePage, FIREBASE_RESTORE_GRACE_MS } from '@/features/workspace/StudentWorkspacePage';
import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { getSessionTasks } from '@/data/sessionTasks';

const STUDENT = 'student_user5';
const ws = () => useWorkspaceStore.getState();

/** The learner record as the student listener stores it. */
function record(fields: Record<string, unknown> | null) {
  act(() => {
    useStore.setState({
      students: fields ? ({ [STUDENT]: { highestCompletedMeeting: 2, ...fields } } as any) : ({} as any),
      firebaseLoaded: fields !== null,
    });
  });
}
const approved = (path: 'green_path' | 'remediation_path') => ({
  teacher_gate_approved: true,
  routeStatus: 'APPROVED',
  pedagogicalPath: path,
});

function open(meeting: number) {
  cls.session = { ...cls.session, sessionNumber: meeting };
  return render(
    <MemoryRouter initialEntries={[`/workspace?meeting=${meeting}`]}>
      <StudentWorkspacePage />
    </MemoryRouter>
  );
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const bee = () => screen.queryByTestId('bee-screen');
const quiet = () => screen.queryByTestId('teacher-will-open-screen');
/** Either waiting screen: which one is the subject of its own tests below. */
const waiting = () => bee() ?? quiet();
const card = () => screen.queryByTestId('task-card');

beforeEach(() => {
  cls.cached = null;
  useAuthStore.setState({ user: { uid: STUDENT, student_id: 5 } as any, role: 'student', isAuthenticated: true });
  useWorkspaceStore.getState().resetWorkspace();
  // What the previous meeting left in the store.
  useWorkspaceStore.setState({ sessionNumber: 2, flowStatus: 'task' } as any);
  useStore.setState({ students: {} as any, firebaseLoaded: false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('meetings 3–7 start only on an approved path', () => {
  it('(c2) meeting 3 opened by the teacher before the learner is approved: the waiting screen, nothing loaded — and the meeting starts on the approved path the moment it arrives', async () => {
    record({ routeStatus: 'PENDING_TEACHER_APPROVAL', teacher_gate_approved: false });
    open(3);
    await flush();
    expect(waiting()).not.toBeNull();
    expect(card()).toBeNull();
    expect(ws().sessionNumber, 'meeting 3 was not started behind the waiting screen').toBe(2);

    record(approved('remediation_path'));
    await flush();
    expect(waiting()).toBeNull();
    expect(ws().sessionNumber).toBe(3);
    expect(ws().activeBankPath).toBe('remediation_path');
    expect(card()?.textContent).toBe(getSessionTasks(3, 'remediation_path')[0].id);
  });

  for (const meeting of [4, 5, 6, 7]) {
    it(`meeting ${meeting}, approved in the gate but no path on the record (an absolute reset): the waiting screen`, async () => {
      record({ teacher_gate_approved: true, routeStatus: 'APPROVED' });
      open(meeting);
      await flush();
      expect(waiting()).not.toBeNull();
      expect(ws().sessionNumber).toBe(2);
      expect(getActiveTasks(ws())).toEqual([]);
    });
  }

  it('a path on the record without the gate’s approval (left by an older reset) is not an approved path', async () => {
    record({ teacher_gate_approved: false, routeStatus: null, pedagogicalPath: 'green_path' });
    open(5);
    await flush();
    expect(waiting()).not.toBeNull();
    expect(ws().sessionNumber).toBe(2);
  });

  it('an approved learner starts on their own bank', async () => {
    record(approved('remediation_path'));
    open(5);
    await flush();
    expect(waiting()).toBeNull();
    expect(ws().sessionNumber).toBe(5);
    expect(card()?.textContent).toBe(getSessionTasks(5, 'remediation_path')[0].id);
  });

  it('(c) no local copy and a record slower than the grace period: the waiting screen, not the green bank — then the approved bank when the record arrives', async () => {
    vi.useFakeTimers();
    open(4);
    await act(async () => {
      vi.advanceTimersByTime(FIREBASE_RESTORE_GRACE_MS + 10);
    });
    expect(waiting()).not.toBeNull();
    expect(ws().sessionNumber, 'nothing initialised on the green bank').toBe(2);

    record(approved('remediation_path'));
    await flush();
    expect(ws().sessionNumber).toBe(4);
    expect(ws().activeBankPath).toBe('remediation_path');
    expect(card()?.textContent).toBe(getSessionTasks(4, 'remediation_path')[0].id);
  });

  it('(a) a refresh mid-meeting with a local copy that carries its bank goes on in that bank before the record arrives', async () => {
    cls.cached = { sessionNumber: 4, flowStatus: 'task', standardTaskIdx: 2, activeBankPath: 'remediation_path' };
    open(4);
    await flush();
    expect(ws().sessionNumber).toBe(4);
    expect(card()?.textContent).toBe(getSessionTasks(4, 'remediation_path')[2].id);
  });

  it('meeting 2 finished and awaiting the gate: the bee screen, and not the other one', async () => {
    record({ completedMeeting2: true, highestCompletedMeeting: 2, routeStatus: 'PENDING_TEACHER_APPROVAL', teacher_gate_approved: false });
    open(3);
    await flush();
    expect(bee()).not.toBeNull();
    expect(quiet()).toBeNull();
  });

  for (const [why, fields] of [
    ['absent on meeting-2 day (no completed meeting 2)', { highestCompletedMeeting: 1, completedMeeting2: false }],
    ['after an absolute reset (nothing completed, no path)', { highestCompletedMeeting: 0, completedMeeting2: false, teacher_gate_approved: false, routeStatus: null }],
    ['meeting 2 done and approved, but no path on the record', { teacher_gate_approved: true, routeStatus: 'APPROVED' }],
  ] as const) {
    it(`${why}: exactly "המורה תפתח את הפעילות בקרוב." and its read-aloud button — never the bee screen`, async () => {
      record(fields as Record<string, unknown>);
      open(4);
      await flush();
      expect(bee()).toBeNull();
      const screenEl = quiet();
      expect(screenEl).not.toBeNull();
      expect(screenEl!.textContent).toBe('המורה תפתח את הפעילות בקרוב.');
      const speech = screen.getAllByTestId('speech');
      expect(speech).toHaveLength(1);
      expect(speech[0].getAttribute('data-text')).toBe('המורה תפתח את הפעילות בקרוב.');
      expect(document.body.textContent).not.toContain('סיימתם את התחנה השנייה');
    });
  }

  it('(a) a local copy without its bank waits for the record instead of guessing green', async () => {
    cls.cached = { sessionNumber: 4, flowStatus: 'task', standardTaskIdx: 2 };
    open(4);
    await flush();
    expect(card()).toBeNull();
    expect(ws().sessionNumber).toBe(2);

    record(approved('remediation_path'));
    await flush();
    expect(ws().sessionNumber).toBe(4);
    expect(ws().standardTaskIdx).toBe(2);
    expect(card()?.textContent).toBe(getSessionTasks(4, 'remediation_path')[2].id);
  });
});
