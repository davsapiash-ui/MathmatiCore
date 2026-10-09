/**
 * @vitest-environment jsdom
 */
/**
 * Fix round of 1.10.2026, the learner's workspace page:
 *
 *  - Module 15 §ב ("מצב צפייה חסום ואטום"): while the projector, pause or close
 *    screen is up, the workspace under it takes no input. Enter used to check
 *    and advance the exercise behind the projector screen, and Ctrl+Z undid.
 *  - Module 10 §א: the hesitation clock does not run on the
 *    reinforcement-or-challenge screen. It ran from the last digit of exercise
 *    7, and the addition grid opened before the first optional exercise began.
 *  - Module 17 §ד: the cloud is on the screens that have no top bar — the
 *    meeting-2 waiting screen, the reflection and the end of the station.
 *
 * The real StudentWorkspacePage and stores; the screens around it are stubs.
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
vi.mock('@/features/workspace/board/AdaptiveAdditionGrid', () => ({ AdaptiveAdditionGrid: () => null, AdditionGridTab: () => null, ADDITION_GRID_HE: 'לוח החיבור' }));
vi.mock('@/features/workspace/ClosingSentence', () => ({ ClosingSentence: () => null }));
vi.mock('@/features/workspace/StationOpening', () => ({
  StationOpening: ({ onStart }: { onStart: () => void }) => <button type="button" onClick={onStart}>מתחילים</button>,
}));
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
vi.mock('@/presentation/components/ui/LogoutButton', () => ({ LogoutButton: () => <button type="button" data-testid="logout" /> }));
vi.mock('@/presentation/components/student/SessionClosedOverlay', () => ({ SessionClosedOverlay: () => <div data-testid="closed-screen" /> }));

import { StudentWorkspacePage } from '@/features/workspace/StudentWorkspacePage';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { tts } from '@/infrastructure/services/TTSService';

const STUDENT = 'student_user5';
let projectorStamp = 0;

function projector(on: boolean) {
  projectorStamp += 1;
  const cb = h.listeners.get('system_control/projector_mode');
  expect(cb, 'the page listens to the projector').toBeTruthy();
  act(() => cb!({ exists: () => true, val: () => ({ projector_mode: on, projector_mode_updated_at: projectorStamp }) }));
}

function open(meeting = 1) {
  h.session = { ...h.session, sessionNumber: meeting };
  return render(
    <MemoryRouter initialEntries={[`/workspace?meeting=${meeting}`]}>
      <StudentWorkspacePage />
    </MemoryRouter>
  );
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

let proceed: ReturnType<typeof vi.fn>;
let undo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  h.listeners.clear();
  h.radarActive = [];
  h.session = { active: true, status: 'active', sessionNumber: 1, startedAt: 1, isLoaded: true };
  useAuthStore.setState({ user: { uid: STUDENT, student_id: 5, role: 'student' } as any, role: 'student', isAuthenticated: true });
  useWorkspaceStore.getState().resetWorkspace();
  // A learner still in meeting 1. (highestCompletedMeeting: 1 would say meeting 1
  // is finished: a meeting opened again then shows the quiet end screen — catch-up, 2.10.2026.)
  useStore.setState({ students: { [STUDENT]: { highestCompletedMeeting: 0 } } as any, firebaseLoaded: true });
  proceed = vi.fn();
  undo = vi.fn();
});
afterEach(() => cleanup());

async function openMeeting1() {
  const view = open(1);
  await flush();
  // PRD 14 §ב: a fresh station opens on its opening screen; "מתחילים" leads to the first task.
  expect(screen.queryByTestId('task-card')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'מתחילים' }));
  await flush();
  expect(screen.queryByTestId('task-card')).not.toBeNull();
  useWorkspaceStore.setState({ proceed, undo } as any);
  return view;
}
const pressEnter = () => fireEvent.keyDown(window, { key: 'Enter' });
const pressUndo = () => fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

describe('Module 15 §ב — the workspace under the projector screen takes no input', () => {
  it('Enter and Ctrl+Z work on the workspace, and do nothing while the projector screen is up', async () => {
    await openMeeting1();
    pressEnter();
    pressUndo();
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(undo).toHaveBeenCalledTimes(1);

    projector(true);
    expect(screen.getByTestId('projector-screen')).toBeTruthy();
    pressEnter();
    pressUndo();
    expect(proceed, 'the exercise is not checked behind the projector screen').toHaveBeenCalledTimes(1);
    expect(undo, 'nothing is undone behind it').toHaveBeenCalledTimes(1);

    projector(false);
    pressEnter();
    expect(proceed, 'released when the projector goes off').toHaveBeenCalledTimes(2);
  });

  it('the workspace is inert under the projector screen; the screen itself is not', async () => {
    await openMeeting1();
    const card = screen.getByTestId('task-card');
    expect(card.closest('[inert]')).toBeNull();
    projector(true);
    expect(card.closest('[inert]'), 'no focus, typing or keyboard drag in the hidden workspace').not.toBeNull();
    expect(screen.getByTestId('projector-screen').closest('[inert]'), 'its read-aloud button still works').toBeNull();
    projector(false);
    expect(card.closest('[inert]')).toBeNull();
  });

  it('the same under the teacher’s pause screen', async () => {
    const view = await openMeeting1();
    h.session = { ...h.session, status: 'paused' };
    view.rerender(
      <MemoryRouter initialEntries={['/workspace?meeting=1']}>
        <StudentWorkspacePage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('paused-screen').closest('[inert]')).toBeNull();
    expect(screen.getByTestId('task-card').closest('[inert]')).not.toBeNull();
    pressEnter();
    expect(proceed).not.toHaveBeenCalled();
  });
});

describe('PRD 14 §ב0 (v7.15) — the close: unfinished sees the close screen, finished sees the station\'s end screen', () => {
  const closeSession = (view: ReturnType<typeof open>) => {
    h.session = { ...h.session, active: false, status: 'closed' };
    view.rerender(
      <MemoryRouter initialEntries={['/workspace?meeting=1']}>
        <StudentWorkspacePage />
      </MemoryRouter>
    );
  };

  it('a learner still working sees "המורה סגרה את התחנה"', async () => {
    const view = await openMeeting1();
    closeSession(view);
    expect(screen.getByTestId('closed-screen')).toBeTruthy();
  });

  it('a learner on the end screen keeps it — no close screen over it, no lobby', async () => {
    const view = await openMeeting1();
    act(() => useWorkspaceStore.setState({ flowStatus: 'sessionDone', awaitingNext: false }));
    closeSession(view);
    expect(screen.queryByTestId('closed-screen')).toBeNull();
    expect(screen.getByTestId('station-end-screen')).toBeTruthy();
    expect(screen.getByText('סיימתם את תחנה 1!')).toBeTruthy();
  });

  it('S5 — the close finds the learner finished by the record\'s mark (no work in this store): the end screen of that station', async () => {
    h.session = { ...h.session, active: false, status: 'closed' };
    useStore.setState({ students: { [STUDENT]: { highestCompletedMeeting: 1, completedMeetings: { m1: 1 } } } as any, firebaseLoaded: true });
    open(1);
    await flush();
    expect(screen.queryByTestId('closed-screen')).toBeNull();
    expect(screen.getByTestId('station-end-screen')).toBeTruthy();
    expect(screen.getByText('סיימתם את תחנה 1!')).toBeTruthy();
  });

  it('S4 — the finished learner at the close keeps a way to sign out', async () => {
    const view = await openMeeting1();
    act(() => useWorkspaceStore.setState({ flowStatus: 'sessionDone', awaitingNext: false }));
    closeSession(view);
    expect(screen.getByTestId('station-end-screen')).toBeTruthy();
    expect(screen.getByTestId('logout')).toBeTruthy();
  });

  it('S3 — a pause does not cover the end screen of a learner who finished', async () => {
    const view = await openMeeting1();
    act(() => useWorkspaceStore.setState({ flowStatus: 'sessionDone', awaitingNext: false }));
    h.session = { ...h.session, status: 'paused' };
    view.rerender(
      <MemoryRouter initialEntries={['/workspace?meeting=1']}>
        <StudentWorkspacePage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('station-end-screen')).toBeTruthy();
    expect(screen.queryByTestId('paused-screen')).toBeNull();
    expect(screen.queryByTestId('logout'), 'no sign-out on a pause').toBeNull();
  });

  it('station 1: finished means its end screen, nothing earlier', async () => {
    const view = await openMeeting1();
    act(() => useWorkspaceStore.setState({ sessionNumber: 1, flowStatus: 'choice_branch', awaitingNext: false } as any));
    closeSession(view);
    expect(screen.getByTestId('closed-screen')).toBeTruthy();
  });
});

describe('Module 10 §א — no hesitation clock on the reinforcement-or-challenge screen', () => {
  it('the radar stops on the choice screen and starts again with the chosen exercise', async () => {
    await openMeeting1();
    expect(h.radarActive.at(-1)).toBe(true);

    act(() => useWorkspaceStore.setState({ flowStatus: 'choice_branch', awaitingNext: false }));
    expect(screen.getByTestId('choice-screen')).toBeTruthy();
    expect(h.radarActive.at(-1), 'no 30-second grid, no 45-second card while choosing').toBe(false);

    act(() => useWorkspaceStore.setState({ flowStatus: 'task' }));
    expect(h.radarActive.at(-1)).toBe(true);
  });
});

describe('Module 17 §ד — the cloud on the screens without a top bar', () => {
  it('the end of the station', async () => {
    await openMeeting1();
    act(() => useWorkspaceStore.setState({ flowStatus: 'sessionDone', awaitingNext: false }));
    expect(screen.getByTestId('corner-cloud')).toBeTruthy();
  });

  it('the meeting-8 reflection', async () => {
    await openMeeting1();
    act(() => useWorkspaceStore.setState({ sessionNumber: 8, flowStatus: 'reflection', awaitingNext: false } as any));
    expect(screen.getByTestId('reflection-screen')).toBeTruthy();
    expect(screen.getByTestId('corner-cloud')).toBeTruthy();
  });

  it('the meeting-2 waiting screen', async () => {
    await openMeeting1();
    act(() => useWorkspaceStore.setState({ sessionNumber: 2, flowStatus: 'sessionDone', awaitingNext: false } as any));
    expect(screen.getByTestId('meeting2-waiting-screen')).toBeTruthy();
    expect(screen.getByTestId('corner-cloud')).toBeTruthy();
  });
});

/*
 * Student-journey audit, 4.10.2026 (A1-069, A6-106, A1-070, A1-040): PRD 7 §א and
 * the register (15.9.2026, "הלובי היה מסך הלומד היחיד בלי הקראה") give every
 * child state screen a read-aloud button, on the child's click only.
 */
describe('read-aloud on the end screen and the other-device lock — click only', () => {
  const spySpeak = () => vi.spyOn(tts, 'speak').mockReturnValue(1);
  let speak: ReturnType<typeof spySpeak>;
  beforeEach(() => {
    speak = spySpeak();
  });
  afterEach(() => speak.mockRestore());
  const speechButtons = () => screen.queryAllByRole('button', { name: 'הקראה בקול' });

  it('meeting 1: one button reads the heading, the saved line and the next-station line — no praise in stations 1–2 (PRD 14 §ג)', async () => {
    await openMeeting1();
    act(() => useWorkspaceStore.setState({ flowStatus: 'sessionDone', awaitingNext: false }));
    expect(speechButtons()).toHaveLength(1);
    expect(speak, 'never autoplay').not.toHaveBeenCalled();
    fireEvent.click(speechButtons()[0]);
    expect(speak).toHaveBeenCalledTimes(1);
    const text = speak.mock.calls[0][0] as string;
    expect(text).toMatch(/^סיימתם את תחנה 1! העבודה שלכם נשמרה בבטחה\. כשהמורה (תפתח|יפתח) את התחנה הבאה, נמשיך יחד\.$/);
    expect(screen.queryByText(/כל הכבוד/), 'no encouragement heading in station 1').toBeNull();
    expect(document.querySelector('.animate-bounce'), 'nothing bounces').toBeNull();
    expect(text, 'the ✓ is not spoken').not.toContain('✓');
  });

  it('meeting 8: the button reads "סיימתם את תחנה 8, התחנה האחרונה! העבודה שלכם נשמרה בבטחה." and nothing about a next station', async () => {
    await openMeeting1();
    act(() => useWorkspaceStore.setState({ sessionNumber: 8, flowStatus: 'sessionDone', awaitingNext: false } as any));
    expect(speechButtons()).toHaveLength(1);
    expect(speak).not.toHaveBeenCalled();
    fireEvent.click(speechButtons()[0]);
    expect(speak.mock.calls[0][0]).toBe('סיימתם את תחנה 8, התחנה האחרונה! העבודה שלכם נשמרה בבטחה.');
  });

  it('meetings 3–7: no second button — the closing sentence carries the only one (E2)', async () => {
    await openMeeting1();
    act(() => useWorkspaceStore.setState({ sessionNumber: 4, flowStatus: 'sessionDone', awaitingNext: false } as any));
    // ClosingSentence is stubbed in this file, so the page itself adds none.
    expect(screen.getByText('סיימתם את תחנה 4!')).toBeTruthy();
    expect(speechButtons()).toHaveLength(0);
  });

  it('the other-device lock reads exactly its own text, and shows the cloud', async () => {
    await openMeeting1();
    act(() => useWorkspaceStore.setState({ isSupersededByOtherDevice: true } as any));
    expect(screen.getByText('המשכתם במכשיר אחר')).toBeTruthy();
    expect(screen.getByTestId('corner-cloud')).toBeTruthy();
    expect(speechButtons()).toHaveLength(1);
    expect(speak).not.toHaveBeenCalled();
    fireEvent.click(speechButtons()[0]);
    expect(speak.mock.calls[0][0]).toBe('המשכתם במכשיר אחר. העבודה שלכם נשמרה. אם לא עברתם למכשיר אחר, קראו למורה.');
  });
});
