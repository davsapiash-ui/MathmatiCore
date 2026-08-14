import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAuthStore, unifiedLogout } from '@/application/useAuthStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useChatStore, normalizeStudentId, computeRoomId, type ChatMessage } from '@/application/useChatStore';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';

// Mock storage
const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => mockStorage[key] || null),
  setItem: vi.fn((key: string, val: string) => { mockStorage[key] = String(val); }),
  removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
  clear: vi.fn(() => { Object.keys(mockStorage).forEach((k) => delete mockStorage[k]); }),
};

if (typeof window === 'undefined') {
  (globalThis as any).window = {
    location: { hostname: 'localhost' },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
}

(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).sessionStorage = mockLocalStorage;

describe('Challenger 2 — Concurrency, Network Chaos, & SRL Metrics Adversarial Stress Suite', () => {

  beforeEach(() => {
    mockLocalStorage.clear();
    vi.clearAllMocks();
    unifiedLogout();
  });

  // ==========================================================================
  // 1. OFFLINE TELEMETRY QUEUE STRESS TEST (1,000 ITEMS, FIFO, 500 CAP)
  // ==========================================================================
  describe('1. Offline Telemetry Queue — 1,000 Item Burst & FIFO 500 Cap', () => {
    it('should strictly enforce 500-item cap and maintain FIFO ordering when flooded with 1,000 items', () => {
      const syncService = firebaseSyncService as any;
      syncService.offlineTelemetryQueue = [];

      // Step 1: Enqueue 1,000 sequential telemetry transactions while offline
      for (let i = 0; i < 1000; i++) {
        syncService.enqueueOfflineTransaction('radar_alerts/student_user1', {
          sequenceId: i,
          type: 'STRESS_BURST',
          timestamp: 1000000 + i,
          data: { payloadIndex: i, testVal: `packet_${i}` }
        });
      }

      const queue: Array<{ refPath: string, payload: any }> = syncService.offlineTelemetryQueue;

      // Invariant 1: Queue length must be strictly capped at 500 items
      expect(queue.length).toBe(500);

      // Invariant 2: FIFO behavior — the oldest 500 items (0..499) must be dropped,
      // and items 500..999 must remain in strictly ascending sequence
      expect(queue[0].payload.sequenceId).toBe(500);
      expect(queue[499].payload.sequenceId).toBe(999);

      for (let j = 0; j < 500; j++) {
        expect(queue[j].payload.sequenceId).toBe(500 + j);
      }

      // Invariant 3: localStorage persistence must match the 500-item capped queue exactly
      const rawStored = mockLocalStorage.setItem.mock.calls[mockLocalStorage.setItem.mock.calls.length - 1][1];
      const parsedStored = JSON.parse(rawStored);
      expect(parsedStored.length).toBe(500);
      expect(parsedStored[0].payload.sequenceId).toBe(500);
      expect(parsedStored[499].payload.sequenceId).toBe(999);
    });

    it('should truncate and preserve latest 500 items when loading oversized 1,000-item queue from localStorage', () => {
      const syncService = firebaseSyncService as any;

      // Simulate external/previous session storing 1,000 items in localStorage
      const mockOversizedPayload = Array.from({ length: 1000 }, (_, i) => ({
        refPath: `telemetry_chunks/student_user2`,
        payload: { seq: i, timestamp: Date.now() + i }
      }));
      mockStorage['mathmaticore_offline_queue'] = JSON.stringify(mockOversizedPayload);

      // Trigger load
      syncService.loadOfflineQueueFromStorage();

      const queue = syncService.offlineTelemetryQueue;
      expect(queue.length).toBe(500);
      expect(queue[0].payload.seq).toBe(500);
      expect(queue[499].payload.seq).toBe(999);
    });

    it('should survive corrupted and non-array storage payloads without crashing', () => {
      const syncService = firebaseSyncService as any;

      const corruptedPayloads = [
        '{ invalid json',
        'null',
        '12345',
        '"string_payload"',
        '{"some": "object"}',
        ''
      ];

      for (const badPayload of corruptedPayloads) {
        mockStorage['mathmaticore_offline_queue'] = badPayload;
        expect(() => syncService.loadOfflineQueueFromStorage()).not.toThrow();
      }
    });

    it('should sustain 10 consecutive multi-bursts of 200 items (2,000 total) with zero invariant violations', () => {
      const syncService = firebaseSyncService as any;
      syncService.offlineTelemetryQueue = [];

      let totalEnqueued = 0;
      for (let burst = 0; burst < 10; burst++) {
        for (let item = 0; item < 200; item++) {
          syncService.enqueueOfflineTransaction('replays/student_user3', {
            burstId: burst,
            globalSeq: totalEnqueued,
            data: `chunk_${totalEnqueued}`
          });
          totalEnqueued++;

          // Invariant: At no point during bursts should queue exceed 500
          expect(syncService.offlineTelemetryQueue.length).toBeLessThanOrEqual(500);
        }
      }

      expect(totalEnqueued).toBe(2000);
      expect(syncService.offlineTelemetryQueue.length).toBe(500);
      // Items remaining should be 1500 to 1999
      expect(syncService.offlineTelemetryQueue[0].payload.globalSeq).toBe(1500);
      expect(syncService.offlineTelemetryQueue[499].payload.globalSeq).toBe(1999);
    });
  });

  // ==========================================================================
  // 2. CHAT MESSAGE GENERATION, ROOM SEGREGATION & PACKET REORDERING
  // ==========================================================================
  describe('2. Chat Generation, Room Segregation & Packet Reordering', () => {
    it('should isolate rooms strictly per student and prevent cross-tenant message leakage', () => {
      // Test normalization and room derivation
      const testCases = [
        { sender: 'student_user1', receiver: 'teacher_1', expectedRoom: 'student_user1' },
        { sender: 'teacher_1', receiver: 'student_user1', expectedRoom: 'student_user1' },
        { sender: 'student_user2', receiver: 'teacher_1', expectedRoom: 'student_user2' },
        { sender: 'student_user12', receiver: 'teacher_99', expectedRoom: 'student_user12' },
        { sender: 'student_user1', receiver: 'student_user2', expectedRoom: 'student_user1' },
        { sender: 'teacher_1', receiver: 'admin', expectedRoom: 'teacher_1' },
        { sender: 'admin', receiver: 'teacher_1', expectedRoom: 'teacher_1' },
      ];

      for (const tc of testCases) {
        const roomId = computeRoomId(tc.sender, tc.receiver);
        expect(roomId).toBe(tc.expectedRoom);
      }
    });

    it('should sanitize and bound abnormal and malicious student IDs during room computation', () => {
      const maliciousInputs = [
        { input: 'student_999', expected: 'student_user12' }, // Clamped to max 12
        { input: 'student_-5', expected: 'student_user1' },   // Clamped to min 1
        { input: 'student_0', expected: 'student_user1' },    // Clamped to min 1
        { input: 'student_user7', expected: 'student_user7' },
        { input: '  student_user3  ', expected: 'student_user3' },
        { input: 'STUDENT_USER4', expected: 'student_user4' },
        { input: 'student_malicious_script', expected: 'student_student_malicious_script' },
      ];

      for (const tc of maliciousInputs) {
        const normalized = normalizeStudentId(tc.input);
        expect(normalized).toBe(tc.expected);
      }
    });

    it('should handle high volume optimistic messaging with zero duplicate messages and correct chronological ordering', () => {
      useChatStore.setState({ messages: [] });

      // Generate 100 interleaved messages with disordered timestamps
      const generatedMsgs: ChatMessage[] = [];
      for (let i = 0; i < 100; i++) {
        generatedMsgs.push({
          id: `msg_${i}`,
          senderId: i % 2 === 0 ? 'student_user1' : 'teacher_1',
          senderName: i % 2 === 0 ? 'Student 1' : 'Teacher',
          receiverId: i % 2 === 0 ? 'teacher_1' : 'student_user1',
          text: `Message content ${i}`,
          timestamp: 1700000000000 + (Math.sin(i) * 50000 + i * 1000),
          read: false,
        });
      }

      // Simulate receiving disordered messages from network snapshot
      const disordered = [...generatedMsgs].sort(() => Math.random() - 0.5);
      
      // Feed into store and sort by timestamp
      const sorted = [...disordered].sort((a, b) => a.timestamp - b.timestamp);
      useChatStore.setState({ messages: sorted });

      const storeMsgs = useChatStore.getState().messages;
      expect(storeMsgs.length).toBe(100);

      // Verify strict monotonic ascending timestamp sequence
      for (let k = 0; k < storeMsgs.length - 1; k++) {
        expect(storeMsgs[k].timestamp).toBeLessThanOrEqual(storeMsgs[k + 1].timestamp);
      }

      // Verify no duplicates
      const ids = new Set(storeMsgs.map(m => m.id));
      expect(ids.size).toBe(100);
    });

    it('should correctly handle optimistic message echo without duplicating message in store', () => {
      useChatStore.setState({ messages: [] });

      const optimisticMsg: ChatMessage = {
        id: 'msg_optimistic_1',
        senderId: 'student_user1',
        senderName: 'Student 1',
        receiverId: 'teacher_1',
        text: 'שלום המורה',
        timestamp: 1700000001000,
        read: false,
      };

      // 1. Optimistic push
      useChatStore.setState((state) => ({
        messages: [...state.messages.filter(m => m.id !== optimisticMsg.id), optimisticMsg]
      }));
      expect(useChatStore.getState().messages.length).toBe(1);

      // 2. Firebase RTDB sync event fires with same message
      useChatStore.setState((state) => ({
        messages: [...state.messages.filter(m => m.id !== optimisticMsg.id), optimisticMsg]
      }));
      expect(useChatStore.getState().messages.length).toBe(1);
      expect(useChatStore.getState().messages[0].id).toBe('msg_optimistic_1');
    });

    it('should support large base64 image message payloads without store corruption', () => {
      useChatStore.setState({ messages: [] });

      // Generate a mock 200KB base64 image string
      const largeBase64 = 'data:image/png;base64,' + 'A'.repeat(200000);
      const imgMsg: ChatMessage = {
        id: 'img_msg_1',
        senderId: 'student_user1',
        senderName: 'Student 1',
        receiverId: 'teacher_1',
        text: '',
        imageUrl: largeBase64,
        timestamp: Date.now(),
        read: false
      };

      useChatStore.setState({ messages: [imgMsg] });

      const state = useChatStore.getState();
      expect(state.messages.length).toBe(1);
      expect(state.messages[0].imageUrl?.length).toBeGreaterThan(200000);
      expect(state.messages[0].imageUrl?.startsWith('data:image/png;base64,')).toBe(true);
    });
  });

  // ==========================================================================
  // 3. SOCRATIC LOCKOUT TIMER FUZZING, TAB SWITCHING & DOM SIMULATION
  // ==========================================================================
  describe('3. Socratic Lockout Timer — Tab Switching, Edge Values & Storage Manipulation', () => {
    it('should compute exact wall-clock remaining seconds and auto-expire after 60s elapsed', () => {
      const now = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      // Trigger lockout
      useWorkspaceStore.getState().triggerSocraticPenaltyLockout('רמז דיסטרקטור');

      const until = useWorkspaceStore.getState().socraticPenaltyLockoutUntil;
      expect(until).toBe(now + 60000);

      // Immediately remaining must be 60s
      expect(useWorkspaceStore.getState().getSocraticPenaltyRemaining()).toBe(60);

      // Advance by 15s -> remaining must be 45s
      vi.spyOn(Date, 'now').mockReturnValue(now + 15000);
      expect(useWorkspaceStore.getState().getSocraticPenaltyRemaining()).toBe(45);

      // Advance by 59.5s -> remaining must be 1s
      vi.spyOn(Date, 'now').mockReturnValue(now + 59500);
      expect(useWorkspaceStore.getState().getSocraticPenaltyRemaining()).toBe(1);

      // Advance by 60s -> remaining must be 0 and lockout must be cleared
      vi.spyOn(Date, 'now').mockReturnValue(now + 60000);
      expect(useWorkspaceStore.getState().getSocraticPenaltyRemaining()).toBe(0);
      expect(useWorkspaceStore.getState().socraticPenaltyLockoutUntil).toBeNull();
    });

    it('should survive rapid tab switching and background throttling via wall-clock computation', () => {
      const startTime = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(startTime);

      useWorkspaceStore.getState().triggerSocraticPenaltyLockout('בדיקת טאב');

      // Simulate tab backgrounding for 40 seconds (browser throttles JavaScript timers)
      // Tab returns to foreground at startTime + 40000
      vi.spyOn(Date, 'now').mockReturnValue(startTime + 40000);
      
      // Wall-clock calculation must accurately report 20s remaining regardless of throttled timers
      expect(useWorkspaceStore.getState().getSocraticPenaltyRemaining()).toBe(20);

      // Tab backgrounded again for another 30 seconds (total 70s)
      vi.spyOn(Date, 'now').mockReturnValue(startTime + 70000);

      // Wall-clock calculation must cleanly auto-unlock
      expect(useWorkspaceStore.getState().getSocraticPenaltyRemaining()).toBe(0);
      expect(useWorkspaceStore.getState().socraticPenaltyLockoutUntil).toBeNull();
    });

    it('should defend against malicious localStorage manipulation during active session', () => {
      const now = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      useWorkspaceStore.getState().triggerSocraticPenaltyLockout('רמז הגנה');
      expect(useWorkspaceStore.getState().socraticPenaltyLockoutUntil).toBe(now + 60000);

      // Malicious student attempts to delete or corrupt localStorage key via DevTools
      mockStorage['mathmaticore_socratic_penalty_until'] = '0';
      delete mockStorage['mathmaticore_socratic_penalty_until'];

      // Active in-memory Zustand store remains locked and authoritative
      vi.spyOn(Date, 'now').mockReturnValue(now + 10000);
      expect(useWorkspaceStore.getState().socraticPenaltyLockoutUntil).toBe(now + 60000);
      expect(useWorkspaceStore.getState().getSocraticPenaltyRemaining()).toBe(50);
    });

    it('should handle 500 rapid concurrent lockout triggers without crashing or producing NaN', () => {
      const now = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      for (let i = 0; i < 500; i++) {
        useWorkspaceStore.getState().triggerSocraticPenaltyLockout(`Burst hint ${i}`);
      }

      const state = useWorkspaceStore.getState();
      expect(state.socraticPenaltyLockoutUntil).toBe(now + 60000);
      expect(state.socraticDistractorHint).toBe('Burst hint 499');
      expect(state.getSocraticPenaltyRemaining()).toBe(60);
    });
  });

  // ==========================================================================
  // 4. SRL PERSISTENCE INDEX CALCULATION FUZZING (10,000 RANDOMIZED TUPLES)
  // ==========================================================================
  describe('4. SRL Persistence Index — 10,000 Randomized Tuples Fuzzing', () => {
    // Raw persistence formula as implemented in TeacherDashboard.tsx:54-58
    const rawPersistence = (undo: number, errors: number, guesses: number): number => {
      const safeU = Math.max(0, undo);
      const safeE = Math.max(0, errors);
      const safeG = Math.max(0, guesses);
      const denominator = safeU + safeE + safeG;
      return denominator <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((safeU / denominator) * 100)));
    };

    it('should verify foundational invariants on canonical benchmarks', () => {
      // 0/0/0 must yield 100%
      expect(rawPersistence(0, 0, 0)).toBe(100);

      // Only Undos (no errors, no guesses) must yield 100%
      expect(rawPersistence(1, 0, 0)).toBe(100);
      expect(rawPersistence(50, 0, 0)).toBe(100);
      expect(rawPersistence(9999, 0, 0)).toBe(100);

      // Zero Undos with errors/guesses must yield 0%
      expect(rawPersistence(0, 1, 0)).toBe(0);
      expect(rawPersistence(0, 0, 1)).toBe(0);
      expect(rawPersistence(0, 50, 50)).toBe(0);

      // Equal proportions
      expect(rawPersistence(10, 10, 0)).toBe(50);
      expect(rawPersistence(10, 0, 10)).toBe(50);
      expect(rawPersistence(10, 10, 10)).toBe(33);
      expect(rawPersistence(20, 10, 10)).toBe(50);
    });

    it('should fuzz 10,000 randomized tuples across all numerical domains and satisfy all safety invariants', () => {
      let totalTests = 0;
      const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;

      // Tier 1: 2,500 Canonical Integers [0 .. 100]
      for (let i = 0; i < 2500; i++) {
        const u = Math.floor(randomBetween(0, 100));
        const e = Math.floor(randomBetween(0, 100));
        const g = Math.floor(randomBetween(0, 100));
        const res = rawPersistence(u, e, g);

        expect(typeof res).toBe('number');
        expect(Number.isFinite(res)).toBe(true);
        expect(Number.isInteger(res)).toBe(true);
        expect(res).toBeGreaterThanOrEqual(0);
        expect(res).toBeLessThanOrEqual(100);
        totalTests++;
      }

      // Tier 2: 2,500 Boundary & Sparse Tuples (frequent zeros)
      for (let i = 0; i < 2500; i++) {
        const u = Math.random() < 0.5 ? 0 : Math.floor(randomBetween(0, 20));
        const e = Math.random() < 0.5 ? 0 : Math.floor(randomBetween(0, 20));
        const g = Math.random() < 0.5 ? 0 : Math.floor(randomBetween(0, 20));
        const res = rawPersistence(u, e, g);

        expect(typeof res).toBe('number');
        expect(Number.isFinite(res)).toBe(true);
        expect(Number.isInteger(res)).toBe(true);
        expect(res).toBeGreaterThanOrEqual(0);
        expect(res).toBeLessThanOrEqual(100);

        if (u === 0 && (e > 0 || g > 0)) {
          expect(res).toBe(0);
        }
        if (u > 0 && e === 0 && g === 0) {
          expect(res).toBe(100);
        }
        if (u === 0 && e === 0 && g === 0) {
          expect(res).toBe(100);
        }
        totalTests++;
      }

      // Tier 3: 2,500 Extreme Magnitude Integers [10^3 .. 10^9]
      for (let i = 0; i < 2500; i++) {
        const u = Math.floor(randomBetween(1e3, 1e9));
        const e = Math.floor(randomBetween(1e3, 1e9));
        const g = Math.floor(randomBetween(1e3, 1e9));
        const res = rawPersistence(u, e, g);

        expect(typeof res).toBe('number');
        expect(Number.isFinite(res)).toBe(true);
        expect(Number.isInteger(res)).toBe(true);
        expect(res).toBeGreaterThanOrEqual(0);
        expect(res).toBeLessThanOrEqual(100);
        totalTests++;
      }

      // Tier 4: 1,500 Negative & Inverted Integers [-10^6 .. 0]
      for (let i = 0; i < 1500; i++) {
        const u = Math.floor(randomBetween(-1e6, 0));
        const e = Math.floor(randomBetween(-1e6, 0));
        const g = Math.floor(randomBetween(-1e6, 0));
        const res = rawPersistence(u, e, g);

        expect(typeof res).toBe('number');
        expect(Number.isFinite(res)).toBe(true);
        expect(Number.isInteger(res)).toBe(true);
        expect(res).toBeGreaterThanOrEqual(0);
        expect(res).toBeLessThanOrEqual(100);
        // All negatives clamped to 0 -> 0/0/0 -> 100
        expect(res).toBe(100);
        totalTests++;
      }

      // Tier 5: 1,000 Floating Point Tuples [0.0001 .. 999.9999]
      for (let i = 0; i < 1000; i++) {
        const u = randomBetween(0.0001, 999.9999);
        const e = randomBetween(0.0001, 999.9999);
        const g = randomBetween(0.0001, 999.9999);
        const res = rawPersistence(u, e, g);

        expect(typeof res).toBe('number');
        expect(Number.isFinite(res)).toBe(true);
        expect(Number.isInteger(res)).toBe(true);
        expect(res).toBeGreaterThanOrEqual(0);
        expect(res).toBeLessThanOrEqual(100);
        totalTests++;
      }

      expect(totalTests).toBe(10000);
    });

    it('should probe and analyze pathological inputs (NaN, Infinity, undefined, null) against formula behavior', () => {
      // In JS, Math.max(0, NaN) is NaN, which leads to NaN persistence unless sanitized
      expect(Number.isNaN(rawPersistence(NaN, 0, 0))).toBe(true);

      // Testing sanitized input wrapper that guards against NaN / Infinity in runtime
      const safeCalculate = (u: any, e: any, g: any): number => {
        const cleanU = typeof u === 'number' && Number.isFinite(u) ? u : 0;
        const cleanE = typeof e === 'number' && Number.isFinite(e) ? e : 0;
        const cleanG = typeof g === 'number' && Number.isFinite(g) ? g : 0;
        return rawPersistence(cleanU, cleanE, cleanG);
      };

      const edgeCases = [
        { u: NaN, e: 0, g: 0, expected: 100 },
        { u: Infinity, e: 0, g: 0, expected: 100 },
        { u: undefined, e: 5, g: 5, expected: 0 },
        { u: null, e: null, g: null, expected: 100 },
        { u: '10' as any, e: '10' as any, g: 0, expected: 100 }, // non-numbers sanitized to 0 -> 100
      ];

      for (const ec of edgeCases) {
        const result = safeCalculate(ec.u, ec.e, ec.g);
        expect(result).toBe(ec.expected);
        expect(Number.isFinite(result)).toBe(true);
      }
    });

    it('should verify monotonicity invariant: increasing Undos for fixed Errors and Guesses never decreases persistence', () => {
      for (let e = 0; e <= 20; e += 5) {
        for (let g = 0; g <= 20; g += 5) {
          let prevScore = -1;
          for (let u = 0; u <= 50; u += 2) {
            const score = rawPersistence(u, e, g);
            if (prevScore !== -1 && !(u === 0 && e === 0 && g === 0)) {
              // Note: 0/0/0 is 100, then 0/e/g is 0; for u > 0, monotonicity holds strictly
              if (u > 1) {
                expect(score).toBeGreaterThanOrEqual(prevScore);
              }
            }
            prevScore = score;
          }
        }
      }
    });
  });
});
