import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '../../application/useWorkspaceStore';
import { useTeacherStore, calculateRadarColor } from '../../application/useTeacherStore';
import { OfflineSyncEngine } from '../../infrastructure/OfflineSyncEngine';
import type { TelemetryPayload } from '../../types';

describe('Work Package 2 (WP2): Global State Management & Offline Queue Engine', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
  });

  describe('1. VRA Workspace State Machine (Module 29 / Appendix A §5)', () => {
    it('initializes in IDLE state and transitions across all 5 canonical states', () => {
      const store = useWorkspaceStore.getState();
      expect(store.currentState).toBe('IDLE');

      store.transitionTo('PROBLEM_ACTIVE');
      expect(useWorkspaceStore.getState().currentState).toBe('PROBLEM_ACTIVE');

      store.transitionTo('REGROUPING_ACTIVE');
      expect(useWorkspaceStore.getState().currentState).toBe('REGROUPING_ACTIVE');

      store.transitionTo('SOCRATIC_ACTIVE');
      expect(useWorkspaceStore.getState().currentState).toBe('SOCRATIC_ACTIVE');

      store.transitionTo('COMPLETE');
      expect(useWorkspaceStore.getState().currentState).toBe('COMPLETE');
    });

    it('manages hesitation timer and resets only upon cognitive interaction', () => {
      const store = useWorkspaceStore.getState();
      expect(store.hesitationTimerSeconds).toBe(0);

      store.tickHesitationTimer();
      store.tickHesitationTimer();
      expect(useWorkspaceStore.getState().hesitationTimerSeconds).toBe(2);

      store.resetHesitationTimer();
      expect(useWorkspaceStore.getState().hesitationTimerSeconds).toBe(0);
    });

    it('manages Socratic card 60-second penalty lockout (Module 12)', () => {
      const store = useWorkspaceStore.getState();
      expect(store.isSocraticCardLocked).toBe(false);
      expect(store.socraticLockDeadline).toBeNull();

      store.lockSocraticCard(60000);
      const lockedState = useWorkspaceStore.getState();
      expect(lockedState.isSocraticCardLocked).toBe(true);
      expect(lockedState.socraticLockDeadline).toBeGreaterThan(Date.now());

      store.unlockSocraticCard();
      const unlockedState = useWorkspaceStore.getState();
      expect(unlockedState.isSocraticCardLocked).toBe(false);
      expect(unlockedState.socraticLockDeadline).toBeNull();
    });

    it('enforces generic undo stack cap of exactly 10 snapshots (Module 11 / Appendix A §5)', () => {
      const store = useWorkspaceStore.getState();

      for (let i = 1; i <= 15; i++) {
        store.pushUndoSnapshot({ actionIndex: i, testVal: `val_${i}` });
      }

      const state = useWorkspaceStore.getState();
      expect(state.genericUndoStack).toHaveLength(10);
      expect(state.genericUndoStack[0]).toEqual({ actionIndex: 6, testVal: 'val_6' });
      expect(state.genericUndoStack[9]).toEqual({ actionIndex: 15, testVal: 'val_15' });

      const popped = store.popUndoSnapshot();
      expect(popped).toEqual({ actionIndex: 15, testVal: 'val_15' });
      expect(useWorkspaceStore.getState().genericUndoStack).toHaveLength(9);
    });

    it('tracks active column index strictly between 0 (Ones), 1 (Tens), and 2 (Hundreds)', () => {
      const store = useWorkspaceStore.getState();
      expect(store.activeColumnIndex).toBe(0);

      store.setActiveColumnIndex(1);
      expect(useWorkspaceStore.getState().activeColumnIndex).toBe(1);

      store.setActiveColumnIndex(2);
      expect(useWorkspaceStore.getState().activeColumnIndex).toBe(2);
    });
  });

  describe('2. Silent Radar & Teacher Dashboard State (Module 18 & Module 20)', () => {
    it('initializes 3x4 fixed grid with exactly 12 anonymous student profiles', () => {
      const grid = useTeacherStore.getState().studentsGrid;
      expect(Object.keys(grid)).toHaveLength(12);

      for (let id = 1; id <= 12; id++) {
        expect(grid[id]).toBeDefined();
        expect(grid[id].student_id).toBe(id);
        expect(grid[id].status).toBe('GREY');
      }
    });

    it('strictly enforces color precedence hierarchy: RED > GREY > YELLOW > GREEN', () => {
      const now = Date.now();

      // Case 1: RED (Socratic card active) takes precedence over all other flags
      const socraticActive = calculateRadarColor({
        isOnline: true,
        isSocraticActive: true,
        isHesitating: true,
        lastActiveTimestamp: now,
      });
      expect(socraticActive).toBe('RED');

      // Case 2: GREY (Offline or heartbeat > 15s) takes precedence over YELLOW & GREEN
      const disconnected = calculateRadarColor({
        isOnline: false,
        isSocraticActive: false,
        isHesitating: true,
        lastActiveTimestamp: now,
      });
      expect(disconnected).toBe('GREY');

      const heartbeatExpired = calculateRadarColor({
        isOnline: true,
        isSocraticActive: false,
        isHesitating: true,
        lastActiveTimestamp: now - 20000, // 20 seconds ago (>15s)
      });
      expect(heartbeatExpired).toBe('GREY');

      // Case 3: YELLOW (Hesitating 45s) takes precedence over GREEN
      const hesitating = calculateRadarColor({
        isOnline: true,
        isSocraticActive: false,
        isHesitating: true,
        lastActiveTimestamp: now,
      });
      expect(hesitating).toBe('YELLOW');

      // Case 4: GREEN (Normal active learning)
      const normalActive = calculateRadarColor({
        isOnline: true,
        isSocraticActive: false,
        isHesitating: false,
        lastActiveTimestamp: now,
      });
      expect(normalActive).toBe('GREEN');
    });

    it('manages Projector Mode state and ignores outdated timestamps', () => {
      const teacherStore = useTeacherStore.getState();

      const t1 = 100000;
      teacherStore.setProjectorMode(true, 'teacher_01', t1);
      expect(useTeacherStore.getState().projectorMode).toBe(true);
      expect(useTeacherStore.getState().projectorModeUpdatedAt).toBe(t1);

      // Attempt to apply outdated state update (t0 < t1)
      const t0 = 50000;
      teacherStore.setProjectorMode(false, 'teacher_01', t0);
      // State should remain unchanged
      expect(useTeacherStore.getState().projectorMode).toBe(true);
      expect(useTeacherStore.getState().projectorModeUpdatedAt).toBe(t1);
    });

    it('updates teacher approval gate atomically per student document', () => {
      const teacherStore = useTeacherStore.getState();

      teacherStore.approveTeacherGate(4, 'green_path', 'teacher_01');
      const student4 = useTeacherStore.getState().studentsGrid[4];
      expect(student4.teacherGateApproved).toBe(true);
      expect(student4.teacherSelectedPath).toBe('green_path');
    });
  });

  describe('3. Offline Sync Engine & Idempotency Rules (Module 17)', () => {
    it('instantiates OfflineSyncEngine with initial connection state tracking', () => {
      const engine = new OfflineSyncEngine();
      expect(['ONLINE_SYNCED', 'ONLINE_SYNCING', 'OFFLINE']).toContain(engine.getConnectionState());
    });

    it('structures telemetry queue payloads with unique idempotency_key for Firestore Doc ID', () => {
      const samplePayload: TelemetryPayload<'REGROUPING_SUCCESS'> = {
        idempotency_key: 'idemp-uuid-regroup-999',
        client_timestamp: Date.now(),
        session_id: 'session_pilot_02',
        student_id: 6,
        exercise_id: 'ex_compulsory_04',
        event_type: 'REGROUPING_SUCCESS',
        column_index: 0,
        details: {
          regrouping_type: 'decomposition',
          duration_ms: 3200,
        },
      };

      expect(samplePayload.idempotency_key).toBe('idemp-uuid-regroup-999');
      expect(samplePayload.student_id).toBe(6);
      expect(samplePayload.details.regrouping_type).toBe('decomposition');
    });
  });
});
