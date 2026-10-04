/**
 * @vitest-environment jsdom
 */
/**
 * Catch-up (owner decision 2.10.2026): "המורה יקח את אותם ילדים שלא סיימו
 * למפגש נוסף \ זמן נוסף". The teacher opens a meeting again for the whole
 * class. A learner who had finished it waits on the quiet end screen, with no
 * hesitation measured behind it; a learner who had not goes on from the saved
 * copy of THAT meeting — also after the class moved on and workspaceState
 * holds a later meeting. The real StudentWorkspacePage and stores; the radar
 * hook records whether it is armed.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  session: { active: true, status: 'active', sessionNumber: 1 as number | null, startedAt: 1, isLoaded: true },
  listeners: new Map<string, (snap: { exists: () => boolean; val: () => unknown }) => void>(),
  radarActive: [] as boolean[],
  deviceCopies: {} as Record<number, unknown>,
  deviceReads: [] as Array<[string, number | undefined]>,
}));

vi.mock('firebase/database', () => ({
  ref: (_db: unknown, path?: string) => ({ path }),
  onValue: (r: { path?: string }, cb: (snap: { exists: () => boolean; val: () => unknown }) => void) => {
    if (r.path) h.listeners.set(r.path, cb);
    return () => {};
  },
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
  authReady: Promise.resolve(false),
  fetchServerClockOffset: async () => 0,
  serverNow: () => Date.now(),
}));
vi.mock('@/infrastructure/services/FirebaseSyncService', () => ({
  firebaseSyncService: {
    // Part A1's contract: this device's copy of the meeting asked for.
    getLocalSessionProgress: (uid: string, meeting?: number) => {
      h.deviceReads.push([uid, meeting]);
      return meeting === undefined ? null : (h.deviceCopies[meeting] ?? null);
    },
    clearLocalSessionProgress: () => {},
    syncHighestCompletedMeeting: () => Promise.resolve(),
    syncQMatrix: () => Promise.resolve(),
    mayWriteWorkspaceToRecord: () => true,
  },
  emitTelemetry: () => Promise.resolve(),
  acknowledgeTeacherReset: () => {},
  resolveLearningPath: () => null,
}));
vi.mock('@/core/srlReflection', () => ({ submitSRLReflection: async () => ({ ok: true }), hasSavedSRLReflection: async () => false }));
vi.mock('@/application/useActiveClassSession', () => ({ useActiveClassSession: () => h.session }));
vi.mock('@/application/useCognitiveHesitationRadar', () => ({
  useCognitiveHesitationRadar: ({ isActive }: { isActive: boolean }) => {
    h.radarActive.push(isActive);
  },
}));
vi.mock('@/infrastructure/services/SocraticEngine', () => ({ SocraticEngine: { prefetchSessionHints: () => {}, getSocraticHint: async () => null } }));
vi.mock('rrweb', () => ({ record: () => () => {} }));

vi.mock('@/features/workspace/tasks/TaskCard', () => ({ TaskCard: () => <div data-testid="task-card" /> }));
vi.mock('@/features/workspace/WorkspaceTopbar', () => ({ WorkspaceTopbar: () => null }));
vi.mock('@/features/workspace/CloudSyncStatus', () => ({ CornerCloudSyncStatus: () => <div data-testid="corner-cloud" /> }));
vi.mock('@/features/workspace/board/PlaceValueBoard', () => ({ PlaceValueBoard: () => null }));
vi.mock('@/features/workspace/board/DienesBlock', () => ({ DienesBlock: () => null }));
vi.mock('@/features/workspace/overlays/FeedbackToast', () => ({ FeedbackToast: () => null }));
vi.mock('@/features/workspace/overlays/HelpOverlays', () => ({ HelpOverlays: () => null, SocraticSidePanel: () => null }));
vi.mock('@/features/workspace/overlays/StudentChatOverlay', () => ({ StudentChatOverlay: () => null }));
vi.mock('@/features/workspace/board/AdaptiveAdditionGrid', () => ({ AdaptiveAdditionGrid: () => null, ADDITION_GRID_HE: 'לוח החיבור' }));
vi.mock('@/features/workspace/board/useLeftClearOfSidePanel', () => ({ useLeftClearOfSidePanel: () => 24 }));
vi.mock('@/features/workspace/ClosingSentence', () => ({ ClosingSentence: () => null }));
vi.mock('@/features/workspace/StationOpening', () => ({ StationOpening: () => null }));
vi.mock('@/features/workspace/overlays/ReinforcementOrChallengeScreen', () => ({
  ReinforcementOrChallengeScreen: () => <div data-testid="choice-screen" />,
}));
vi.mock('@/presentation/components/student/Meeting2WaitingScreen', () => ({
  Meeting2WaitingScreen: () => <div data-testid="meeting2-waiting-screen" />,
}));
vi.mock('@/presentation/components/student/Session8ReflectionScreen', () => ({
  Session8ReflectionScreen: () => <div data-testid="reflection-screen" />,
  REFLECTION_TEXT_HE: {},
}));
vi.mock('@/presentation/components/student/ProjectorWaitingScreen', () => ({
  ProjectorWaitingScreen: () => <button type="button" data-testid="projector-screen" />,
}));
vi.mock('@/presentation/components/student/SessionPausedOverlay', () => ({
  SessionPausedOverlay: () => <button type="button" data-testid="paused-screen" />,
}));
vi.mock('@/presentation/components/student/SessionClosedOverlay', () => ({ SessionClosedOverlay: () => null }));

vi.mock('@/presentation/components/student/TeacherWillOpenWaitingScreen', () => ({
  TeacherWillOpenWaitingScreen: () => <div data-testid="will-open-screen" />,
}));

import { StudentWorkspacePage } from '@/features/workspace/StudentWorkspacePage';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';

const STUDENT = 'student_user5';
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });

/** A learner the gate approved on the green path (meetings 3–8 need it, Module 26). */
const APPROVED = { teacher_gate_approved: true, routeStatus: 'APPROVED', pedagogicalPath: 'green_path', completedMeeting2: true };

const copy = (meeting: number, extra: Record<string, unknown> = {}) => ({
  sessionNumber: meeting,
  flowStatus: 'task',
  standardTaskIdx: 0,
  hasInteracted: true,
  openingScreenSeen: true,
  activeBankPath: 'green_path',
  savedAt: 1000,
  ...extra,
});

/** The class has moved on: workspaceState holds a later meeting. */
const laterMeeting = (m: number) => copy(m === 8 ? 7 : m + 1, { savedAt: 9000, standardTaskIdx: 1 });

async function open(meeting: number, record: Record<string, unknown>) {
  h.session = { active: true, status: 'active', sessionNumber: meeting, startedAt: 1, isLoaded: true };
  useStore.setState({ students: { [STUDENT]: record } as any, firebaseLoaded: true });
  render(
    <MemoryRouter initialEntries={[`/workspace?meeting=${meeting}`]}>
      <StudentWorkspacePage />
    </MemoryRouter>
  );
  await flush();
}

const finishedScreen = (m: number) => screen.queryByText(`סיימתם את תחנה ${m}!`);

beforeEach(() => {
  h.listeners.clear();
  h.radarActive = [];
  h.deviceCopies = {};
  h.deviceReads = [];
  useAuthStore.setState({ user: { uid: STUDENT, student_id: 5, role: 'student' } as any, role: 'student', isAuthenticated: true });
  useWorkspaceStore.getState().resetWorkspace();
});
afterEach(() => cleanup());

describe('a meeting opened again: the learner who finished it waits quietly', () => {
  it.each([1, 3, 4, 5, 6, 7, 8])('meeting %i: the quiet end screen, the radar off, nothing redone', async (m) => {
    await open(m, {
      ...APPROVED,
      highestCompletedMeeting: m,
      completedMeetings: { [`m${m}`]: 5000 },
      workspaceByMeeting: { [`m${m}`]: copy(m, { flowStatus: 'sessionDone', standardTaskIdx: 6 }) },
      workspaceState: laterMeeting(m),
    });
    const ws = useWorkspaceStore.getState();
    expect(ws.sessionNumber).toBe(m);
    expect(ws.flowStatus).toBe('sessionDone');
    expect(finishedScreen(m)).toBeTruthy();
    expect(screen.queryByTestId('task-card')).toBeNull();
    expect(screen.queryByTestId('reflection-screen')).toBeNull();
    expect(h.radarActive.at(-1), 'no hesitation measured behind the end screen').toBe(false);
  });

  it('finished before per-meeting copies were saved (highestCompletedMeeting only): the end screen too', async () => {
    await open(4, { ...APPROVED, highestCompletedMeeting: 5, workspaceState: copy(6, { standardTaskIdx: 2 }) });
    expect(useWorkspaceStore.getState().sessionNumber).toBe(4);
    expect(finishedScreen(4)).toBeTruthy();
    expect(screen.queryByTestId('task-card')).toBeNull();
    expect(h.radarActive.at(-1)).toBe(false);
  });

  it('meetings 3–7: a copy at the reinforcement-or-challenge choice goes back to the choice', async () => {
    await open(5, {
      ...APPROVED,
      highestCompletedMeeting: 4,
      workspaceByMeeting: { m5: copy(5, { flowStatus: 'choice_branch', standardTaskIdx: 6 }) },
      workspaceState: laterMeeting(5),
    });
    expect(screen.getByTestId('choice-screen')).toBeTruthy();
    expect(finishedScreen(5)).toBeNull();
    expect(h.radarActive.at(-1)).toBe(false);
  });

  it('meetings 3–7: a copy in an optional exercise goes back to that exercise', async () => {
    await open(6, {
      ...APPROVED,
      highestCompletedMeeting: 5,
      completedMeetings: { m6: 5000 },
      workspaceByMeeting: { m6: copy(6, { selectedBranch: 'challenge', standardTaskIdx: 8 }) },
      workspaceState: laterMeeting(6),
    });
    const ws = useWorkspaceStore.getState();
    expect(ws.selectedBranch).toBe('challenge');
    expect(ws.standardTaskIdx).toBe(8);
    expect(ws.flowStatus).toBe('task');
    expect(screen.getByTestId('task-card')).toBeTruthy();
    expect(h.radarActive.at(-1)).toBe(true);
  });
});

describe('a meeting opened again: the learner who did not finish goes on where they stopped', () => {
  it.each([1, 3, 4, 5, 6, 7, 8])('meeting %i: resumes at exercise 4, the finished ones kept', async (m) => {
    await open(m, {
      ...APPROVED,
      highestCompletedMeeting: m - 1,
      workspaceByMeeting: { [`m${m}`]: copy(m, { standardTaskIdx: 3 }) },
      workspaceState: laterMeeting(m),
    });
    const ws = useWorkspaceStore.getState();
    expect(ws.sessionNumber).toBe(m);
    expect(ws.flowStatus).toBe('task');
    expect(ws.standardTaskIdx).toBe(3);
    expect(screen.getByTestId('task-card')).toBeTruthy();
    expect(finishedScreen(m)).toBeNull();
    expect(h.radarActive.at(-1), 'a learner at work is measured as before').toBe(true);
  });

  it("this device's own copy of the meeting is read, and a later one wins", async () => {
    h.deviceCopies[4] = copy(4, { standardTaskIdx: 5, savedAt: 2000 });
    await open(4, {
      ...APPROVED,
      highestCompletedMeeting: 3,
      workspaceByMeeting: { m4: copy(4, { standardTaskIdx: 3, savedAt: 1000 }) },
      workspaceState: laterMeeting(4),
    });
    expect(h.deviceReads.some(([, m]) => m === 4)).toBe(true);
    expect(useWorkspaceStore.getState().standardTaskIdx).toBe(5);
  });

  it('meeting 8 unfinished at the reflection board: back to the board', async () => {
    await open(8, {
      ...APPROVED,
      highestCompletedMeeting: 7,
      workspaceByMeeting: { m8: copy(8, { flowStatus: 'reflection', standardTaskIdx: 6 }) },
    });
    expect(useWorkspaceStore.getState().flowStatus).toBe('reflection');
    expect(screen.getByTestId('reflection-screen')).toBeTruthy();
    expect(finishedScreen(8)).toBeNull();
  });

  it('nothing saved of the meeting: it starts at exercise 1', async () => {
    await open(5, { ...APPROVED, highestCompletedMeeting: 4, workspaceState: laterMeeting(5) });
    const ws = useWorkspaceStore.getState();
    expect(ws.sessionNumber).toBe(5);
    expect(ws.standardTaskIdx).toBe(0);
    expect(ws.flowStatus).toBe('task');
  });
});

describe('decided at initialisation only', () => {
  it.each([1, 4, 8])('meeting %i: the finished mark arriving mid-work does not take the learner off the exercise', async (m) => {
    const record = {
      ...APPROVED,
      highestCompletedMeeting: m - 1,
      workspaceByMeeting: { [`m${m}`]: copy(m, { standardTaskIdx: 3 }) },
    };
    await open(m, record);
    expect(screen.getByTestId('task-card')).toBeTruthy();

    act(() => useStore.setState({
      students: { [STUDENT]: { ...record, highestCompletedMeeting: m, completedMeetings: { [`m${m}`]: 7000 } } } as any,
    }));
    await flush();
    expect(useWorkspaceStore.getState().standardTaskIdx).toBe(3);
    expect(useWorkspaceStore.getState().flowStatus).toBe('task');
    expect(screen.getByTestId('task-card')).toBeTruthy();
    expect(finishedScreen(m)).toBeNull();
    expect(h.radarActive.at(-1)).toBe(true);
  });
});

describe('meeting 3 still needs the gate', () => {
  it('not approved: waits, and nothing of meeting 3 is restored', async () => {
    await open(3, {
      teacher_gate_approved: false, routeStatus: 'PENDING_TEACHER_APPROVAL', completedMeeting2: true, highestCompletedMeeting: 2,
      workspaceByMeeting: { m3: copy(3, { standardTaskIdx: 3 }) },
    });
    expect(screen.queryByTestId('task-card')).toBeNull();
    expect(useWorkspaceStore.getState().sessionNumber).not.toBe(3);
  });
});


