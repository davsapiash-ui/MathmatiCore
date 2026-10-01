// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PlaceColumn } from '@/features/workspace/board/PlaceColumn';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';

/**
 * PRD Module 8 §א: ten or more blocks in a column show a grouping button, and
 * pressing it merges ten into one block "בטור הסמוך משמאל". Stations 1 and 2
 * have no thousands column on the board, yet the hundreds column showed
 * "קבצו 10 לאלף": ten hundreds vanished into a column nothing draws.
 */
function column(place: 'units' | 'tens' | 'hundreds', canGroup?: boolean) {
  render(
    <DndContext>
      <PlaceColumn place={place} canGroup={canGroup} />
    </DndContext>
  );
}

beforeEach(() => {
  useAuthStore.setState({ user: { uid: 'student_user2', student_id: 2 } as never, role: 'student', isAuthenticated: true });
  useWorkspaceStore.getState().resetWorkspace();
  useWorkspaceStore.setState({ sessionNumber: 1, counts: { units: 10, tens: 10, hundreds: 10, thousands: 0 } } as never);
});
afterEach(() => cleanup());

describe('Module 8 §א — the grouping button only where the column to its left is on the board', () => {
  it('no thousands column: no "קבצו 10 לאלף"', () => {
    column('hundreds', false);
    expect(screen.queryByText(/קבצו 10 לאלף/)).toBeNull();
  });

  it('with the thousands column, and in the other columns, the button is there', () => {
    column('hundreds', true);
    expect(screen.getByText(/קבצו 10 לאלף/)).toBeTruthy();
    cleanup();
    column('tens', true);
    expect(screen.getByText(/קבצו 10 למאה/)).toBeTruthy();
  });

  it('the board passes it from the columns it draws (none in stations 1–2 left of the hundreds)', () => {
    const board = readFileSync(resolve(__dirname, '../../features/workspace/board/PlaceValueBoard.tsx'), 'utf-8');
    expect(board).toContain('canGroup={placesToRender.includes(PLACE_ORDER[PLACE_ORDER.indexOf(place) + 1])}');
    expect(board).toMatch(/sessionNumber <= 2\s*\?\s*PLACE_ORDER\.filter\(p => p !== 'thousands'\)/);
  });
});
