/**
 * @vitest-environment jsdom
 */
/**
 * Meeting 2 opened again (owner decision 2.10.2026). A learner the teacher's
 * close completed part-way, whose path the teacher has already approved,
 * waits on "המורה תפתח את הפעילות בקרוב." instead of going back into the
 * diagnostic — and the hesitation radar is off behind that screen. It used to
 * stay armed: after 45 seconds it sent HESITATION_DETECTED for meeting 2 and
 * marked the waiting child as hesitating on the teacher's radar (review of
 * PR #207). The real StudentWorkspacePage and stores; the radar hook records
 * whether it is armed.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  session: { active: true, status: 'active', sessionNumber: 1 as number | null, startedAt: 1, isLoaded: true },
  listeners: new Map<string, (snap: { exists: () => boolean; val: () => unknown }) => void>(),
  radarActive: [] as boolean[],
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
    getLocalSessionProgress: () => null,
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
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

function open() {
  h.session = { active: true, status: 'active', sessionNumber: 2, startedAt: 1, isLoaded: true };
  return render(
    <MemoryRouter initialEntries={['/workspace?meeting=2']}>
      <StudentWorkspacePage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  h.listeners.clear();
  h.radarActive = [];
  useAuthStore.setState({ user: { uid: STUDENT, student_id: 5, role: 'student' } as any, role: 'student', isAuthenticated: true });
  useWorkspaceStore.getState().resetWorkspace();
  useStore.setState({ students: { [STUDENT]: { highestCompletedMeeting: 1, completedMeeting2: false } } as any, firebaseLoaded: true });
});
afterEach(() => cleanup());

describe('meeting 2 opened again, an approved learner completed part-way by the close', () => {
  it('waits on the quiet screen, and no hesitation is measured behind it', async () => {
    open();
    await flush();
    // In the diagnostic, past the opening screen, on a task: the radar is armed.
    act(() => useWorkspaceStore.setState({ openingScreenSeen: true } as any));
    expect(useWorkspaceStore.getState().sessionNumber).toBe(2);
    expect(useWorkspaceStore.getState().qflow.phase).toBe('primary');
    expect(screen.queryByTestId('will-open-screen')).toBeNull();
    expect(h.radarActive.at(-1)).toBe(true);

    // The teacher's close completed the learner and the teacher approved the path.
    act(() => useStore.setState({
      students: { [STUDENT]: { highestCompletedMeeting: 2, completedMeeting2: true, routeStatus: 'APPROVED', teacher_gate_approved: true } } as any,
    }));
    expect(screen.getByTestId('will-open-screen')).toBeTruthy();
    expect(screen.queryByTestId('task-card')).toBeNull();
    expect(h.radarActive.at(-1), 'no 45-second hesitation behind the waiting screen').toBe(false);
  });

  it('not approved yet: the learner goes on, and the radar stays armed', async () => {
    open();
    await flush();
    act(() => useWorkspaceStore.setState({ openingScreenSeen: true } as any));
    act(() => useStore.setState({
      students: { [STUDENT]: { highestCompletedMeeting: 2, completedMeeting2: true, routeStatus: 'PENDING_TEACHER_APPROVAL' } } as any,
    }));
    expect(screen.queryByTestId('will-open-screen')).toBeNull();
    expect(h.radarActive.at(-1)).toBe(true);
  });
});
