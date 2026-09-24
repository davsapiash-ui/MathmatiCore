import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore, selectCanProceed } from '@/application/useWorkspaceStore';
import { resolveDrop, type DropInput } from '@/core/placeValue';

describe('Workspace Drag-and-Drop & Trash Deletion Suite', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().initSession(1, false, 0);
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

  it('s1_sandbox_controlled (מסמך 03 §3.1 steps 1–2) proceeds once 5 blocks were dragged; the trash is step 5', () => {
    const store = useWorkspaceStore.getState();
    // Initially, cannot proceed
    expect(selectCanProceed(useWorkspaceStore.getState())).toBe(false);

    // Add 4 blocks from palette: not yet
    for (let i = 0; i < 4; i++) {
      store.applyDrop({
        source: 'palette',
        sourcePlace: 'tens',
        target: { kind: 'column', place: 'tens' },
      });
    }
    expect(selectCanProceed(useWorkspaceStore.getState())).toBe(false);

    // The fifth block completes free exploration — no deletion is asked here.
    store.applyDrop({
      source: 'palette',
      sourcePlace: 'tens',
      target: { kind: 'column', place: 'tens' },
    });
    expect(useWorkspaceStore.getState().blocksAddedCount).toBe(5);
    expect(useWorkspaceStore.getState().hasDeletedBlock).toBe(false);
    expect(selectCanProceed(useWorkspaceStore.getState())).toBe(true);
  });

  it('suppresses overcrowding Socratic hint during s1_sandbox_controlled even when > 9 blocks are in a column', async () => {
    const { SocraticEngine } = await import('@/infrastructure/services/SocraticEngine');
    const task = {
      id: 's1_sandbox_controlled',
      type: 'session1_intro',
      titleHe: 'חקירה וירטואלית חופשית',
      instructionHe: 'גררו לבנים לטורים משמאל וצפו בספרות המשתנות בלוח בית המספרים!',
    };

    // 12 tens on the board during sandbox
    const counts = { units: 1, tens: 12, hundreds: 1, thousands: 0 };
    const hint = await SocraticEngine.getSocraticHint(task, 'general', counts);

    expect(hint).toBeDefined();
    // Must NOT ask about overcrowding (12 tens)
    expect(hint?.questionHe).not.toContain('12 עשרות');
    expect(hint?.questionHe).toContain('בואו נסתכל על רשימת המשימות');
  });
});
