/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';

vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <span data-testid="speech" data-text={text} />,
}));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { FeedbackToast } from '@/features/workspace/overlays/FeedbackToast';

/**
 * Chief re-review B-2 (9.10.2026): the "נכון! …" sentences of stations 1 and
 * 3–7 carry their exercise ("5,432 − 2,118 = 3,314"). Laid out by the browser
 * in a right-to-left paragraph, the equation read mirrored ("3,314 = 2,118 −
 * 5,432") — the defect MathText exists to stop (audit A6-101). The toast's
 * title and sub go through MathText in both placements.
 */
afterEach(() => {
  cleanup();
  useWorkspaceStore.setState({ feedback: null } as any);
});

const SUB = '‏5,432 − 2,118 = 3,314, וגם בבית המספרים נשארו 3,314.';

describe('the feedback toast keeps an exercise left to right', () => {
  for (const placement of ['inline', 'floating'] as const) {
    it(`${placement}: "a − b = r" in the sub is an LTR bdi, and the words around it stay as written`, () => {
      useWorkspaceStore.setState({ feedback: { correct: true, title: 'נכון!', sub: SUB } } as any);
      render(<FeedbackToast placement={placement} />);
      const toast = screen.getByTestId('feedback-toast');
      const bdis = [...toast.querySelectorAll('bdi[dir="ltr"]')].map((b) => b.textContent);
      expect(bdis).toContain('5,432 − 2,118 = 3,314');
      expect(toast.textContent).toContain('נכון!');
      expect(toast.textContent).toContain(SUB);
    });
  }

  it('a missing digit\'s sentence too: "442 − 128 = 314"', () => {
    useWorkspaceStore.setState({ feedback: { correct: true, title: 'נכון!', sub: 'הספרה החסרה היא 4: ‏442 − 128 = 314.' } } as any);
    render(<FeedbackToast placement="inline" />);
    const bdis = [...screen.getByTestId('feedback-toast').querySelectorAll('bdi[dir="ltr"]')].map((b) => b.textContent);
    expect(bdis).toContain('442 − 128 = 314');
  });
});
