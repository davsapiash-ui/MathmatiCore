/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <span data-testid="speech" data-text={text} />,
}));

import { WorkspaceTopbar } from '@/features/workspace/WorkspaceTopbar';
import { useWorkspaceStore, selectBoardOpen } from '@/application/useWorkspaceStore';
import { BOARD_OPEN_HE, BOARD_STAYS_OPEN_HE, boardStaysOpen } from '@/core/boardVisibility';

/**
 * Owner decision, 27.9.2026 (register decision יא): in station 1 the number
 * house is not hidden. The top-bar button stays visible but cannot hide it
 * there — aria-disabled, not disabled, so hovering and pressing still reach it
 * — and says why, in the owner's words. Owner, 28.9.2026: in station 1 the
 * button is labelled and announced "בית המספרים פתוח", with an open eye; it
 * never says "הסתרה" there. Every other meeting with a board keeps the button
 * as it was.
 */

const ws = () => useWorkspaceStore.getState();
const topbar = () =>
  render(
    <MemoryRouter>
      <WorkspaceTopbar />
    </MemoryRouter>
  );
const button = () => screen.getByTestId('board-toggle');

beforeEach(() => ws().resetWorkspace());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('station 1: the board stays open', () => {
  beforeEach(() => ws().initSession(1, false, 0));

  it('the owner\'s sentence, exactly', () => {
    expect(BOARD_STAYS_OPEN_HE).toBe('בתחנה הזו בית המספרים נשאר פתוח, כי בעזרתו לומדים להכיר את הלבנים.');
    expect(boardStaysOpen(1)).toBe(true);
    for (const n of [2, 3, 4, 5, 6, 7, 8]) expect(boardStaysOpen(n)).toBe(false);
  });

  it('the button is visible, aria-disabled (not disabled), and says why on hover', () => {
    topbar();
    const b = button();
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b.hasAttribute('disabled')).toBe(false);
    expect(b.getAttribute('title')).toBe(BOARD_STAYS_OPEN_HE);
    expect(BOARD_OPEN_HE).toBe('בית המספרים פתוח');
    expect(b.textContent).toBe(BOARD_OPEN_HE);
    expect(b.getAttribute('aria-label')).toBe(BOARD_OPEN_HE);
    expect(b.textContent).not.toContain('הסתרת');
    // the open eye (lucide "eye"), not the crossed-out one
    expect(b.querySelector('svg.lucide-eye')).not.toBeNull();
    expect(b.querySelector('svg.lucide-eye-off')).toBeNull();
  });

  it('a press leaves the board open and shows the calm note, with its read-aloud button', () => {
    topbar();
    expect(screen.queryByTestId('board-stays-open-note')).toBeNull();
    fireEvent.click(button());
    expect(ws().boardOpen).toBe(true);
    expect(selectBoardOpen(ws())).toBe(true);
    const note = screen.getByTestId('board-stays-open-note');
    expect(note.getAttribute('role')).toBe('status');
    expect(note.textContent).toBe(BOARD_STAYS_OPEN_HE);
    expect(note.querySelector('[data-testid="speech"]')!.getAttribute('data-text')).toBe(BOARD_STAYS_OPEN_HE);
    expect(button().getAttribute('aria-describedby')).toBe('board-stays-open-note');
    // pressed again and again: still open
    fireEvent.click(button());
    fireEvent.click(button());
    expect(selectBoardOpen(ws())).toBe(true);
    // the label never turns into "הצגת…" or "הסתרת…"
    expect(button().textContent).toBe(BOARD_OPEN_HE);
  });

  it('the note passes by itself', () => {
    vi.useFakeTimers();
    topbar();
    fireEvent.click(button());
    expect(screen.getByTestId('board-stays-open-note')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.queryByTestId('board-stays-open-note')).toBeNull();
  });

  it('the store cannot hide it either', () => {
    ws().toggleBoard();
    expect(ws().boardOpen).toBe(true);
    useWorkspaceStore.setState({ boardOpen: false }); // however it got there
    expect(selectBoardOpen(ws())).toBe(true);
    ws().toggleBoard();
    expect(ws().boardOpen).toBe(true);
  });

  it('a board hidden in another meeting, or in a saved workspace, is open when station 1 starts', () => {
    ws().initSession(3, false, 0);
    ws().toggleBoard();
    expect(ws().boardOpen).toBe(false);
    ws().initSession(1, false, 0);
    expect(ws().boardOpen).toBe(true);
    ws().restoreSession({ sessionNumber: 1, standardTaskIdx: 0, boardOpen: false });
    expect(ws().boardOpen).toBe(true);
  });
});

describe('other meetings keep today\'s button', () => {
  for (const meeting of [3, 4, 5, 6, 7] as const) {
    it(`meeting ${meeting}: the button hides and shows the board`, () => {
      ws().initSession(meeting, false, 0);
      topbar();
      const b = button();
      expect(b.hasAttribute('aria-disabled')).toBe(false);
      expect(b.getAttribute('title')).toBe('הסתרת בית המספרים');
      expect(b.getAttribute('aria-label')).toBe('הסתרת בית המספרים');
      expect(b.querySelector('svg.lucide-eye-off')).not.toBeNull();
      fireEvent.click(b);
      expect(selectBoardOpen(ws())).toBe(false);
      expect(button().getAttribute('title')).toBe('הצגת בית המספרים');
      expect(screen.queryByTestId('board-stays-open-note')).toBeNull();
      fireEvent.click(button());
      expect(selectBoardOpen(ws())).toBe(true);
    });
  }

  for (const meeting of [2, 8] as const) {
    it(`meeting ${meeting}: no board, no button`, () => {
      ws().initSession(meeting, false, 0);
      topbar();
      expect(screen.queryByTestId('board-toggle')).toBeNull();
    });
  }
});
