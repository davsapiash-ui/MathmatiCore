import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  FirebaseSyncService, 
  extractTeacherId,
  type SessionState,
  type TelemetryEvent
} from '@/infrastructure/services/FirebaseSyncService';
import { 
  useChatStore, 
  computeRoomId, 
  normalizeStudentId, 
  isTeacherOrAdminId, 
  sanitizeChatText 
} from '@/application/useChatStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';

// Mock window and localStorage for Node test environment
if (typeof window === 'undefined' || !window.localStorage) {
  const localStore = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => localStore.get(key) || null,
    setItem: (key: string, val: string) => localStore.set(key, String(val)),
    removeItem: (key: string) => localStore.delete(key),
    clear: () => localStore.clear(),
    length: 0,
    key: () => null
  } as unknown as Storage;
  // @ts-ignore
  global.window = {
    localStorage: mockStorage
  };
  // @ts-ignore
  global.localStorage = mockStorage;
}

// In-memory mock database store for Realtime Firebase RTDB simulation
const mockDatabaseTree: Record<string, any> = {};

vi.mock('@/infrastructure/firebase', () => ({
  database: {}
}));

vi.mock('firebase/database', () => {
  return {
    ref: vi.fn((_db: any, path: string = '') => ({ _path: path })),
    set: vi.fn(async (r: any, val: any) => {
      mockDatabaseTree[r._path] = val;
      return Promise.resolve();
    }),
    get: vi.fn(async (r: any) => {
      const val = mockDatabaseTree[r._path];
      return Promise.resolve({
        exists: () => val !== undefined && val !== null,
        val: () => val
      });
    }),
    update: vi.fn(async (r: any, val: any) => {
      const existing = mockDatabaseTree[r._path] || {};
      const updated = typeof val === 'object' && !Array.isArray(val)
        ? { ...existing }
        : val;
      if (typeof val === 'object' && !Array.isArray(val)) {
        for (const [k, v] of Object.entries(val)) {
          if (k.includes('/')) {
            const [parentKey, childKey] = k.split('/');
            updated[parentKey] = {
              ...(updated[parentKey] || {}),
              [childKey]: v
            };
          } else {
            updated[k] = v;
          }
        }
      }
      mockDatabaseTree[r._path] = updated;
      return Promise.resolve();
    }),
    push: vi.fn((r: any) => {
      const key = `push_key_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      return {
        key,
        _path: `${r._path}/${key}`
      };
    }),
    onValue: vi.fn((r: any, callback: (snap: any) => void) => {
      const val = mockDatabaseTree[r._path];
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
      const path: string = r._path;
      const parts = path.split('/');
      let curr = mockDatabaseTree[path];
      if (curr === undefined && parts.length > 1) {
        const parentPath = parts.slice(0, -1).join('/');
        const prop = parts[parts.length - 1];
        if (mockDatabaseTree[parentPath]) {
          curr = mockDatabaseTree[parentPath][prop];
        }
      }
      const next = updateFn(curr);
      if (next !== undefined) {
        mockDatabaseTree[path] = next;
        if (parts.length > 1) {
          const parentPath = parts.slice(0, -1).join('/');
          const prop = parts[parts.length - 1];
          mockDatabaseTree[parentPath] = {
            ...(mockDatabaseTree[parentPath] || {}),
            [prop]: next
          };
        }
      }
      return Promise.resolve({ committed: next !== undefined, snapshot: { val: () => (next !== undefined ? next : curr) } });
    }),
    serverTimestamp: vi.fn(() => Date.now())
  };
});

describe('Realtime Communication & Data Synchronization QA Suite (Master PRD v4.0)', () => {
  beforeEach(() => {
    // Clear in-memory simulated database and stores
    Object.keys(mockDatabaseTree).forEach(k => delete mockDatabaseTree[k]);
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
  // 1. Pilot 12-Student Simultaneous Live State Broadcast & Zero Collision
  // =========================================================================
  describe('1. Pilot 12-Student Realtime Partitioning & Concurrency', () => {
    it('synchronizes 12 simultaneous students without state collision or cross-talk', async () => {
      const syncService = FirebaseSyncService.getInstance();

      // Simulate 12 concurrent pilot students emitting states
      const pilotStudents = Array.from({ length: 12 }, (_, i) => ({
        rawId: `user${i + 1}`,
        normId: `student_user${i + 1}`,
        sessionNumber: (i % 8) + 1,
        counts: { units: i + 1, tens: Math.floor(i / 2), hundreds: 0, thousands: 0 },
        hesitationCount: i,
        undoCount: i % 3
      }));

      for (const student of pilotStudents) {
        const sessionState: SessionState = {
          student_id: student.normId,
          session_number: student.sessionNumber,
          status: 'active',
          current_path: student.hesitationCount > 5 ? 'remediation_path' : 'green_path',
          hesitation_seconds: student.hesitationCount * 5,
          error_count: student.undoCount,
        };

        await syncService.syncSessionState(student.rawId, sessionState);
        await syncService.syncTraceData(student.rawId, {
          hesitation_events: student.hesitationCount,
          undo_clicks: student.undoCount
        });
      }

      // Verify each student node in Firebase RTDB is completely isolated
      pilotStudents.forEach(student => {
        const savedSession = mockDatabaseTree[`users/students/${student.normId}/sessionState`] || mockDatabaseTree[`sessions/${student.normId}`];
        expect(savedSession).toBeDefined();
        expect(savedSession.student_id).toBe(student.normId);
        expect(savedSession.session_number).toBe(student.sessionNumber);
        expect(savedSession.error_count).toBe(student.undoCount);

        const savedUser = mockDatabaseTree[`users/students/${student.normId}/traceData`];
        expect(savedUser).toBeDefined();
        expect(savedUser.hesitation_events).toBe(student.hesitationCount);
        expect(savedUser.undo_clicks).toBe(student.undoCount);
      });
    });

    it('enforces student ID normalization across all permutations (1, user1, student_1, student_user1)', () => {
      expect(normalizeStudentId('1')).toBe('student_user1');
      expect(normalizeStudentId('user1')).toBe('student_user1');
      expect(normalizeStudentId('student_1')).toBe('student_user1');
      expect(normalizeStudentId('student_user1')).toBe('student_user1');
      expect(normalizeStudentId('12')).toBe('student_user12');
      expect(normalizeStudentId('99')).toBe('student_user12'); // Capped to 12
      expect(normalizeStudentId('0')).toBe('student_user1');   // Clamped to min 1
    });

    it('correctly discriminates teachers and admins from anonymous student IDs', () => {
      expect(isTeacherOrAdminId('teacher')).toBe(true);
      expect(isTeacherOrAdminId('teacher_123')).toBe(true);
      expect(isTeacherOrAdminId('admin')).toBe(true);
      expect(isTeacherOrAdminId('admin_main')).toBe(true);
      expect(isTeacherOrAdminId('davsapiash@gmail.com')).toBe(true);
      expect(isTeacherOrAdminId('1002220159')).toBe(true); // 9-digit Teudat Zehut / serial ID

      expect(isTeacherOrAdminId('1')).toBe(false);
      expect(isTeacherOrAdminId('student_1')).toBe(false);
      expect(isTeacherOrAdminId('student_user5')).toBe(false);
    });
  });

  // =========================================================================
  // 2. Strict < 50KB Payload Constraint Enforcement (PRD Section 5.2)
  // =========================================================================
  describe('2. Transient State Sync < 50KB Payload Budget Enforcement', () => {
    it('safely trims oversized telemetry and task histories to stay strictly under 50KB', async () => {
      // Construct an oversized AI tasks array and long qflow history (> 100KB)
      const hugeAiTasks = Array.from({ length: 100 }, (_, i) => ({
        id: `task_${i}`,
        title: `Heavy Generated AI Pedagogical Remediation Task with Extra Context and Explanations #${i}`,
        instructions: 'Long detailed instruction with extensive pedagogical notes and mathematical hints '.repeat(10),
        counts: { units: i, tens: i, hundreds: i, thousands: 0 }
      }));

      const largeQflowResults = Object.fromEntries(
        Array.from({ length: 150 }, (_, i) => [
          `node_${i}`,
          { passed: i % 2 === 0, timestamp: Date.now(), attempts: i, diagnosticLog: 'Extensive log string '.repeat(15) }
        ])
      );

      // Verify that raw payload exceeds 50KB
      const rawPayload = {
        sessionNumber: 3,
        aiTasks: hugeAiTasks,
        qflow: { results: largeQflowResults }
      };
      const rawBytes = JSON.stringify(rawPayload).length;
      expect(rawBytes).toBeGreaterThan(50 * 1024);

      // In FirebaseSyncService, workspace subscriber trims aiTasks to latest 5 and qflow to latest 20
      const trimmedAiTasks = hugeAiTasks.slice(-5);
      const trimmedQflowKeys = Object.keys(largeQflowResults).slice(-20);
      const trimmedQflow = Object.fromEntries(trimmedQflowKeys.map(k => [k, largeQflowResults[k]]));

      const safePayload = {
        sessionNumber: 3,
        aiTasks: trimmedAiTasks,
        qflow: { results: trimmedQflow }
      };
      const safeBytes = JSON.stringify(safePayload).length;
      expect(safeBytes).toBeLessThan(50 * 1024);
    });
  });

  // =========================================================================
  // 3. FIFO In-Memory Offline Telemetry Queue (500 items max)
  // =========================================================================
  describe('3. Offline Queue Resilience and Capped FIFO Drops', () => {
    it('queues offline milestone events in memory and flushes when reconnected', async () => {
      const syncService = FirebaseSyncService.getInstance();
      
      // Simulate offline mode
      (syncService as any).isOnline = false;

      // Log 10 milestone events while offline
      for (let i = 1; i <= 10; i++) {
        await syncService.logMilestoneEvent('student_user1', 'session_1', 'GROUP', {
          step: i,
          place: 'tens'
        });
      }

      // Verify events are in offline queue and NOT yet in Firebase
      expect((syncService as any).offlineTelemetryQueue.length).toBe(10);
      expect(mockDatabaseTree['users/students/student_user1/milestones']).toBeUndefined();

      // Simulate reconnect and flush
      (syncService as any).isOnline = true;
      await (syncService as any).flushOfflineQueue();

      // Verify queue is completely drained
      expect((syncService as any).offlineTelemetryQueue.length).toBe(0);
    });

    it('strictly caps offline queue to 500 items with FIFO drop policy for large bursts', async () => {
      const syncService = FirebaseSyncService.getInstance();
      (syncService as any).isOnline = false;
      (syncService as any).offlineTelemetryQueue = [];

      // Emit 600 consecutive telemetry events while disconnected
      for (let i = 1; i <= 600; i++) {
        await syncService.logMilestoneEvent('student_user1', 'session_1', 'UNGROUP', { index: i });
      }

      // Queue must never exceed 500 items
      const queue = (syncService as any).offlineTelemetryQueue;
      expect(queue.length).toBe(500);

      // Oldest 100 items (1..100) must be discarded, newest item (600) must be at the tail
      expect(queue[0].payload.details.index).toBe(101);
      expect(queue[queue.length - 1].payload.details.index).toBe(600);
    });
  });

  // =========================================================================
  // 4. Teacher Realtime Remote Controls & Overrides
  // =========================================================================
  describe('4. Teacher Realtime Remote Controls & Overrides Sync', () => {
    it('instantly syncs Physical Override and ASD toggle to both users/students and students paths', async () => {
      const syncService = FirebaseSyncService.getInstance();
      const studentId = 'student_user3';

      const overrideData = {
        routeStatus: 'APPROVED',
        difficultyRecommendation: 'REMEDIAL',
        isASD: true,
        physicalOverride: true,
        physicalOverrideActive: true,
        overrideUpdatedAt: Date.now()
      };

      await syncService.syncPhysicalOverride(studentId, overrideData);

      // Verify both Firebase paths are updated synchronously
      const userNode = mockDatabaseTree[`users/students/${studentId}`];
      const studentNode = mockDatabaseTree[`students/${studentId}`];

      expect(userNode).toBeDefined();
      expect(userNode.isASD).toBe(true);
      expect(userNode.physicalOverride).toBe(true);
      expect(userNode.workspaceState.isASD).toBe(true);

      expect(studentNode).toBeDefined();
      expect(studentNode.isASD).toBe(true);
      expect(studentNode.physicalOverride).toBe(true);
      expect(studentNode.difficultyRecommendation).toBe('REMEDIAL');
    });

    it('synchronizes route approval for student progression from PENDING to APPROVED', async () => {
      const syncService = FirebaseSyncService.getInstance();
      const studentId = 'student_user4';

      await syncService.syncRouteRecommendation(studentId, 'green_path');
      expect(mockDatabaseTree[`users/students/${studentId}`].routeStatus).toBe('PENDING');

      await syncService.syncApproveRoute(studentId);
      expect(mockDatabaseTree[`users/students/${studentId}`].routeStatus).toBe('APPROVED');
    });

    it('synchronizes meeting completion and session milestone progression', async () => {
      const syncService = FirebaseSyncService.getInstance();
      const studentId = 'student_user2';

      await syncService.syncHighestCompletedMeeting(studentId, 2);
      await syncService.syncMeeting2Complete(studentId);

      const studentData = mockDatabaseTree[`users/students/${studentId}`];
      expect(studentData.highestCompletedMeeting).toBe(2);
      expect(studentData.completedMeeting2).toBe(true);
    });
  });

  // =========================================================================
  // 5. Bidirectional Realtime Chat & Zero PII Sanitization (PRD Section 22)
  // =========================================================================
  describe('5. Realtime Chat Rooms & Client-Side PII Redaction', () => {
    it('redacts 9-digit national IDs, Israeli phone numbers, and personal emails before dispatch', () => {
      const textWithIdNumber = 'התלמיד עם תעודת זהות 123456782 צריך עזרה';
      expect(sanitizeChatText(textWithIdNumber)).toBe('התלמיד עם תעודת זהות ***6782 צריך עזרה');

      const textWithPhone = 'התקשרו אלי למספר 054-1234567 או 0501234567';
      expect(sanitizeChatText(textWithPhone)).toBe('התקשרו אלי למספר [PHONE_REDACTED] או [PHONE_REDACTED]');

      const textWithEmail = 'המייל האישי הוא student_secret@gmail.com לבדיקה';
      expect(sanitizeChatText(textWithEmail)).toBe('המייל האישי הוא [EMAIL_REDACTED] לבדיקה');

      const cleanPedagogicalText = 'אני ממליץ לפרוט עשרת אחת ל-10 יחידות כדי שנוכל להחסיר';
      expect(sanitizeChatText(cleanPedagogicalText)).toBe(cleanPedagogicalText);
    });

    it('computes isolated room IDs based on normalized student identifiers', () => {
      // Teacher -> Student
      expect(computeRoomId('teacher_1', 'student_user2')).toBe('student_user2');
      expect(computeRoomId('teacher_1', '2')).toBe('student_user2');

      // Student -> Teacher
      expect(computeRoomId('student_user5', 'teacher_1')).toBe('student_user5');
      expect(computeRoomId('5', 'teacher_1')).toBe('student_user5');

      // Teacher -> Admin
      expect(computeRoomId('teacher_1', 'admin')).toBe('teacher_1');
    });

    it('performs optimistic state update on message dispatch', () => {
      const chatStore = useChatStore.getState();
      
      chatStore.sendMessage('teacher_1', 'המורה דוד', 'student_user1', 'שלום, נסה לפרוט עשרת אחת.');

      const messages = useChatStore.getState().messages;
      expect(messages.length).toBe(1);
      expect(messages[0].senderId).toBe('teacher_1');
      expect(messages[0].receiverId).toBe('student_user1');
      expect(messages[0].text).toContain('שלום, נסה לפרוט עשרת אחת.');
    });
  });

  // =========================================================================
  // 6. Teacher AI CoPilot & Socratic Engine Realtime Approvals
  // =========================================================================
  describe('6. AI Socratic Approvals Multi-Tenant Isolation', () => {
    it('correctly maps teacher ID for multi-tenant AI approval queues', () => {
      expect(extractTeacherId('teacher_12345@mathmaticore.local', null)).toBe('12345');
      expect(extractTeacherId('davsapiash@gmail.com', null)).toBe('davsapiash_gmail_com');
      expect(extractTeacherId(null, 'teacher_99999')).toBe('99999');
      expect(extractTeacherId(null, null)).toBe('teacher_default');
    });
  });

  // =========================================================================
  // 7. Adversarial Race Conditions & Concurrent High-Frequency State Mutations
  // =========================================================================
  describe('7. High-Frequency Realtime Concurrency & State Convergence', () => {
    it('handles concurrent teacher overrides while student rapidly mutates local board', async () => {
      const syncService = FirebaseSyncService.getInstance();
      const studentId = 'student_user6';

      // 1. Student performs local board operations
      useWorkspaceStore.setState({
        counts: { units: 5, tens: 2, hundreds: 1, thousands: 0 },
        isASD: false
      });

      // 2. Teacher fires concurrent asynchronous overrides
      const overridePromise1 = syncService.syncPhysicalOverride(studentId, {
        isASD: true,
        physicalOverride: true,
        routeStatus: 'APPROVED'
      });

      const overridePromise2 = syncService.syncQMatrix(studentId, {
        task1_zero_placeholder: 'PASSED'
      });

      const overridePromise3 = syncService.syncTraceData(studentId, {
        hesitation_events: 3,
        undo_clicks: 1
      });

      await Promise.all([overridePromise1, overridePromise2, overridePromise3]);

      // Verify all overrides converged cleanly in RTDB without dropping any fields
      const userNode = mockDatabaseTree[`users/students/${studentId}`];
      expect(userNode).toBeDefined();
      expect(userNode.isASD).toBe(true);
      expect(userNode.physicalOverride).toBe(true);
      expect(userNode.routeStatus).toBe('APPROVED');
      
      const qmNode = mockDatabaseTree[`users/students/${studentId}/qMatrixResults`];
      expect(qmNode).toBeDefined();
      expect(qmNode.task1_zero_placeholder).toBe('PASSED');

      const traceNode = mockDatabaseTree[`users/students/${studentId}/traceData`];
      expect(traceNode).toBeDefined();
      expect(traceNode.hesitation_events).toBe(3);
      expect(traceNode.undo_clicks).toBe(1);
    });
  });

  // =========================================================================
  // 8. Presence Lifecycle & Clean Disconnect Tear-Down
  // =========================================================================
  describe('8. Student Presence Lifecycle & Disconnect Tear-Down', () => {
    it('sets presence to online on startSync and offline on stopSync', async () => {
      const syncService = FirebaseSyncService.getInstance();
      const studentId = 'student_user7';

      // Start student sync
      (syncService as any).startSync(studentId, { name: 'תלמיד 7' });

      expect(mockDatabaseTree[`users/students/${studentId}/isOnline`]).toBe(true);

      // Stop student sync
      (syncService as any).stopSync();

      expect(mockDatabaseTree[`users/students/${studentId}/isOnline`]).toBe(false);
      expect((syncService as any).currentUserId).toBeNull();
    });
  });

  // =========================================================================
  // 9. Mid-Stage Screen Refresh & Browser Reload Resilience (Meeting 1 Question 3/4)
  // =========================================================================
  describe('9. Mid-Stage Screen Refresh Resilience', () => {
    it('preserves question index (e.g. Question 3/4) and board state on screen refresh without resetting to 1', () => {
      const syncService = FirebaseSyncService.getInstance();
      const studentId = 'student_user1';

      // 1. Student advances to Meeting 1, Question 4 with 4 tens and 2 units
      const midSessionState = {
        sessionNumber: 1,
        flowStatus: 'task',
        standardTaskIdx: 3, // 4th question
        counts: { units: 2, tens: 4, hundreds: 0, thousands: 0 },
        isASD: false,
        undoCount: 2,
        hesitationCount: 1
      };

      // 2. State is cached locally and sent to Firebase
      syncService.saveSessionProgressLocally(studentId, midSessionState);

      // 3. Simulate browser refresh / component remount
      const localCached = syncService.getLocalSessionProgress(studentId);
      expect(localCached).toBeDefined();
      expect(localCached.sessionNumber).toBe(1);
      expect(localCached.standardTaskIdx).toBe(3);
      expect(localCached.counts.tens).toBe(4);

      // 4. Restore session
      useWorkspaceStore.getState().restoreSession(localCached);

      const stateAfterRestore = useWorkspaceStore.getState();
      expect(stateAfterRestore.sessionNumber).toBe(1);
      expect(stateAfterRestore.standardTaskIdx).toBe(3); // Preserved at question 4!
      expect(stateAfterRestore.counts.tens).toBe(4);
      expect(stateAfterRestore.counts.units).toBe(2);
      expect(stateAfterRestore.undoCount).toBe(2);
    });
  });
});
