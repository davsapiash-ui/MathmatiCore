/**
 * @vitest-environment jsdom
 *
 * Student-journey audit, 4.10.2026: what the child's board calls its parts.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { BlockPalette } from '@/features/workspace/board/BlockPalette';
import { DienesBlock } from '@/features/workspace/board/DienesBlock';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

afterEach(cleanup);

describe('the toolbox keeps its name in every form (A4-F04, A5-F08)', () => {
  // The cards say "גוררים לבנים מארגז הכלים": the box must be on the screen
  // under that name, with the side panel open or the board narrow.
  it.each([false, true])('compact = %s: "ארגז כלים" is visible', (compact) => {
    useWorkspaceStore.setState({ sessionNumber: 4 } as never);
    const { container } = render(
      <DndContext>
        <BlockPalette scaffoldLevel={0} compact={compact} />
      </DndContext>
    );
    const tray = container.querySelector('#tour-block-palette')!;
    const visibleName = Array.from(tray.querySelectorAll('span, div')).find(
      (el) => el.textContent?.replace(/🧰/g, '').trim() === 'ארגז כלים' && !el.closest('.hidden')
    );
    expect(visibleName).toBeDefined();
  });

  it('in compact form the name sits on the tray\'s edge and adds no row', () => {
    useWorkspaceStore.setState({ sessionNumber: 4 } as never);
    const { getByTestId } = render(
      <DndContext>
        <BlockPalette scaffoldLevel={0} compact />
      </DndContext>
    );
    expect(getByTestId('toolbox-name').className).toMatch(/\babsolute\b/);
  });
});

describe('the blocks\' screen-reader names (A7-013)', () => {
  const label = (place: 'units' | 'tens' | 'hundreds' | 'thousands') => {
    const { container } = render(
      <DndContext>
        <DienesBlock id={`b-${place}`} place={place} />
      </DndContext>
    );
    const name = container.querySelector('[role="button"]')!.getAttribute('aria-label');
    cleanup();
    return name;
  };

  it('each block is "לבנת …", and says only what the board lets the child do with it', () => {
    // A unit moves only to the trash (core/placeValue.ts resolveDrop).
    expect(label('units')).toBe('לבנת יחידה — גררו אותה לפח האשפה כדי למחוק אותה');
    expect(label('tens')).toBe('לבנת עשרת — לחצו עליה כדי לפרוט אותה לעשר יחידות, או גררו אותה לטור היחידות או לפח האשפה');
    expect(label('hundreds')).toBe('לבנת מאה — לחצו עליה כדי לפרוט אותה לעשר לבני עשרת, או גררו אותה לטור העשרות או לפח האשפה');
    expect(label('thousands')).toBe('לבנת אלף — לחצו עליה כדי לפרוט אותה לעשר לבני מאה, או גררו אותה לטור המאות או לפח האשפה');
  });
});
