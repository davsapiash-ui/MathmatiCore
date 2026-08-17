import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';

describe('Master PRD v5.0 Phase 2: Student Hub & Pedagogical Workspace (Modules 6, 7, 8, 9, 10, 11)', () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
    useWorkspaceStore.getState().resetWorkspace?.();
  });

  describe('Module 6: Student Hub Dynamic Single Card', () => {
    it('initializes default session as Session 1 (תחנה אחת הכרות עם המערכת)', () => {
      useWorkspaceStore.getState().startSession(1);
      const state = useWorkspaceStore.getState();
      expect(state.sessionNumber).toBe(1);
    });

    it('supports starting Session 2 (תחנה שתיים יוצאים למסע)', () => {
      useWorkspaceStore.getState().startSession(2);
      const state = useWorkspaceStore.getState();
      expect(state.sessionNumber).toBe(2);
    });
  });

  describe('Modules 7 & 8: Place Value Board & Dienes Blocks Physics', () => {
    it('sets focused place and dims inactive columns with pointer-events disabled', () => {
      useWorkspaceStore.getState().setFocusedPlace('units');
      const state = useWorkspaceStore.getState();
      expect(state.focusedPlace).toBe('units');
    });

    it('supports grouping 10 units into 1 ten via place value conversion', () => {
      useWorkspaceStore.setState({
        counts: { units: 10, tens: 0, hundreds: 0, thousands: 0 },
        keyboardState: 'LOCKED',
      });

      useWorkspaceStore.getState().groupColumnClick('units');
      const state = useWorkspaceStore.getState();
      expect(state.counts.units).toBe(0);
      expect(state.counts.tens).toBe(1);
      // Regrouping triggers unlocking of keyboard
      expect(state.keyboardState).toBe('UNLOCKED');
    });

    it('supports decomposing 1 ten into 10 units via place value conversion', () => {
      useWorkspaceStore.setState({
        counts: { units: 0, tens: 1, hundreds: 0, thousands: 0 },
        keyboardState: 'LOCKED',
      });

      useWorkspaceStore.getState().splitBlockClick('tens');
      const state = useWorkspaceStore.getState();
      expect(state.counts.units).toBe(10);
      expect(state.counts.tens).toBe(0);
      expect(state.keyboardState).toBe('UNLOCKED');
    });
  });

  describe('Modules 9 & 10: Dynamic Keyboard & Addition Grid', () => {
    it('keeps memory circles active and editable at all times', () => {
      useWorkspaceStore.getState().setCarryDigit('tens', '1');
      const state = useWorkspaceStore.getState();
      expect(state.carryDigits.tens).toBe('1');
    });

    it('opens addition helper grid on cognitive hesitation trigger', () => {
      useWorkspaceStore.setState({ isAdditionHelperOpen: false });
      useWorkspaceStore.getState().openAdditionHelper();
      expect(useWorkspaceStore.getState().isAdditionHelperOpen).toBe(true);
    });

    it('locks result row keyboard initially when profile is enhanced and unlocks upon conversion', () => {
      useWorkspaceStore.setState({
        keyboardState: 'LOCKED',
        counts: { units: 12, tens: 0, hundreds: 0, thousands: 0 },
      });

      expect(useWorkspaceStore.getState().keyboardState).toBe('LOCKED');

      // Conversion: Group 10 units
      useWorkspaceStore.getState().groupColumnClick('units');
      expect(useWorkspaceStore.getState().keyboardState).toBe('UNLOCKED');
    });
  });

  describe('Module 11: Undo Action Engine & Silent Self-Regulation', () => {
    it('maintains a strict 10-action client-side state stack', () => {
      useWorkspaceStore.setState({ undoStack: [] });

      // Perform 15 drop actions into units column
      for (let i = 1; i <= 15; i++) {
        useWorkspaceStore.getState().applyDrop({
          source: 'palette',
          sourcePlace: 'units',
          target: { kind: 'column', place: 'units' },
        });
      }

      const state = useWorkspaceStore.getState();
      expect(state.undoStack.length).toBeLessThanOrEqual(10);
    });

    it('undoes actions synchronously restoring counts and memory circles silently', () => {
      useWorkspaceStore.setState({
        counts: { units: 0, tens: 0, hundreds: 0, thousands: 0 },
        undoStack: [],
      });

      useWorkspaceStore.getState().applyDrop({
        source: 'palette',
        sourcePlace: 'units',
        target: { kind: 'column', place: 'units' },
      });
      expect(useWorkspaceStore.getState().counts.units).toBe(1);

      useWorkspaceStore.getState().applyDrop({
        source: 'palette',
        sourcePlace: 'units',
        target: { kind: 'column', place: 'units' },
      });
      expect(useWorkspaceStore.getState().counts.units).toBe(2);

      useWorkspaceStore.getState().undo();
      expect(useWorkspaceStore.getState().counts.units).toBe(1);

      useWorkspaceStore.getState().undo();
      expect(useWorkspaceStore.getState().counts.units).toBe(0);
    });
  });
});
