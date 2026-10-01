// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen, act, fireEvent, waitFor } from '@testing-library/react';

const speech = vi.hoisted(() => ({ onEnd: null as null | (() => void) }));
vi.mock('@/infrastructure/services/TTSService', () => ({
  tts: {
    speak: (_text: string, _lang: string, onEnd: () => void) => {
      speech.onEnd = onEnd;
      return 1;
    },
    stop: () => {},
    stopIfCurrent: () => {},
    armAudioGate: () => {},
  },
}));
vi.mock('canvas-confetti', () => ({ default: () => {} }));

import { FeedbackToast } from '@/features/workspace/overlays/FeedbackToast';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';

/**
 * PRD Module 7 §א (UDL): "כל הנחיה המוצגת ללומד על גבי המסך מלווה בכפתור
 * הקראה קולית ייעודי". The passing messages that tell the child what to do
 * ("קבצו בעצמכם…", "כתבו את הספרה החסרה…") had no read-aloud button, and went
 * by themselves after 1.5–3.5 s. Now each has one, and the message being read
 * stays on screen until its read ends.
 */
const ws = () => useWorkspaceStore.getState();
const MESSAGE = { correct: false, title: 'הַקְלָדַת תְּשׁוּבָה ✏️', sub: 'כתבו את הספרה החסרה בתיבה הריקה כדי להמשיך.' };

beforeEach(() => {
  speech.onEnd = null;
  useAuthStore.setState({ user: { uid: 'student_user3', student_id: 3 } as never, role: 'student', isAuthenticated: true });
  useWorkspaceStore.getState().resetWorkspace();
  useWorkspaceStore.setState({ sessionNumber: 3 } as never);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Module 7 §א — the passing messages have a read-aloud button', () => {
  for (const placement of ['inline', 'floating'] as const) {
    it(`${placement}: the button reads the title and the sentence under it`, () => {
      render(<FeedbackToast placement={placement} />);
      act(() => ws().showFeedback(MESSAGE, 3000));
      const toast = screen.getByTestId('feedback-toast');
      const button = toast.querySelector('button[aria-label="הקראה בקול"]');
      expect(button, 'a read-aloud button in the message').not.toBeNull();
    });
  }

  it('a message being read stays until its read ends, though its own time is over', async () => {
    vi.useFakeTimers();
    render(<FeedbackToast placement="inline" />);
    act(() => ws().showFeedback(MESSAGE, 3000));
    fireEvent.click(screen.getByRole('button', { name: 'הקראה בקול' }));
    expect(speech.onEnd).toBeTypeOf('function');

    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(ws().feedback, 'the store let the message go').toBeNull();
    expect(screen.queryByTestId('feedback-toast'), 'still on screen while it is read').not.toBeNull();
    expect(screen.getByTestId('feedback-toast').textContent).toContain('כתבו את הספרה החסרה');

    vi.useRealTimers();
    act(() => speech.onEnd!());
    await waitFor(() => expect(screen.queryByTestId('feedback-toast')).toBeNull());
  });

  it('a newer message replaces the one being read', () => {
    render(<FeedbackToast placement="inline" />);
    act(() => ws().showFeedback(MESSAGE, 3000));
    fireEvent.click(screen.getByRole('button', { name: 'הקראה בקול' }));
    act(() => ws().showFeedback({ correct: true, title: 'כל הכבוד!' }, 2000));
    const shown = screen.getAllByTestId('feedback-toast').map((t) => t.textContent ?? '');
    expect(shown.some((t) => t.includes('כל הכבוד!'))).toBe(true);
  });
});
