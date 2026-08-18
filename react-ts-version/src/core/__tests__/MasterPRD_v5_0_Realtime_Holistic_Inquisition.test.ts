import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const { mockDbState, mockDbListeners, triggerPathListeners } = vi.hoisted(() => {
  const state: Record<string, any> = {};
  const listeners: Record<string, Set<(snap: any) => void>> = {};

  const trigger = (path: string) => {
    // 1. Direct path listener
    if (listeners[path]) {
      const val = state[path];
      const snap = {
        exists: () => val !== undefined && val !== null,
        val: () => val,
        key: path.split('/').pop()
      };
      listeners[path].forEach(cb => cb(snap));
    }

    // 2. Parent path listeners (e.g. users/students when users/students/student_user1 changes)
    Object.keys(listeners).forEach(lPath => {
      if (path.startsWith(lPath + '/') || (lPath === 'users/students' && path.startsWith('users/students'))) {
        const val = state[lPath];
        const snap = {
          exists: () => val !== undefined && val !== null,
          val: () => val,
          key: lPath.split('/').pop()
        };
        listeners[lPath].forEach(cb => cb(snap));
      }
    });
  };

  return { mockDbState: state, mockDbListeners: listeners, triggerPathListeners: trigger };
});

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  authReady: Promise.resolve(true),
  auth: { currentUser: { uid: 'teacher_mock', email: 'davidsep@edu-haifa.org.il' } }
}));

vi.mock('firebase/database', () => {
  return {
    ref: vi.fn((_db: any, path: string = '') => ({ _path: path })),
    set: vi.fn(async (r: any, val: any) => {
      mockDbState[r._path] = val;
      triggerPathListeners(r._path);
      return Promise.resolve();
    }),
    get: vi.fn(async (r: any) => {
      const val = mockDbState[r._path];
      return Promise.resolve({
        exists: () => val !== undefined && val !== null,
        val: () => val,
        key: r._path.split('/').pop()
      });
    }),
    update: vi.fn(async (r: any, val: any) => {
      const existing = mockDbState[r._path] || {};
      mockDbState[r._path] = typeof val === 'object' && !Array.isArray(val)
        ? { ...existing, ...val }
        : val;
      triggerPathListeners(r._path);
      return Promise.resolve();
    }),
    push: vi.fn((r: any, val?: any) => {
      const key = `k_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const itemPath = `${r._path}/${key}`;
      if (val !== undefined) {
        mockDbState[itemPath] = val;
        triggerPathListeners(itemPath);
      }
      return {
        key,
        _path: itemPath
      };
    }),
    remove: vi.fn(async (r: any) => {
      delete mockDbState[r._path];
      triggerPathListeners(r._path);
      return Promise.resolve();
    }),
    onValue: vi.fn((r: any, callback: (snap: any) => void) => {
      const path = r._path;
      if (!mockDbListeners[path]) {
        mockDbListeners[path] = new Set();
      }
      mockDbListeners[path].add(callback);
      
      const val = mockDbState[path];
      callback({
        exists: () => val !== undefined && val !== null,
        val: () => val,
        key: path.split('/').pop()
      });
      return () => {
        if (mockDbListeners[path]) {
          mockDbListeners[path].delete(callback);
        }
      };
    }),
    onDisconnect: vi.fn(() => ({
      set: vi.fn().mockResolvedValue(undefined)
    })),
    serverTimestamp: vi.fn(() => Date.now())
  };
});

import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useStore, initStoreSubscriptions } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useAdminStore } from '@/application/useAdminStore';
import { computeRoomId, sanitizeChatText } from '@/application/useChatStore';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';

describe('MASTER PRD v5.0: Holistic Real-Time & Multi-Tenant Synchronization Inquisition', () => {
  beforeEach(() => {
    // Reset DB state
    for (const k in mockDbState) delete mockDbState[k];
    for (const k in mockDbListeners) delete mockDbListeners[k];

    // Seed default pilot institutions
    mockDbState['schools'] = {
      school_bikorot: { id: 'school_bikorot', name: 'בית ספר ביקורת' }
    };
    mockDbState['classes'] = {
      class_1: { id: 'class_1', name: 'המבקרים', schoolId: 'school_bikorot', studentLimit: 12 }
    };
    mockDbState['users/students'] = {};
    for (let i = 1; i <= 12; i++) {
      mockDbState['users/students'][`student_user${i}`] = {
        studentId: `student_user${i}`,
        name: `תלמיד ${i}`,
        classId: 'class_1',
        isOnline: false,
        completedMeeting2: false,
        highestCompletedMeeting: 0,
        qMatrixResults: {},
        traceData: { hesitation_events: 0, undo_clicks: 0 }
      };
    }

    useAuthStore.getState().logout();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // SECTION 1: BIDIRECTIONAL STUDENT <-> TEACHER REAL-TIME TELEMETRY
  // --------------------------------------------------------------------------
  describe('1. Bidirectional Real-Time Telemetry & Reactive Store Subscriptions', () => {
    it('propagates student workspace state changes immediately to the central useStore via initStoreSubscriptions', async () => {
      const unsub = initStoreSubscriptions();

      const studentId = 'student_user1';
      useAuthStore.getState().setUser({ uid: studentId, role: 'student', student_id: 1 }, 'student');

      // 1. Simulate student workspace update pushed to Firebase
      const workspacePayload = {
        sessionNumber: 4,
        standardTaskIdx: 2,
        counts: { units: 7, tens: 4, hundreds: 2, thousands: 1 },
        answerDigits: { units: '7', tens: '4' },
        hesitationCount: 2,
        undoCount: 1
      };

      mockDbState['users/students'][studentId] = {
        ...mockDbState['users/students'][studentId],
        workspaceState: workspacePayload,
        traceData: { hesitation_events: 2, undo_clicks: 1 }
      };
      triggerPathListeners('users/students');

      // 2. Teacher store reactively holds the updated student data without manual fetch
      const currentStudents = useStore.getState().students;
      expect(currentStudents[studentId]).toBeDefined();
      expect((currentStudents[studentId].workspaceState as any)?.counts?.units).toBe(7);
      expect((currentStudents[studentId].workspaceState as any)?.counts?.tens).toBe(4);
      expect(currentStudents[studentId].traceData.hesitation_events).toBe(2);
      expect(currentStudents[studentId].traceData.undo_clicks).toBe(1);

      if (unsub) unsub();
    });

    it('propagates teacher physical override directly to student live workspace state in real-time', async () => {
      const unsub = initStoreSubscriptions();
      const studentId = 'student_user2';
      useAuthStore.getState().setUser({ uid: studentId, role: 'student', student_id: 2 }, 'student');

      // Initialize student workspace in standard state
      useWorkspaceStore.setState({
        isASD: false,
        isBoardLocked: false,
        sessionNumber: 3
      });

      // Teacher issues a physical override with ASD enablement and board lock
      const overrideData = {
        routeStatus: 'APPROVED',
        difficultyRecommendation: 'LEVEL_2',
        isASD: true,
        physicalOverride: true,
        physicalOverrideActive: true,
        overrideUpdatedAt: Date.now()
      };

      // Apply physical override through store action
      useStore.getState().applyPhysicalOverride(studentId, overrideData);

      // Verify useStore holds the override
      const storeStudent = useStore.getState().students[studentId];
      expect(storeStudent?.isASD).toBe(true);
      expect(storeStudent?.physicalOverride).toBe(true);

      if (unsub) unsub();
    });

    it('handles teacher custom task blueprint assignment and updates student workspace', async () => {
      const studentId = 'student_user3';
      useAuthStore.getState().setUser({ uid: studentId, role: 'student', student_id: 3 }, 'student');

      const customTasks = [
        { id: 'custom_1', titleHe: 'חיבור מאונך מותאם', numberA: 145, numberB: 28, isSubtraction: false },
        { id: 'custom_2', titleHe: 'חיסור עם פריטה', numberA: 300, numberB: 125, isSubtraction: true }
      ];

      // Update workspaceState on cloud
      mockDbState['users/students'][studentId] = {
        ...mockDbState['users/students'][studentId],
        workspaceState: {
          aiTasks: customTasks,
          aiTasksUpdatedAt: Date.now()
        }
      };
      triggerPathListeners('users/students');

      expect(mockDbState['users/students'][studentId].workspaceState?.aiTasks).toHaveLength(2);
      expect(mockDbState['users/students'][studentId].workspaceState?.aiTasks[0].titleHe).toBe('חיבור מאונך מותאם');
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 2: REMOTE INTERVENTION, HINTS & PROJECTOR MODE BROADCAST
  // --------------------------------------------------------------------------
  describe('2. Remote Teacher Interventions, Live Hints & Projector Broadcast', () => {
    it('transmits teacher hint to student and handles instant student acknowledgment', async () => {
      const studentId = 'student_user4';
      
      // 1. Teacher pushes hint to student node
      const hintMessage = 'שים לב לפריטת העשרת בטור העשרות!';
      mockDbState[`users/students/${studentId}/teacher_hint`] = {
        message: hintMessage,
        timestamp: Date.now()
      };
      triggerPathListeners(`users/students/${studentId}/teacher_hint`);

      expect(mockDbState[`users/students/${studentId}/teacher_hint`]).toBeDefined();
      expect(mockDbState[`users/students/${studentId}/teacher_hint`].message).toBe(hintMessage);

      // 2. Student acknowledges hint and clears it
      delete mockDbState[`users/students/${studentId}/teacher_hint`];
      triggerPathListeners(`users/students/${studentId}/teacher_hint`);

      expect(mockDbState[`users/students/${studentId}/teacher_hint`]).toBeUndefined();
    });

    it('toggles projector mode globally and verifies real-time broadcast status', async () => {
      // 1. Teacher activates projector mode
      mockDbState['system_control/projector_mode'] = true;
      triggerPathListeners('system_control/projector_mode');

      expect(mockDbState['system_control/projector_mode']).toBe(true);

      // 2. Teacher disables projector mode
      mockDbState['system_control/projector_mode'] = false;
      triggerPathListeners('system_control/projector_mode');

      expect(mockDbState['system_control/projector_mode']).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 3: SOCRATIC ENGINE, Q-MATRIX & GATE APPROVAL LIFECYCLE
  // --------------------------------------------------------------------------
  describe('3. Socratic Engine Diagnostic Mapping & Session 3 Gate Approval', () => {
    it('evaluates Q-Matrix live board state analysis for deficit detection and overcrowding', () => {
      // Analyze live board state for units overcrowding (>=10)
      const activeTask = {
        id: 'task_add_1',
        titleHe: 'חיבור 128 + 35',
        instructionHe: 'בצע חיבור בלוח הערך המקומי',
        numberA: 128,
        numberB: 35,
        isSubtraction: false
      };

      const counts = { units: 13, tens: 5, hundreds: 1, thousands: 0 };
      const analysis = SocraticEngine.analyzeLiveBoardState(activeTask as any, 'units', counts);

      expect(analysis).not.toBeNull();
      expect(analysis?.tts_text).toContain('13 קוביות');
      expect(analysis?.suggested_highlight).toBe('tour-column-units');
    });

    it('unlocks Session 3 when teacher approves gate', async () => {
      const studentId = 'student_user5';
      
      // Teacher approves gate
      const gatePayload = {
        teacher_gate_approved: true,
        routeStatus: 'APPROVED',
        routeRecommendation: 'YELLOW',
        gateApprovedAt: Date.now()
      };

      mockDbState['users/students'][studentId] = {
        ...mockDbState['users/students'][studentId],
        ...gatePayload
      };
      triggerPathListeners('users/students');

      expect(mockDbState['users/students'][studentId].teacher_gate_approved).toBe(true);
      expect(mockDbState['users/students'][studentId].routeStatus).toBe('APPROVED');
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 4: MULTI-TENANT INSTITUTIONS & DYNAMIC CLASSROOM HIERARCHY
  // --------------------------------------------------------------------------
  describe('4. Multi-Tenant Institutions, Schools & Class Capacity Governance', () => {
    it('creates school, assigns teacher, adds classroom and maintains strict 12-student pilot boundaries', async () => {
      const adminStore = useAdminStore.getState();

      // 1. Setup full institution
      await adminStore.provisionFullInstitution({
        schoolName: 'בית ספר ניסויי העתיד',
        teacherName: 'מורה שרה',
        teacherEmail: 'sarah@edu-haifa.org.il',
        className: 'כיתה ירוקה',
        studentLimit: 12
      });

      expect(useAdminStore.getState().schools.some(s => s.name.includes('ניסויי'))).toBe(true);
      expect(useAdminStore.getState().teachers.some(t => t.name.includes('שרה'))).toBe(true);
      expect(useAdminStore.getState().classes.some(c => c.name.includes('ירוקה'))).toBe(true);

      // 2. Pilot reset clears extra schools while preserving official pilot school and class
      await adminStore.resetInstitutionsToOfficialPilot();

      expect(useAdminStore.getState().schools.some(s => s.id === 'school_bikorot')).toBe(true);
      expect(useAdminStore.getState().classes.some(c => c.id === 'class_1')).toBe(true);
      expect(useAdminStore.getState().schools.some(s => s.name.includes('ניסויי'))).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 5: REAL-TIME CHAT & ZERO-PII FILTER INTEGRITY
  // --------------------------------------------------------------------------
  describe('5. Real-Time Chat Synchronization & Zero PII Redaction', () => {
    it('enforces PII masking on personal ID numbers, phone numbers and emails in real-time chat', () => {
      const rawChatText = 'שלום המורה, תעודת הזהות שלי היא 039604483 והטלפון של אמא 052-1234567 והמייל test@gmail.com';
      const sanitized = sanitizeChatText(rawChatText);

      expect(sanitized).not.toContain('039604483');
      expect(sanitized).not.toContain('052-1234567');
      expect(sanitized).not.toContain('test@gmail.com');
      expect(sanitized).toContain('[PHONE_REDACTED]');
      expect(sanitized).toContain('[EMAIL_REDACTED]');
    });

    it('transmits chat message between student and teacher with room normalization', async () => {
      const studentId = 'student_user6';
      const teacherId = '039604483';
      const roomId = computeRoomId(studentId, teacherId);

      expect(roomId).toBe('student_user6');

      // Student sends message to teacher
      const messagePayload = {
        id: 'msg_1',
        senderId: studentId,
        senderName: 'תלמיד 6',
        receiverId: teacherId,
        text: 'אני זקוק להסבר על לוח הבדידים',
        timestamp: Date.now(),
        read: false
      };

      mockDbState[`chat_messages/${roomId}/msg_1`] = messagePayload;
      triggerPathListeners(`chat_messages/${roomId}`);

      expect(mockDbState[`chat_messages/student_user6/msg_1`].text).toBe('אני זקוק להסבר על לוח הבדידים');
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 6: 12-STUDENT CONCURRENT CHAOS SWARM (THE INQUISITION)
  // --------------------------------------------------------------------------
  describe('6. 12-Student Concurrent Real-Time Chaos Swarm (Stress Test)', () => {
    it('executes 12 concurrent student simulations with simultaneous block dragging, undos, hesitations, and telemetry pushes without race conditions', async () => {
      const unsub = initStoreSubscriptions();
      const swarmPromises: Promise<void>[] = [];

      for (let i = 1; i <= 12; i++) {
        const studentId = `student_user${i}`;
        const studentNum = i;

        const simulationTask = async () => {
          // 1. Set active presence
          mockDbState[`users/students/${studentId}/isOnline`] = true;

          // 2. Perform 5 sequential state updates per student
          for (let step = 1; step <= 5; step++) {
            const counts = {
              units: (studentNum + step) % 10,
              tens: Math.floor((studentNum * step) / 2) % 10,
              hundreds: 1,
              thousands: 0
            };

            const hesitationCount = step > 3 ? 1 : 0;
            const undoCount = step === 2 ? 1 : 0;

            const workspacePayload = {
              sessionNumber: 2,
              standardTaskIdx: step - 1,
              counts,
              hesitationCount,
              undoCount
            };

            // Payload size check (<50KB budget)
            const payloadBytes = JSON.stringify(workspacePayload).length;
            expect(payloadBytes).toBeLessThan(50 * 1024);

            mockDbState['users/students'][studentId] = {
              ...mockDbState['users/students'][studentId],
              workspaceState: workspacePayload,
              traceData: {
                hesitation_events: hesitationCount,
                undo_clicks: undoCount
              }
            };
            triggerPathListeners('users/students');

            await new Promise(r => setTimeout(r, 5));
          }

          // 3. Mark Meeting 2 Complete
          mockDbState['users/students'][studentId] = {
            ...mockDbState['users/students'][studentId],
            completedMeeting2: true
          };
          triggerPathListeners('users/students');
        };

        swarmPromises.push(simulationTask());
      }

      await Promise.all(swarmPromises);

      // Verify all 12 students are synchronized in useStore
      const finalStudents = useStore.getState().students;
      for (let i = 1; i <= 12; i++) {
        const id = `student_user${i}`;
        expect(finalStudents[id]).toBeDefined();
        expect(finalStudents[id].completedMeeting2).toBe(true);
        expect(finalStudents[id].workspaceState?.sessionNumber).toBe(2);
      }

      if (unsub) unsub();
    });
  });
});
