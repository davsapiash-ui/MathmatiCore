/**
 * @vitest-environment jsdom
 */
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AnimatePresence, MotionConfig } from 'framer-motion';

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

import { AdaptiveAdditionGrid } from '@/features/workspace/board/AdaptiveAdditionGrid';
import { FeedbackToast } from '@/features/workspace/overlays/FeedbackToast';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

describe('QA Battery 4: Rapid Mount/Unmount Stress (AnimatePresence & Timers)', () => {
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;

  let rafSpy: any;

  beforeEach(() => {
    vi.useFakeTimers();
    consoleErrorSpy = vi.spyOn(console, 'error');
    consoleWarnSpy = vi.spyOn(console, 'warn');
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      return setTimeout(() => cb(performance.now()), 16) as any;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    rafSpy?.mockRestore();
  });

  // Test 4a: Rapid visibility toggling of AdaptiveAdditionGrid under AnimatePresence
  it('4a. AdaptiveAdditionGrid: rapid toggling of visibility (10 times in 500ms) produces zero unmounted warnings or errors', async () => {
    function ToggleHarness({ show }: { show: boolean }) {
      return (
        <AnimatePresence>
          {show && <AdaptiveAdditionGrid onClose={vi.fn()} />}
        </AnimatePresence>
      );
    }

    const { rerender } = render(<ToggleHarness show={false} />);

    // Rapid open/close 10 times in 500ms
    for (let i = 0; i < 10; i++) {
      act(() => {
        rerender(<ToggleHarness show={true} />);
      });
      act(() => {
        vi.advanceTimersByTime(25);
      });
      act(() => {
        rerender(<ToggleHarness show={false} />);
      });
      act(() => {
        vi.advanceTimersByTime(25);
      });
    }

    // Final mount to verify stable rendering
    act(() => {
      rerender(<ToggleHarness show={true} />);
      vi.advanceTimersByTime(100);
    });

    // ASSERT: Component is mounted and visible
    expect(screen.getByTestId('adaptive-addition-grid')).not.toBeNull();

    // ASSERT: Zero React unmounted-state warnings or unhandled rejections
    const unmountedWarnings = [...consoleWarnSpy.mock.calls, ...consoleErrorSpy.mock.calls].filter(
      (args) => args.some((arg: any) => typeof arg === 'string' && (
        arg.includes('unmounted') || arg.includes('Can\'t perform a React state update')
      ))
    );
    expect(unmountedWarnings).toHaveLength(0);
  });

  // Test 4b: FeedbackToast with 5 rapid successive nonces
  it('4b. FeedbackToast: 5 successive feedback events within 100ms display latest feedback with zero stale timer leaks', async () => {
    render(
      <MotionConfig transition={{ duration: 0 }}>
        <FeedbackToast />
      </MotionConfig>
    );

    const store = useWorkspaceStore.getState();

    // Rapidly dispatch 5 successive feedback events with changing titles and nonces in under 100ms
    act(() => {
      store.showFeedback({ correct: false, title: 'משוב ראשון 1', sub: 'הסבר 1' }, 1000);
    });
    act(() => {
      vi.advanceTimersByTime(20);
      store.showFeedback({ correct: true, title: 'משוב שני 2', sub: 'הסבר 2' }, 1000);
    });
    act(() => {
      vi.advanceTimersByTime(20);
      store.showFeedback({ correct: false, title: 'משוב שלישי 3', sub: 'הסבר 3' }, 1000);
    });
    act(() => {
      vi.advanceTimersByTime(20);
      store.showFeedback({ correct: true, title: 'משוב רביעי 4', sub: 'הסבר 4' }, 1000);
    });
    act(() => {
      vi.advanceTimersByTime(20);
      store.showFeedback({ correct: true, title: 'משוב אחרון ומכריע 5', sub: 'הסבר סופי' }, 1000);
    });

    // Total time elapsed: 80ms (< 100ms)
    // ASSERT: DOM strictly displays the LATEST feedback element (משוב אחרון ומכריע 5)
    expect(screen.getByText('משוב אחרון ומכריע 5')).not.toBeNull();
    expect(screen.getByText('הסבר סופי')).not.toBeNull();

    // Total time elapsed: 80ms (< 100ms)
    // 1. ASSERT: Correct DOM presence of the latest element
    expect(screen.getByText('משוב אחרון ומכריע 5')).not.toBeNull();
    expect(screen.getByText('הסבר סופי')).not.toBeNull();

    // 2. Advance 950ms — nonce-guarded timer ensures latest element is still active
    act(() => {
      vi.advanceTimersByTime(950);
    });

    // The latest (5th) feedback is STILL active and rendered
    expect(screen.getByText('משוב אחרון ומכריע 5')).not.toBeNull();

    // 3. Advance remaining time so the 5th timer expires
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // 4. ASSERT: Zero React unmounted-state warnings or uncaught rejections
    const unmountedWarnings = [...consoleWarnSpy.mock.calls, ...consoleErrorSpy.mock.calls].filter(
      (args) => args.some((arg: any) => typeof arg === 'string' && (
        arg.includes('unmounted') || arg.includes('Can\'t perform a React state update')
      ))
    );
    expect(unmountedWarnings).toHaveLength(0);
  });
});
