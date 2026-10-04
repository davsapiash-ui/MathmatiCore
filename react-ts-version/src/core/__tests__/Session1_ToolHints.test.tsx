/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { MemoryRouter } from 'react-router-dom';

import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';
import { TrashZone } from '@/features/workspace/board/TrashZone';
import { WorkspaceTopbar } from '@/features/workspace/WorkspaceTopbar';
import { VerticalAdditionTask } from '@/features/workspace/tasks/VerticalAdditionTask';
import { EMPTY_COUNTS } from '@/core/placeValue';

/**
 * Station 1 (owner, 29.9.2026):
 *  - "לחצו על כפתור ביטול פעולה" names a button that shows only an arrow, so
 *    the button is marked until that line of the step is ticked; then the trash
 *    is marked until it is pressed. In the station's subtraction exercises the
 *    trash is marked until the first block goes in.
 *  - A memory circle sits only over a column the exercise uses: 61 − 24 had
 *    four circles over two columns.
 */

const idxOf = (id: string) => getActiveTasks(useWorkspaceStore.getState()).findIndex((t) => t.id === id);

function at(id: string, extra: Record<string, unknown> = {}) {
  useWorkspaceStore.setState({
    sessionNumber: 1,
    standardTaskIdx: idxOf(id),
    counts: { ...EMPTY_COUNTS, hundreds: 3, units: 5 },
    undoStack: [],
    undoCount: 0,
    hasClearedBoard: false,
    hasDeletedBlock: false,
    ...extra,
  } as never);
}

const undoButton = () => screen.getByRole('button', { name: 'ביטול הפעולה האחרונה' });
const trash = () => screen.getByRole('button', { name: /פח אשפה/ });

function renderBar() {
  return render(
    <MemoryRouter>
      <DndContext>
      <WorkspaceTopbar />
      <TrashZone />
      </DndContext>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useWorkspaceStore.setState({ sessionNumber: 1 } as never);
});
afterEach(cleanup);

describe('station 1, step 5: the button the text names is marked', () => {
  it('marks undo first, not the trash', () => {
    expect(idxOf('s1_undo_trash')).toBeGreaterThanOrEqual(0);
    at('s1_undo_trash');
    renderBar();
    expect(undoButton().getAttribute('data-hint')).toBe('true');
    expect(undoButton().className).toContain('ws-hint-ring');
    expect(trash().getAttribute('data-hint')).toBeNull();
  });

  it('once undo is pressed, marks the trash instead', () => {
    at('s1_undo_trash', { undoCount: 1 });
    renderBar();
    expect(undoButton().getAttribute('data-hint')).toBeNull();
    expect(trash().getAttribute('data-hint')).toBe('true');
  });

  it('once both are done, marks nothing', () => {
    at('s1_undo_trash', { undoCount: 1, hasClearedBoard: true });
    renderBar();
    expect(undoButton().getAttribute('data-hint')).toBeNull();
    expect(trash().getAttribute('data-hint')).toBeNull();
  });

  it('marks nothing in the steps before it', () => {
    at('s1_build_305');
    renderBar();
    expect(undoButton().getAttribute('data-hint')).toBeNull();
    expect(trash().getAttribute('data-hint')).toBeNull();
  });
});

describe('station 1 subtraction: the trash is marked until a block goes in', () => {
  it('61 − 24: marked, then not', () => {
    at('s1_r_sub61');
    const { unmount } = renderBar();
    expect(trash().getAttribute('data-hint')).toBe('true');
    unmount();
    at('s1_r_sub61', { hasDeletedBlock: true });
    renderBar();
    expect(trash().getAttribute('data-hint')).toBeNull();
  });

  it('the addition exercise marks nothing', () => {
    at('s1_t8');
    renderBar();
    expect(trash().getAttribute('data-hint')).toBeNull();
  });

  it('other meetings mark nothing', () => {
    useWorkspaceStore.setState({ sessionNumber: 5, standardTaskIdx: 0, hasDeletedBlock: false } as never);
    renderBar();
    expect(trash().getAttribute('data-hint')).toBeNull();
    expect(undoButton().getAttribute('data-hint')).toBeNull();
  });
});

describe('memory circles only over the columns the exercise uses', () => {
  const circles = () => screen.queryAllByLabelText(/^עיגול הזיכרון של טור ה/).map((e) => e.getAttribute('aria-label'));

  it('61 − 24: tens and units only', () => {
    render(<VerticalAdditionTask numberA={61} numberB={24} isSubtraction answerLength={2} />);
    expect(circles()).toEqual(['עיגול הזיכרון של טור העשרות', 'עיגול הזיכרון של טור היחידות']);
  });

  it('713 + 94: hundreds, tens and units', () => {
    render(<VerticalAdditionTask numberA={713} numberB={94} answerLength={3} />);
    expect(circles()).toEqual(['עיגול הזיכרון של טור המאות', 'עיגול הזיכרון של טור העשרות', 'עיגול הזיכרון של טור היחידות']);
  });

  it('an answer one digit longer keeps the circle over its new column', () => {
    render(<VerticalAdditionTask numberA={645} numberB={478} answerLength={4} />);
    expect(circles()).toHaveLength(4);
  });
});
