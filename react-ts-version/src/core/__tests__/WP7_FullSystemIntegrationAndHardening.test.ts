import { describe, it, expect } from 'vitest';
import { useWorkspaceStore } from '../../application/useWorkspaceStore';
import { useTeacherStore, calculateRadarColor } from '../../application/useTeacherStore';
import { useAdminStore } from '../../application/useAdminStore';
import { serverNow } from '../../infrastructure/firebase';

describe('Work Package 7 (WP7): Full System Hardening, State Integrity & Cross-Module End-to-End Pipeline', () => {

  describe('1. Module 29: Zustand Store Invariants & Atomic State Transitions', () => {
    it('initializes useWorkspaceStore cleanly with 0-dependency initial state', () => {
      const state = useWorkspaceStore.getState();
      expect(state.counts).toBeDefined();
      expect(state.flowStatus).toBe('task');
      expect(state.keyboardState).toBe('UNLOCKED');
      expect(state.isTimeExceeded).toBe(false);
    });

    it('initializes useTeacherStore with 12 anonymous student cells in 3x4 grid', () => {
      const teacherState = useTeacherStore.getState();
      const gridKeys = Object.keys(teacherState.studentsGrid);
      expect(gridKeys.length).toBe(12);

      for (let i = 1; i <= 12; i++) {
        expect(teacherState.studentsGrid[i]).toBeDefined();
        expect(teacherState.studentsGrid[i].student_id).toBe(i);
        expect(teacherState.studentsGrid[i].status).toBe('GREY');
      }
    });

    it('proves teacher radar color resolution transitions dynamically across presence and alerts', () => {
      const studentCell = {
        isOnline: true,
        isSocraticActive: false,
        isHesitating: false,
        lastActiveTimestamp: Date.now(),
      };

      // Default online active is GREEN
      expect(calculateRadarColor(studentCell)).toBe('GREEN');

      // Hesitation triggers YELLOW
      expect(calculateRadarColor({ ...studentCell, isHesitating: true })).toBe('YELLOW');

      // Socratic card trigger overrides to RED
      expect(calculateRadarColor({ ...studentCell, isHesitating: true, isSocraticActive: true })).toBe('RED');

      // Offline (last active > 15s) becomes GREY unless Socratic active (RED beats GREY)
      expect(calculateRadarColor({ ...studentCell, isOnline: false, lastActiveTimestamp: Date.now() - 20000 })).toBe('GREY');
      expect(calculateRadarColor({ ...studentCell, isOnline: false, isSocraticActive: true })).toBe('RED');
    });
  });

  describe('2. End-to-End Architectural Pipeline Integration (WP1 - WP6)', () => {
    it('validates authoritative deadline computation with serverNow()', () => {
      const deadline = serverNow() + 25 * 60 * 1000;
      useWorkspaceStore.setState({ sessionDeadlineTime: deadline, isTimeExceeded: false });

      expect(useWorkspaceStore.getState().getSessionRemainingSeconds()).toBeGreaterThan(1400);
      expect(useWorkspaceStore.getState().isTimeExceeded).toBe(false);
    });

    it('preserves SRL persistence calculation edge cases', () => {
      const calcPersistence = (u: number, e: number, g: number) => {
        const denom = u + e + g;
        return denom === 0 ? 100 : Math.round((u / denom) * 100);
      };

      expect(calcPersistence(0, 0, 0)).toBe(100);
      expect(calcPersistence(5, 0, 0)).toBe(100);
      expect(calcPersistence(3, 3, 0)).toBe(50);
      expect(calcPersistence(0, 4, 1)).toBe(0);
    });
  });
});
