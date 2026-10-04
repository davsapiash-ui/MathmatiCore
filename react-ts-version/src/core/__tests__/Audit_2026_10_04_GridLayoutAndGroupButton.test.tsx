// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { AnimatePresence } from 'framer-motion';
import { DndContext } from '@dnd-kit/core';

const speak = vi.hoisted(() => vi.fn((_text: string, _lang: string, _onEnd: () => void) => 1));
vi.mock('@/infrastructure/services/TTSService', () => ({
  tts: { speak, stop: () => {}, stopIfCurrent: () => {}, armAudioGate: () => {} },
}));

import {
  AdaptiveAdditionGrid,
  AdditionGridTab,
  GRID_PICK_ROW_HE,
  GRID_PICK_COL_HE,
} from '@/features/workspace/board/AdaptiveAdditionGrid';
import { PlaceColumn } from '@/features/workspace/board/PlaceColumn';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';

/**
 * Student-journey audit, 4.10.2026 — the enhanced profile's addition grid and
 * the board's grouping button.
 */

beforeEach(() => {
  speak.mockClear();
  useAuthStore.setState({ user: { uid: 'student_user2', student_id: 2 } as never, role: 'student', isAuthenticated: true });
  useWorkspaceStore.getState().resetWorkspace();
});
afterEach(() => cleanup());

function grid() {
  render(
    <AnimatePresence>
      <AdaptiveAdditionGrid key="g" onClose={() => {}} />
    </AnimatePresence>
  );
}

describe('A7-015 — the grid\'s instruction has a read-aloud button, read on the child\'s click only (PRD Module 7 §א, Module 24)', () => {
  it('shows the first instruction with its button, and says nothing until it is clicked', () => {
    grid();
    const line = screen.getByTestId('addition-grid-instruction');
    expect(line.textContent).toContain(GRID_PICK_ROW_HE);
    expect(speak).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'הקראה בקול' }));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0]).toBe(GRID_PICK_ROW_HE);
  });

  it('after a row is chosen, the button reads the line on the screen', () => {
    grid();
    fireEvent.click(screen.getByText('7', { selector: 'tbody td:first-child' }));
    expect(screen.getByTestId('addition-grid-instruction').textContent).toContain(GRID_PICK_COL_HE);
    fireEvent.click(screen.getByRole('button', { name: 'הקראה בקול' }));
    expect(speak.mock.calls[0][0]).toBe(GRID_PICK_COL_HE);
  });

  it('the texts: plural imperative, a full stop, "עכשיו" not "כעת"', () => {
    expect(GRID_PICK_ROW_HE).toBe('לחצו על מספר שורה כדי להתחיל.');
    expect(GRID_PICK_COL_HE).toBe('עכשיו בחרו מספר עמודה כדי לראות את החיבור.');
  });
});

describe('A5-F07 / UX-002 / UX-001 — the grid and its tab take their own place in the row', () => {
  it('the grid is not pinned over the screen', () => {
    grid();
    const el = screen.getByTestId('adaptive-addition-grid');
    expect(el.className).not.toMatch(/\bfixed\b/);
    expect(el.className).toContain('shrink-0');
  });

  it('the tab brings the grid back', () => {
    useWorkspaceStore.setState({ additionHelperOffered: true, isAdditionHelperOpen: false } as never);
    render(<AdditionGridTab />);
    const tab = screen.getByRole('button', { name: 'הצגה חוזרת של לוח החיבור' });
    expect(tab.className).not.toMatch(/\bfixed\b/);
    expect(tab.textContent).toContain('לוח החיבור');
    fireEvent.click(tab);
    expect(useWorkspaceStore.getState().isAdditionHelperOpen).toBe(true);
  });
});

describe('UX-005 — "קבצו 10 לעשרת" is a 44px-high target (DESIGN_SYSTEM_RULES.md)', () => {
  it('the button has a 44px minimum height', () => {
    useWorkspaceStore.setState({ sessionNumber: 1, counts: { units: 26, tens: 0, hundreds: 0, thousands: 0 } } as never);
    render(
      <DndContext>
        <PlaceColumn place="units" canGroup />
      </DndContext>
    );
    const button = screen.getByText('קבצו 10 לעשרת').closest('button')!;
    expect(button.className).toContain('min-h-11');
    expect(button.className).not.toContain('text-xs');
  });
});
