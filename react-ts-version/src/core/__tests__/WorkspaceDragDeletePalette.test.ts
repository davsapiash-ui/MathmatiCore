import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { resolveDrop, type DropInput } from '@/core/placeValue';

describe('Workspace Drag-and-Drop & Trash Deletion Suite', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().initSession(1, false, null, 0);
  });

  it('correctly resolves dropping a column block into the trash zone', () => {
    const initialCounts = { units: 5, tens: 3, hundreds: 1, thousands: 0 };
    
    // Drag a unit block to trash
    const unitTrashInput: DropInput = {
      source: 'column',
      sourcePlace: 'units',
      target: { kind: 'trash' },
    };
    const unitResult = resolveDrop(initialCounts, unitTrashInput, 0);
    expect(unitResult.ok).toBe(true);
    if (unitResult.ok) {
      expect(unitResult.counts.units).toBe(4);
      expect(unitResult.removed).toBe('units');
    }

    // Drag a tens block to trash
    const tensTrashInput: DropInput = {
      source: 'column',
      sourcePlace: 'tens',
      target: { kind: 'trash' },
    };
    const tensResult = resolveDrop(initialCounts, tensTrashInput, 0);
    expect(tensResult.ok).toBe(true);
    if (tensResult.ok) {
      expect(tensResult.counts.tens).toBe(2);
      expect(tensResult.removed).toBe('tens');
    }
  });

  it('rejects trash drop if source is palette (palette drops cannot be deleted directly to trash)', () => {
    const initialCounts = { units: 5, tens: 3, hundreds: 1, thousands: 0 };
    const paletteTrashInput: DropInput = {
      source: 'palette',
      sourcePlace: 'units',
      target: { kind: 'trash' },
    };
    const res = resolveDrop(initialCounts, paletteTrashInput, 0);
    expect(res.ok).toBe(false);
  });

  it('updates store state when applyDrop is called with column to trash', () => {
    const store = useWorkspaceStore.getState();
    
    // First, add 2 units
    store.applyDrop({
      source: 'palette',
      sourcePlace: 'units',
      target: { kind: 'column', place: 'units' },
    });
    store.applyDrop({
      source: 'palette',
      sourcePlace: 'units',
      target: { kind: 'column', place: 'units' },
    });
    expect(useWorkspaceStore.getState().counts.units).toBe(2);

    // Now drag 1 unit from column to trash
    store.applyDrop({
      source: 'column',
      sourcePlace: 'units',
      target: { kind: 'trash' },
    });
    expect(useWorkspaceStore.getState().counts.units).toBe(1);
    expect(useWorkspaceStore.getState().hasDeletedBlock).toBe(true);
    // Module 11: Block deletion is NOT counted as Undo
    expect(useWorkspaceStore.getState().undoCount).toBe(0);
  });

  it('supports decomposing high place block to adjacent lower place (Tens to Units)', () => {
    const store = useWorkspaceStore.getState();
    
    // Add 1 tens rod
    store.applyDrop({
      source: 'palette',
      sourcePlace: 'tens',
      target: { kind: 'column', place: 'tens' },
    });
    expect(useWorkspaceStore.getState().counts.tens).toBe(1);
    expect(useWorkspaceStore.getState().counts.units).toBe(0);

    // Drag tens rod to units column
    store.applyDrop({
      source: 'column',
      sourcePlace: 'tens',
      target: { kind: 'column', place: 'units' },
    });
    expect(useWorkspaceStore.getState().counts.tens).toBe(0);
    expect(useWorkspaceStore.getState().counts.units).toBe(10);
    expect(useWorkspaceStore.getState().hasUngrouped).toBe(true);
  });
});
