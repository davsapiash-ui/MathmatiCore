// @vitest-environment jsdom
/**
 * Fix round 2 (1.10.2026), finding 43 — Module 18 §ב: "צהוב: היסוס קוגניטיבי
 * (45 שניות רצופות ללא פעולה בטור הפעיל)". A learner already flagged yellow
 * when the teacher paused the lesson or put the projector on stayed yellow,
 * and the tile kept counting "היסוס: N שנ׳" through the whole pause: the radar
 * stopped its clocks but left the published flag on.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const writes = vi.hoisted(() => ({ calls: [] as Array<[string, any]> }));
vi.mock('@/infrastructure/services/ThrottledRtdbWriter', async () => {
  const actual = await vi.importActual<any>('@/infrastructure/services/ThrottledRtdbWriter');
  return {
    ...actual,
    throttledRtdbUpdate: (path: string, payload: any) => {
      writes.calls.push([path, payload]);
      return Promise.resolve();
    },
  };
});
vi.mock('@/infrastructure/services/FirebaseSyncService', async () => {
  const actual = await vi.importActual<any>('@/infrastructure/services/FirebaseSyncService');
  return { ...actual, emitTelemetry: () => Promise.resolve() };
});
vi.mock('@/core/hesitationCalibration', () => ({
  getHesitationThresholdSeconds: () => 45,
  useHesitationThresholdSeconds: () => 45,
}));

import { useCognitiveHesitationRadar } from '@/application/useCognitiveHesitationRadar';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';

const flags = () =>
  writes.calls
    .filter(([path, p]) => path === 'users/students/student_user3' && p.hesitating)
    .map(([, p]) => p.hesitating.hesitating);

describe('the yellow flag is cleared when the work is paused', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    writes.calls.length = 0;
    useWorkspaceStore.getState().resetWorkspace();
    useAuthStore.setState({ user: { uid: 'student_user3', student_id: 3 } } as any);
    // No card from the 45-second stage: this test is about the radar flag.
    useWorkspaceStore.setState({ sessionNumber: 4, flowStatus: 'lobby' } as any);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flagged at 45 seconds, then the pause turns it off at once', () => {
    const { rerender } = renderHook(({ active }) => useCognitiveHesitationRadar({ isActive: active }), {
      initialProps: { active: true },
    });
    vi.advanceTimersByTime(45_000);
    expect(flags().at(-1)).toBe(true);

    rerender({ active: false }); // projector on, lesson paused or closed
    expect(flags().at(-1)).toBe(false);
  });

  it('a pause with no flag up writes nothing', () => {
    const { rerender } = renderHook(({ active }) => useCognitiveHesitationRadar({ isActive: active }), {
      initialProps: { active: true },
    });
    vi.advanceTimersByTime(10_000);
    const before = writes.calls.length;
    rerender({ active: false });
    expect(writes.calls.length).toBe(before);
  });

  it('back to work: the clock starts again from zero', () => {
    const { rerender } = renderHook(({ active }) => useCognitiveHesitationRadar({ isActive: active }), {
      initialProps: { active: true },
    });
    vi.advanceTimersByTime(45_000);
    rerender({ active: false });
    vi.advanceTimersByTime(60_000);
    expect(flags().at(-1)).toBe(false);
    rerender({ active: true });
    vi.advanceTimersByTime(44_000);
    expect(flags().at(-1)).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(flags().at(-1)).toBe(true);
  });
});
