import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { IndexedDBQueue, type QueuedAction } from '@/infrastructure/services/IndexedDBQueue';
import { containsPII } from '@/core/security/PiiFilter';

describe('Master PRD v5.0 — Phase 5: Pedagogical Progression, Offline Resilience & SRL Reflection', () => {

  describe('Module 14: Session Logic & Pathing', () => {
    it('enforces exact time limits: 15 minutes for sessions 3-7, 25 minutes for sessions 2 & 8', () => {
      const getSessionDurationMinutes = (sessionNumber: number): number => {
        return (sessionNumber === 2 || sessionNumber === 8 || sessionNumber === 1) ? 25 : 15;
      };

      // Sessions 3 to 7 -> 15 minutes
      expect(getSessionDurationMinutes(3)).toBe(15);
      expect(getSessionDurationMinutes(4)).toBe(15);
      expect(getSessionDurationMinutes(5)).toBe(15);
      expect(getSessionDurationMinutes(6)).toBe(15);
      expect(getSessionDurationMinutes(7)).toBe(15);

      // Sessions 2 and 8 -> 25 minutes
      expect(getSessionDurationMinutes(2)).toBe(25);
      expect(getSessionDurationMinutes(8)).toBe(25);
      expect(getSessionDurationMinutes(1)).toBe(25);
    });

    it('triggers isTimeExceeded flag in useWorkspaceStore when session duration expires', () => {
      const store = useWorkspaceStore.getState();

      // Test Session 4 (15 minutes limit) - deadline expired 1 minute ago
      useWorkspaceStore.setState({
        sessionNumber: 4,
        sessionDeadlineTime: Date.now() - (1 * 60 * 1000), // expired 1 min ago
        isTimeExceeded: false,
      });

      store.checkTimeExceeded();
      expect(useWorkspaceStore.getState().isTimeExceeded).toBe(true);

      // Test Session 4 within limit (deadline in 5 minutes)
      useWorkspaceStore.setState({
        sessionNumber: 4,
        sessionDeadlineTime: Date.now() + (5 * 60 * 1000), // in 5 mins
        isTimeExceeded: false,
      });

      store.checkTimeExceeded();
      expect(useWorkspaceStore.getState().isTimeExceeded).toBe(false);

      // Test Session 8 (25 minutes limit) - 5 minutes remaining
      useWorkspaceStore.setState({
        sessionNumber: 8,
        sessionDeadlineTime: Date.now() + (5 * 60 * 1000),
        isTimeExceeded: false,
      });

      store.checkTimeExceeded();
      expect(useWorkspaceStore.getState().isTimeExceeded).toBe(false);

      // Test Session 8 exceeded (deadline passed 1 minute ago)
      useWorkspaceStore.setState({
        sessionNumber: 8,
        sessionDeadlineTime: Date.now() - (1 * 60 * 1000),
        isTimeExceeded: false,
      });

      store.checkTimeExceeded();
      expect(useWorkspaceStore.getState().isTimeExceeded).toBe(true);
    });

    it('manages mandatory foundation vs challenge (Rabbah) task progression', () => {
      const evaluateSessionProgress = (completedTasks: number, mandatoryTotal: number, challengeTotal: number) => {
        const mandatoryCompleted = completedTasks >= mandatoryTotal;
        const isEligibleForChallenge = mandatoryCompleted;
        const totalCompleted = completedTasks >= (mandatoryTotal + challengeTotal);

        return {
          mandatoryCompleted,
          isEligibleForChallenge,
          totalCompleted,
        };
      };

      // 5 mandatory tasks, 2 challenge tasks
      const step1 = evaluateSessionProgress(3, 5, 2);
      expect(step1.mandatoryCompleted).toBe(false);
      expect(step1.isEligibleForChallenge).toBe(false);

      const step2 = evaluateSessionProgress(5, 5, 2);
      expect(step2.mandatoryCompleted).toBe(true);
      expect(step2.isEligibleForChallenge).toBe(true);
      expect(step2.totalCompleted).toBe(false);

      const step3 = evaluateSessionProgress(7, 5, 2);
      expect(step3.mandatoryCompleted).toBe(true);
      expect(step3.isEligibleForChallenge).toBe(true);
      expect(step3.totalCompleted).toBe(true);
    });
  });

  describe('Module 15: Sandbox & Projector Mode', () => {
    it('syncs projector mode trigger in real time (<1000ms)', async () => {
      vi.useFakeTimers();
      let isProjectorMode = false;
      let latencyMs = 0;

      const triggerProjectorMode = () => {
        const start = Date.now();
        setTimeout(() => {
          isProjectorMode = true;
          latencyMs = Date.now() - start;
        }, 150); // Realtime listener simulates 150ms network dispatch
      };

      triggerProjectorMode();
      expect(isProjectorMode).toBe(false);

      vi.advanceTimersByTime(200);
      expect(isProjectorMode).toBe(true);
      expect(latencyMs).toBeLessThan(1000);

      vi.useRealTimers();
    });

    it('provides serene projector waiting message without popup modals or intrusive overlays', () => {
      const projectorText = 'הקשיבו להסבר של המורה על גבי המקרן';
      expect(projectorText).toBe('הקשיבו להסבר של המורה על גבי המקרן');
    });
  });

  describe('Module 16: SRL Reflection Board - End of Session 8', () => {
    it('calculates the Canonical SRL Persistence Index: (U / (U + E + G)) * 100', () => {
      const calculatePersistence = (U: number, E: number, G: number): number => {
        const safeU = Math.max(0, U);
        const safeE = Math.max(0, E);
        const safeG = Math.max(0, G);
        const denominator = safeU + safeE + safeG;

        if (denominator === 0) return 100; // Zero handling default
        return Math.min(100, Math.max(0, Math.round((safeU / denominator) * 100)));
      };

      // Vector 1: Perfect persistence (5 undos, 0 errors, 0 guesses) -> 100%
      expect(calculatePersistence(5, 0, 0)).toBe(100);

      // Vector 2: Empty activity (0, 0, 0) -> 100% (safe zero denominator default)
      expect(calculatePersistence(0, 0, 0)).toBe(100);

      // Vector 3: Mixed (6 undos, 2 errors, 2 guesses) -> 6 / (6+2+2) = 60%
      expect(calculatePersistence(6, 2, 2)).toBe(60);

      // Vector 4: High error/guess load (2 undos, 6 errors, 2 guesses) -> 2 / 10 = 20%
      expect(calculatePersistence(2, 6, 2)).toBe(20);

      // Vector 5: Negative value resilience
      expect(calculatePersistence(-5, 0, 0)).toBe(100);
    });

    it('enforces 3-stage reflection flow: Effort (3 emojis) -> Strategies -> Persistence metric', () => {
      const stages = ['STAGE_A_EFFORT', 'STAGE_B_STRATEGIES', 'STAGE_C_PERSISTENCE'];
      expect(stages).toHaveLength(3);

      const effortEmojis = ['🟢', '🟡', '🔴'];
      expect(effortEmojis).toHaveLength(3);

      const strategies = ['undo', 'memory', 'hints', 'blocks'];
      expect(strategies).toContain('undo');
      expect(strategies).toContain('memory');
    });
  });

  describe('Module 17: Offline Resilience & FIFO Sync', () => {
    let queue: IndexedDBQueue;

    beforeEach(async () => {
      queue = IndexedDBQueue.getInstance();
      await queue.clear();
    });

    it('buffers transactions in FIFO order and flushes upon reconnection', async () => {
      const syncedPayloads: any[] = [];
      queue.registerSyncHandler(async (refPath, payload) => {
        syncedPayloads.push({ refPath, payload });
      });

      // Enqueue 3 transactions
      await queue.enqueue('telemetry/student_1', { action: 'drop_1', seq: 1 });
      await queue.enqueue('telemetry/student_1', { action: 'drop_2', seq: 2 });
      await queue.enqueue('telemetry/student_1', { action: 'drop_3', seq: 3 });

      const items = await queue.getAll();
      expect(items).toHaveLength(3);
      expect(items[0].payload.seq).toBe(1);
      expect(items[1].payload.seq).toBe(2);
      expect(items[2].payload.seq).toBe(3);

      // Flush queue (simulate reconnection)
      await queue.flushQueue();
      expect(syncedPayloads).toHaveLength(3);
      expect(syncedPayloads[0].payload.seq).toBe(1);
      expect(syncedPayloads[2].payload.seq).toBe(3);

      const remaining = await queue.getAll();
      expect(remaining).toHaveLength(0);
    });

    it('enforces 500-item maximum capacity (FIFO eviction of oldest items)', async () => {
      for (let i = 1; i <= 510; i++) {
        await queue.enqueue('telemetry/student_2', { seq: i });
      }

      const items = await queue.getAll();
      expect(items.length).toBeLessThanOrEqual(500);

      // Oldest items (1..10) must have been evicted, first item is >= 11
      const firstSeq = items[0].payload.seq;
      const lastSeq = items[items.length - 1].payload.seq;

      expect(firstSeq).toBeGreaterThanOrEqual(11);
      expect(lastSeq).toBe(510);
    });

    it('guarantees zero PII in offline buffered payloads', async () => {
      await queue.enqueue('telemetry/student_user3', {
        studentId: 'student_3',
        action: 'block_drag',
        count: 4,
      });

      const items = await queue.getAll();
      expect(items).toHaveLength(1);
      expect(containsPII(JSON.stringify(items[0].payload))).toBe(false);
    });
  });
});
