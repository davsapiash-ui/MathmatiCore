import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { recommendedPathOf } from '@/core/recommendedPath';

/**
 * ביקורת דשבורד המורה, 20.9.2026 — הרדאר והשער אומרים את האמת.
 * מודול 18 §ב: אדום = כרטיס חניכה פעיל כעת; צהוב = היסוס כעת; כחול = קריאה
 * לעזרה שלא טופלה. מודול 20 §ב: ההמלצה היא כלל 50% של האבחון.
 */
const update = vi.fn(() => Promise.resolve());
vi.mock('@/infrastructure/firebase', () => ({ database: {} }));
vi.mock('firebase/database', () => ({
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
  update: (...args: unknown[]) => update(...(args as [])),
}));

const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

describe('BLUE: a help request the teacher cleared does not come back by itself', () => {
  beforeEach(() => { vi.useFakeTimers(); update.mockClear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('a flushed payload is not re-sent with the next write on the same path', async () => {
    const { throttledRtdbUpdate, resetThrottledWrites } = await import('@/infrastructure/services/ThrottledRtdbWriter');
    resetThrottledWrites();
    const path = 'users/students/student_user3';

    void throttledRtdbUpdate(path, { helpRequested: true, lastHelpTimestamp: 1 });
    await vi.advanceTimersByTimeAsync(10);
    expect((update.mock.calls[0] as unknown[])[1]).toEqual({ helpRequested: true, lastHelpTimestamp: 1 });

    // The teacher marks it handled; later the learner moves to the next exercise.
    await vi.advanceTimersByTimeAsync(1500);
    void throttledRtdbUpdate(path, { currentTaskIdx: 2 });
    await vi.advanceTimersByTimeAsync(10);

    expect(update).toHaveBeenCalledTimes(2);
    expect((update.mock.calls[1] as unknown[])[1]).toEqual({ currentTaskIdx: 2 });
  });

  it('writes inside one throttle window are still merged into a single trailing write', async () => {
    const { throttledRtdbUpdate, resetThrottledWrites } = await import('@/infrastructure/services/ThrottledRtdbWriter');
    resetThrottledWrites();
    const path = 'users/students/student_user4';
    void throttledRtdbUpdate(path, { a: 1 });
    void throttledRtdbUpdate(path, { b: 2 });
    void throttledRtdbUpdate(path, { c: 3 });
    await vi.advanceTimersByTimeAsync(1200);
    expect(update).toHaveBeenCalledTimes(2);
    expect((update.mock.calls[0] as unknown[])[1]).toEqual({ a: 1 });
    expect((update.mock.calls[1] as unknown[])[1]).toEqual({ b: 2, c: 3 });
  });
});

describe('the recommended path has one source on every teacher screen (Module 20 §ב)', () => {
  it('the diagnostic\'s own result; the 50% rule when only the score is there; never a default colour', () => {
    expect(recommendedPathOf({ matrix_recommended_path: 'remediation_path' })).toBe('remediation_path');
    expect(recommendedPathOf({ matrix_recommended_path: 'green_path', session_score_percent: 14 })).toBe('green_path');
    expect(recommendedPathOf({ session_score_percent: 50 })).toBe('green_path');
    expect(recommendedPathOf({ session_score_percent: 43 })).toBe('remediation_path');
    // current_path is 'green_path' for everyone before approval; it is not a recommendation.
    expect(recommendedPathOf({ sessionState: { current_path: 'green_path' } })).toBeNull();
    expect(recommendedPathOf({ routeRecommendation: 'GREEN' })).toBeNull();
    expect(recommendedPathOf(null)).toBeNull();
  });

  it('the radar, the class-management card, the approval drawer and the diagnostic badge all use it', () => {
    const grid = src('presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx');
    const cm = src('presentation/pages/TeacherDashboard/ClassManagement.tsx');
    const drawer = src('presentation/pages/TeacherDashboard/components/TeacherGateApprovalDrawer.tsx');
    const dash = src('presentation/pages/TeacherDashboard.tsx');
    for (const file of [grid, cm, drawer, dash]) expect(file).toContain('recommendedPathOf(');
    expect(grid).not.toContain("sessionState.current_path === 'green_path') ? 'ירוק'");
    expect(cm).not.toContain("recommendedPath: isYellow ? 'צמצום פערי קדם' : 'ירוק'");
    expect(dash).not.toContain('(traceData.hesitation_events || 0) > 2 ||');
  });
});

describe('RED and YELLOW are live states (Module 18 §ב)', () => {
  it('RED follows the card: published when it opens AND when it closes', () => {
    const sync = src('infrastructure/services/FirebaseSyncService.ts');
    expect(sync).toContain("const cardOpen = state.helpState === 'socratic';");
    expect(sync).toContain('{ isSocraticActive: cardOpen }');
  });

  it('YELLOW is the live flag, cleared by the learner\'s next cognitive action', () => {
    const grid = src('presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx');
    expect(grid).toContain('data.hesitating?.hesitating === true');
    expect(grid).not.toContain('hesitationEvents * hesitationThreshold');
    const hook = src('application/useCognitiveHesitationRadar.ts');
    expect(hook).toContain('{ hesitating: false, timestamp: Date.now() }');
    expect(hook).toContain('if (hesitatingPublishedRef.current) clearHesitating();');
  });
});

describe('who is connected, and what a reset cleared', () => {
  const dash = src('presentation/pages/TeacherDashboard.tsx');

  it('the canonical record wins over its aliases, in the dashboard and in the shared store', () => {
    expect(dash).toContain('Object.keys(data).sort((a, b) => canonicalLast(a) - canonicalLast(b)).forEach((uid) => {');
    expect(src('application/useStore.ts')).toContain('Object.keys(rawData).sort((a, b) => canonicalLast(a) - canonicalLast(b)).forEach((uid) => {');
  });

  it('for a learner in the snapshot, the snapshot is the truth', () => {
    expect(dash).toContain('const existingLocal = seenInSnapshot.has(normUid) ? formattedStudents[normUid] : undefined;');
  });
});

describe('the lesson survives the teacher\'s connection', () => {
  it('the disconnect stamp is cleared and the hook re-armed on every reconnect, and when another tab stamps it', () => {
    const dash = src('presentation/pages/TeacherDashboard.tsx');
    const start = dash.indexOf('const armPresence = () => {');
    const effect = dash.slice(start, dash.indexOf('const handleStartClassSession', start));
    expect(start).toBeGreaterThan(-1);
    expect(effect).toContain("onValue(ref(database, '.info/connected')");
    expect(effect).toContain('if (isConnected) armPresence();');
    expect(effect).toContain('if (snap.exists() && isConnected) armPresence();');
    expect(effect).toContain('unsubConnected();');
  });

  it('every projector write carries the server clock, so a release is always newer than its broadcast', () => {
    const projector = src('presentation/pages/ProjectorSandboxPage.tsx');
    expect((projector.match(/projector_mode_updated_at: serverTimestamp\(\)/g) || []).length).toBe(3);
    expect(projector).not.toContain('projector_mode_updated_at: Date.now()');
  });
});
