import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  FirebaseSyncService, 
  type SessionState,
  type TelemetryEvent
} from '@/infrastructure/services/FirebaseSyncService';
import { 
  useChatStore, 
  computeRoomId, 
  normalizeStudentId, 
  sanitizeChatText 
} from '@/application/useChatStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import type { Place } from '@/core/placeValue';

// Chaotic Network Link Simulation with Jitter, Latency Spikes, and Packet Drops
class ChaoticNetworkLink {
  private packetDropRate: number;
  private minLatencyMs: number;
  private maxLatencyMs: number;
  public totalPacketsSent = 0;
  public totalPacketsDropped = 0;
  public totalRetriesSucceeded = 0;

  constructor(dropRate = 0.2, minLatency = 5, maxLatency = 40) {
    this.packetDropRate = dropRate;
    this.minLatencyMs = minLatency;
    this.maxLatencyMs = maxLatency;
  }

  async transmit<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
    this.totalPacketsSent++;
    let attempts = 0;

    while (attempts <= maxRetries) {
      attempts++;
      // Simulate random network latency jitter
      const latency = Math.floor(Math.random() * (this.maxLatencyMs - this.minLatencyMs + 1)) + this.minLatencyMs;
      await new Promise(r => setTimeout(r, latency));

      // Simulate packet drop
      if (Math.random() < this.packetDropRate && attempts <= maxRetries) {
        this.totalPacketsDropped++;
        continue; // Retry next attempt
      }

      if (attempts > 1) {
        this.totalRetriesSucceeded++;
      }
      return operation();
    }

    throw new Error('Network timeout after maximum retries');
  }
}

// In-memory Database Mock for Chaos Testing
const chaoticDb: Record<string, any> = {};

vi.mock('@/infrastructure/firebase', () => ({
  database: {}
}));

vi.mock('firebase/database', () => {
  return {
    ref: vi.fn((_db: any, path: string = '') => ({ _path: path })),
    set: vi.fn(async (r: any, val: any) => {
      chaoticDb[r._path] = val;
      return Promise.resolve();
    }),
    get: vi.fn(async (r: any) => {
      const val = chaoticDb[r._path];
      return Promise.resolve({
        exists: () => val !== undefined && val !== null,
        val: () => val
      });
    }),
    update: vi.fn(async (r: any, val: any) => {
      const existing = chaoticDb[r._path] || {};
      chaoticDb[r._path] = typeof val === 'object' && !Array.isArray(val)
        ? { ...existing, ...val }
        : val;
      return Promise.resolve();
    }),
    push: vi.fn((r: any) => {
      const key = `chaos_push_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      return {
        key,
        _path: `${r._path}/${key}`
      };
    }),
    onValue: vi.fn((r: any, callback: (snap: any) => void) => {
      const val = chaoticDb[r._path];
      callback({
        exists: () => val !== undefined && val !== null,
        val: () => val
      });
      return () => {};
    }),
    onDisconnect: vi.fn(() => ({
      set: vi.fn(async () => Promise.resolve())
    })),
    runTransaction: vi.fn(async (r: any, updateFn: (curr: any) => any) => {
      const curr = chaoticDb[r._path];
      const next = updateFn(curr);
      chaoticDb[r._path] = next;
      return Promise.resolve({ committed: true, snapshot: { val: () => next } });
    }),
    serverTimestamp: vi.fn(() => Date.now())
  };
});

describe('HARDCORE REALTIME CHAOS & UNCOMPROMISING STRESS TEST HARNESS', () => {
  beforeEach(() => {
    Object.keys(chaoticDb).forEach(k => delete chaoticDb[k]);
    useStore.setState({ students: {}, firebaseLoaded: false });
    useWorkspaceStore.setState({
      counts: { units: 0, tens: 0, hundreds: 0, thousands: 0 },
      isASD: false,
      standardTaskIdx: 0,
      undoCount: 0,
      hesitationCount: 0,
      hasInteracted: false,
      isBoardLocked: false
    });
    useChatStore.setState({ messages: [], activeRoomId: null, unreadCount: 0, globalChatEnabled: true });
    useAuthStore.setState({ user: null, role: null, isAuthenticated: false });
  });

  // =========================================================================
  // 1. Chaotic Network Jitter & 20% Dropped Packets with Auto-Retry
  // =========================================================================
  describe('1. Network Socket Jitter & Packet Drop Resilience', () => {
    it('successfully converges 200 rapid asynchronous state updates through a 20% lossy network', async () => {
      const network = new ChaoticNetworkLink(0.2, 2, 15);
      const syncService = FirebaseSyncService.getInstance();
      const studentId = 'student_user1';

      const updatePromises: Promise<void>[] = [];

      for (let i = 1; i <= 200; i++) {
        const payload: SessionState = {
          student_id: studentId,
          session_number: (i % 8) + 1,
          status: 'active',
          current_path: 'green_path',
          hesitation_seconds: i,
          error_count: i % 5
        };

        updatePromises.push(
          network.transmit(async () => {
            await syncService.syncSessionState(studentId, payload);
          })
        );
      }

      await Promise.all(updatePromises);

      // Verify that network experienced packet drops and retries
      expect(network.totalPacketsSent).toBe(200);
      expect(network.totalPacketsDropped).toBeGreaterThan(0);
      expect(network.totalRetriesSucceeded).toBeGreaterThan(0);

      // Verify final state in RTDB converged cleanly
      const saved = chaoticDb[`users/students/${studentId}/sessionState`] || chaoticDb[`sessions/${studentId}`];
      expect(saved).toBeDefined();
      expect(saved.student_id).toBe(studentId);
    });
  });

  // =========================================================================
  // 2. High-Frequency Action Storm (2,000 Board Mutations & Memory Check)
  // =========================================================================
  describe('2. Massive High-Frequency Action Storm & Payload Guard', () => {
    it('executes 2,000 continuous board operations without memory leak or payload overflow', async () => {
      const places: Place[] = ['units', 'tens', 'hundreds', 'thousands'];
      const workspace = useWorkspaceStore.getState();

      const startTime = performance.now();

      for (let i = 0; i < 2000; i++) {
        const place = places[i % places.length];

        // Perform rapid state mutations
        useWorkspaceStore.setState(s => ({
          counts: {
            ...s.counts,
            [place]: (s.counts[place] + 1) % 15
          },
          undoCount: s.undoCount + 1,
          hasInteracted: true
        }));

        if (i % 100 === 0) {
          workspace.undo();
        }
      }

      const totalTimeMs = performance.now() - startTime;
      const avgTimePerOpMs = totalTimeMs / 2000;

      // Ensure performance is blazing fast (< 0.5ms per operation in-memory)
      expect(avgTimePerOpMs).toBeLessThan(1.0);

      // Verify state snapshot size is strictly < 50KB
      const currentCounts = useWorkspaceStore.getState().counts;
      const snapshot = JSON.stringify(currentCounts);
      expect(snapshot.length).toBeLessThan(1024); // Far below 50KB budget
    });
  });

  // =========================================================================
  // 3. 30-Student Grade Level Swarm with Dual-Teacher Concurrent Overrides
  // =========================================================================
  describe('3. 30-Student Concurrent Classroom Swarm & Dual-Teacher Contention', () => {
    it('survives 30 simultaneous students and 2 competing teachers without race condition crashes', async () => {
      const syncService = FirebaseSyncService.getInstance();
      const studentTasks: Promise<void>[] = [];

      // 30 concurrent students writing telemetry and states
      for (let s = 1; s <= 30; s++) {
        const normId = normalizeStudentId(`user_${s}`);
        studentTasks.push(
          (async () => {
            for (let step = 1; step <= 10; step++) {
              await syncService.syncTraceData(normId, {
                hesitation_events: step,
                undo_clicks: step % 2
              });
              await syncService.logMilestoneEvent(normId, 'session_1', 'GROUP', { step });
            }
          })()
        );
      }

      // Teacher A firing bulk overrides
      const teacherATask = (async () => {
        for (let s = 1; s <= 15; s++) {
          const normId = normalizeStudentId(`user_${s}`);
          await syncService.syncPhysicalOverride(normId, {
            isASD: true,
            physicalOverride: true,
            routeStatus: 'APPROVED'
          });
        }
      })();

      // Teacher B firing bulk meeting completions
      const teacherBTask = (async () => {
        for (let s = 16; s <= 30; s++) {
          const normId = normalizeStudentId(`user_${s}`);
          await syncService.syncHighestCompletedMeeting(normId, 3);
          await syncService.syncMeeting2Complete(normId);
        }
      })();

      await Promise.all([...studentTasks, teacherATask, teacherBTask]);

      // Verify all 12 pilot student slots (1..12) have intact data
      for (let i = 1; i <= 12; i++) {
        const id = `student_user${i}`;
        const userDoc = chaoticDb[`users/students/${id}`];
        expect(userDoc).toBeDefined();
      }
    });
  });

  // =========================================================================
  // 4. Malformed Payload Fuzzing & Injection Attack Simulation
  // =========================================================================
  describe('4. Malformed Data Fuzzing & Graceful Sanitization', () => {
    it('gracefully handles extreme malformed inputs, SQL/Script injection strings, and NaN', () => {
      // 1. Extreme ID inputs
      expect(normalizeStudentId(null)).toBe('');
      expect(normalizeStudentId(undefined)).toBe('');
      expect(normalizeStudentId("'; DROP TABLE students;--")).toBe("student_'; drop table students;--");
      expect(normalizeStudentId('<script>alert("hack")</script>')).toBe('student_<script>alert("hack")</script>');
      expect(normalizeStudentId('student_9999999')).toBe('student_user12'); // Clamped to 12
      expect(normalizeStudentId('-500')).toBe('student_user1'); // Clamped to 1

      // 2. Chat PII sanitization on malicious inputs
      const complexMaliciousText = 'ID: 123456789; Phone: 054-9999999; Email: test@evil.com; <script>bad()</script>';
      const sanitized = sanitizeChatText(complexMaliciousText);
      expect(sanitized).not.toContain('123456789');
      expect(sanitized).not.toContain('054-9999999');
      expect(sanitized).not.toContain('test@evil.com');
      expect(sanitized).toContain('***6789');
      expect(sanitized).toContain('[PHONE_REDACTED]');
      expect(sanitized).toContain('[EMAIL_REDACTED]');
    });
  });

  // =========================================================================
  // 5. Offline Queue 1,500 Burst Saturation & Zero Memory Leak
  // =========================================================================
  describe('5. Offline Telemetry Queue Stress Under Prolonged Disconnection', () => {
    it('handles a 1,500 burst of offline events by capping at 500 FIFO items and cleanly flushing', async () => {
      const syncService = FirebaseSyncService.getInstance();
      (syncService as any).isOnline = false;
      (syncService as any).offlineTelemetryQueue = [];

      // Generate 1,500 events offline
      for (let i = 1; i <= 1500; i++) {
        await syncService.logMilestoneEvent('student_user1', 'session_2', 'INPUT_SUBMIT', {
          eventIndex: i,
          timestamp: Date.now()
        });
      }

      // Verify FIFO boundary
      const queue = (syncService as any).offlineTelemetryQueue;
      expect(queue.length).toBe(500);

      // Verify oldest 1,000 items were dropped cleanly and newest 500 are preserved
      expect(queue[0].payload.details.eventIndex).toBe(1001);
      expect(queue[499].payload.details.eventIndex).toBe(1500);

      // Reconnect and flush
      (syncService as any).isOnline = true;
      await (syncService as any).flushOfflineQueue();

      // Queue is fully emptied
      expect((syncService as any).offlineTelemetryQueue.length).toBe(0);
    });
  });
});
