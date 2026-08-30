import { create } from 'zustand';
import { ref, onValue, update, get, remove, set as fbSet } from 'firebase/database';
import { database, functions } from '@/infrastructure/firebase';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { useChatStore, normalizeStudentId } from '@/application/useChatStore';

import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import type { MasteryProfile } from '@/core/QMatrix';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

export interface QMatrix {
  task1_read_write_zero?: string | null;
  task2_digit_value?: string | null;
  task3_subtraction_regrouping?: string | null;
  task4_decompose_number?: string | null;
  task5_units_to_tens?: string | null;
  task6_vertical_addition?: string | null;
  task7_subtraction_zero_tens?: string | null;
  task1_zero_placeholder?: string | null;
  task3_flexible_regrouping?: string | null;
  task4_basic_addition_fluency?: string | null;
  task5_small_change?: string | null;
  task6_subtraction_regrouping_legacy?: string | null;
  task7_missing_subtrahend?: string | null;
  task8_missing_addend?: string | null;
  [key: string]: string | null | undefined;
}

export interface SemanticEvent {
  event_type: 'vector_replay';
  session_id: string;
  timestamp: number;
  interaction_data: {
    action_type: string;
    details: Record<string, any>;
  };
  somatic_indicators: {
    hesitation_detected: boolean;
    undo_triggered: boolean;
  };
}

export interface TraceData {
  hesitation_events: number;
  undo_clicks: number;
  lastUpdate?: number;
  semantic_trace?: SemanticEvent[];
}

export type RoutePath = 'GREEN' | 'YELLOW';
export type RouteStatus = 'PENDING' | 'APPROVED' | 'PENDING_TEACHER_APPROVAL' | 'SANDBOX' | 'DIAGNOSTIC' | 'ADAPTIVE';

export interface DiagnosticReport {
  studentId: string;
  studentName: string;
  timestamp: number;
  clinicalDiagnosisHe: string;
  actionPlanHe: string;
  tasks: unknown[];
  qMatrixResults: QMatrix;
  traceData: TraceData;
  effort: number | null;
  strategy: string | null;
  conceptMastery?: MasteryProfile;
}

export interface StudentData {
  studentId: string;
  student_anonymous_id?: number;
  school_code?: string;
  classId: string;
  name: string;
  qMatrixResults: QMatrix;
  traceData: TraceData;
  completedMeeting2: boolean;
  session_2_completed?: boolean;
  highestCompletedMeeting?: number;
  current_session?: number;
  teacher_gate_approved?: boolean;
  routeRecommendation: RoutePath | null;
  routeStatus: RouteStatus | string | null;
  difficultyRecommendation?: string | number | null;
  isASD?: boolean;
  physicalOverride?: boolean;
  physicalOverrideActive?: boolean;
  overrideUpdatedAt?: number;
  diagnosticReport?: DiagnosticReport | null;
  conceptMastery?: MasteryProfile;
  isOnline?: boolean;
  workspaceState?: {
    sessionNumber: number;
    standardTaskIdx: number;
    flowStatus?: string;
  };
  liveSessionMetrics?: Record<string, any> | null;
  additionBoardEnabled?: boolean;
  reflections?: any;
}

export interface SemanticEventLegacy {
  action: string;
  element?: string;
  target?: string;
  context?: string;
  state_snapshot?: string;
  q_matrix_node?: string;
  session_id?: string;
  coordinates?: { x: number; y: number };
  block_type?: string;
  duration_ms?: number;
}

export type LogEventPayload = SemanticEventLegacy | Omit<SemanticEvent, 'timestamp' | 'event_type'>;

interface AppState {
  currentUserRole: 'student' | 'teacher' | 'admin' | null;
  currentUserId: string | null;
  students: Record<string, StudentData>;
  firebaseLoaded: boolean;
  login: (role: 'student' | 'teacher' | 'admin', id: string) => void;
  logout: () => void;
  globalChatEnabled: boolean;
  toggleGlobalChat: () => void;
  
  // Trace Data Actions
  incrementHesitation: (studentId: string) => void;
  incrementUndo: (studentId: string) => void;
  resetTraceData: (studentId: string) => void;
  
  // Q-Matrix Actions
  updateQMatrix: (studentId: string, updates: Partial<QMatrix>) => void;
  updateTraceData: (studentId: string, updates: Partial<TraceData>) => void;
  // NOTE: updateConceptMastery should ONLY be called exactly once at the end of Session 2 
  // (e.g. inside completeDiagnosticMapping or similar) to prevent partial/broken DB writes.
  updateConceptMastery: (studentId: string, updates: MasteryProfile) => void;
  logSemanticEvent: (studentId: string, event: LogEventPayload) => void;
  markMeeting2Complete: (studentId: string) => void;
  updateHighestCompletedMeeting: (studentId: string, meeting: number) => void;

  // Live Metrics
  updateLiveSessionMetrics: (studentId: string, metrics: any) => void;

  // Routing & Override Actions
  setRouteRecommendation: (studentId: string, route: RoutePath) => void;
  approveRoute: (studentId: string) => void;
  applyPhysicalOverride: (
    studentId: string,
    overrideData: {
      routeStatus: string;
      difficultyRecommendation: string;
      isASD: boolean;
      physicalOverride: boolean;
      physicalOverrideActive?: boolean;
      overrideUpdatedAt: number;
    }
  ) => void;
  updateStudent: (studentId: string, updates: Partial<StudentData>) => void;
  resetStudentData: (studentId: string) => Promise<void>;
  resetEntireSystemUsageData: (reason?: any) => Promise<void>;
  initStoreSubscriptions: () => (() => void);
}

let studentsUnsubscribe: (() => void) | null = null;

export const initStoreSubscriptions = (): (() => void) => {
  if (studentsUnsubscribe) return studentsUnsubscribe;

  try {
    const studentsRef = ref(database, 'users/students');
    studentsUnsubscribe = onValue(
      studentsRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        const rawData = snapshot.val();
        if (!rawData || typeof rawData !== 'object') return;

        const current = { ...useStore.getState().students };
        let hasChanged = false;

        Object.keys(rawData).forEach((uid) => {
          const row = rawData[uid] || {};
          const normUid = normalizeStudentId(uid);
          if (!normUid.startsWith('student_user')) return;

          const num = normUid.replace(/[^0-9]/g, '');
          const defaultName = num ? `תלמיד ${num}` : normUid;
          const cleanName = row.name || row.profile?.displayName || row.studentName || defaultName;

          const prev = current[normUid] || current[uid] || {};

          const updated: StudentData = {
            ...prev,
            studentId: normUid,
            classId: row.classId || prev.classId || 'class_1',
            name: cleanName,
            completedMeeting2: Boolean(row.completedMeeting2 ?? prev.completedMeeting2 ?? false),
            highestCompletedMeeting: typeof row.highestCompletedMeeting === 'number' ? row.highestCompletedMeeting : (prev.highestCompletedMeeting || 0),
            routeRecommendation: row.routeRecommendation || prev.routeRecommendation || null,
            routeStatus: row.routeStatus || prev.routeStatus || null,
            difficultyRecommendation: row.difficultyRecommendation || prev.difficultyRecommendation || null,
            isASD: row.isASD !== undefined ? row.isASD : prev.isASD,
            physicalOverride: Boolean(row.physicalOverride ?? prev.physicalOverride ?? false),
            physicalOverrideActive: Boolean(row.physicalOverrideActive ?? prev.physicalOverrideActive ?? false),
            diagnosticReport: row.diagnosticReport || prev.diagnosticReport || null,
            isOnline: Boolean(row.isOnline === true && row.lastPing && (Date.now() - row.lastPing <= 15000)),
            qMatrixResults: {
              ...(prev.qMatrixResults || {}),
              ...(row.qMatrixResults || {})
            },
            traceData: {
              hesitation_events: typeof row.traceData?.hesitation_events === 'number'
                ? row.traceData.hesitation_events
                : (typeof row.workspaceState?.hesitationCount === 'number' ? row.workspaceState.hesitationCount : (prev.traceData?.hesitation_events || 0)),
              undo_clicks: typeof row.traceData?.undo_clicks === 'number'
                ? row.traceData.undo_clicks
                : (typeof row.workspaceState?.undoCount === 'number' ? row.workspaceState.undoCount : (prev.traceData?.undo_clicks || 0)),
              semantic_trace: row.traceData?.semantic_trace || prev.traceData?.semantic_trace || []
            },
            workspaceState: row.workspaceState || prev.workspaceState,
            additionBoardEnabled: row.additionBoardEnabled !== undefined ? row.additionBoardEnabled : prev.additionBoardEnabled,
            reflections: row.reflections || prev.reflections
          };

          current[normUid] = updated;
          if (uid !== normUid) {
            current[uid] = updated;
          }
          hasChanged = true;
        });

        if (hasChanged) {
          useStore.setState({ students: current, firebaseLoaded: true });
        }
      },
      (err) => {
        console.warn('[useStore] students listener notice:', err);
      }
    );
  } catch (err) {
    console.error("Failed to initialize store subscriptions:", err);
  }

  return () => {
    if (studentsUnsubscribe) {
      studentsUnsubscribe();
      studentsUnsubscribe = null;
    }
  };
};

// Generate 12 users for Pilot / Audit (ביקורת) environment
const generateInitialStudents = (): Record<string, StudentData> => {
  const students: Record<string, StudentData> = {};
  for (let i = 1; i <= 12; i++) {
    const id = `student_user${i}`;
    students[id] = {
      studentId: id,
      classId: 'class_1',
      name: `תלמיד ${i}`,
      completedMeeting2: false, // Default
      highestCompletedMeeting: 0,
      qMatrixResults: {
        task1_zero_placeholder: null,
        task3_flexible_regrouping: null,
        task4_basic_addition_fluency: null,
        task5_small_change: null,
        task6_subtraction_regrouping: null,
        task7_missing_subtrahend: null,
        task8_missing_addend: null,
      },
      traceData: { hesitation_events: 0, undo_clicks: 0 },
      routeRecommendation: null,
      routeStatus: null,
      liveSessionMetrics: null
    };
  }
  return students;
};

const initialStudents = generateInitialStudents();

export const useStore = create<AppState>()(
  (set) => ({
      currentUserRole: null,
      currentUserId: null,
      students: initialStudents,
      globalChatEnabled: true,
      firebaseLoaded: false,
      initStoreSubscriptions: () => initStoreSubscriptions(),
      
      toggleGlobalChat: () => set((state) => ({ globalChatEnabled: !state.globalChatEnabled })),

      login: (role, id) => set((state) => {
        if (role === 'student') {
          const numMatch = id.match(/\d+/);
          const studentNum = numMatch ? parseInt(numMatch[0], 10) : 0;
          if (studentNum < 1 || studentNum > 12) {
            console.error(`Invalid student login: ${id}. Only students 1 to 12 are permitted in Pilot PRD v3.0.`);
            return state;
          }
        }

        const newState: Partial<AppState> = { currentUserRole: role, currentUserId: id, firebaseLoaded: false };
        if (role === 'student' && !state.students[id]) {
          // Auto-initialize new student (strictly within 1..12 range)
          const numMatch = id.match(/\d+/);
          const studentNum = numMatch ? parseInt(numMatch[0], 10) : 1;
          newState.students = {
            ...state.students,
            [id]: {
              studentId: id,
              classId: 'class_1',
              name: `תלמיד ${studentNum}`,
              completedMeeting2: false,
              highestCompletedMeeting: 0,
              qMatrixResults: {
                task1_zero_placeholder: null,
                task3_flexible_regrouping: null,
                task4_basic_addition_fluency: null,
                task5_small_change: null,
                task6_subtraction_regrouping: null,
                task7_missing_subtrahend: null,
                task8_missing_addend: null,
              },
              traceData: { hesitation_events: 0, undo_clicks: 0 },
              routeRecommendation: null,
              routeStatus: null,
              liveSessionMetrics: null
            }
          };
        }
        return newState;
      }),
      
      logout: () => set({ currentUserRole: null, currentUserId: null, firebaseLoaded: false }),

      incrementHesitation: (studentId) => set((state) => {
        const student = state.students[studentId];
        if (!student) return state;
        return {
          students: {
            ...state.students,
            [studentId]: {
              ...student,
              traceData: {
                ...student.traceData,
                hesitation_events: student.traceData.hesitation_events + 1
              }
            }
          }
        };
      }),

      incrementUndo: (studentId) => set((state) => {
        const student = state.students[studentId];
        if (!student) return state;
        return {
          students: {
            ...state.students,
            [studentId]: {
              ...student,
              traceData: {
                ...student.traceData,
                undo_clicks: student.traceData.undo_clicks + 1
              }
            }
          }
        };
      }),

      resetTraceData: (studentId) => set((state) => {
        const student = state.students[studentId];
        if (!student) return state;
        const newTraceData = { hesitation_events: 0, undo_clicks: 0 };
        firebaseSyncService.syncTraceData(studentId, newTraceData).catch(console.error);
        return {
          students: {
            ...state.students,
            [studentId]: {
              ...student,
              traceData: newTraceData
            }
          }
        };
      }),

      updateQMatrix: (studentId, updates) => set((state) => {
        const students = { ...state.students };
        if (students[studentId]) {
          const newQMatrix = { ...students[studentId].qMatrixResults, ...updates };
          students[studentId] = { ...students[studentId], qMatrixResults: newQMatrix };
          firebaseSyncService.syncQMatrix(studentId, updates).catch(console.error);
        }
        return { students };
      }),

      updateTraceData: (studentId, updates) => set((state) => {
        const students = { ...state.students };
        if (students[studentId]) {
          const newTraceData = { ...students[studentId].traceData, ...updates };
          students[studentId] = { ...students[studentId], traceData: newTraceData };
          firebaseSyncService.syncTraceData(studentId, updates).catch(console.error);
        }
        return { students };
      }),

      logSemanticEvent: (studentId, event) => set((state) => {
        const students = { ...state.students };
        if (students[studentId]) {
          const currentTrace = students[studentId].traceData.semantic_trace || [];
          let newEvent: SemanticEvent;
          
          if ('interaction_data' in event) {
            const rawEvent = event as Omit<SemanticEvent, 'timestamp' | 'event_type'> & { session_id?: string };
            newEvent = { 
              ...rawEvent, 
              event_type: 'vector_replay', 
              session_id: rawEvent.session_id || `session_1`,
              timestamp: Date.now() 
            } as SemanticEvent;
          } else {
            const legacy = event as SemanticEventLegacy;
            let actionType = legacy.action;
            if (actionType === 'drag_ungrouped') actionType = 'block_split';
            if (actionType === 'drag_grouped') actionType = 'block_group_success';
            if (actionType === 'undo') actionType = 'undo_click';
            
            const sessionNum = useWorkspaceStore.getState()?.sessionNumber || 1;

            newEvent = {
              event_type: 'vector_replay',
              session_id: legacy.session_id || `session_${sessionNum}`,
              timestamp: Date.now(),
              interaction_data: {
                action_type: actionType,
                details: {
                  element: legacy.element || 'workspace_element',
                  target: legacy.target || 'target_place',
                  context: legacy.context || actionType,
                  state_snapshot: legacy.state_snapshot || '',
                  q_matrix_node: legacy.q_matrix_node || 'general',
                  block_type: legacy.block_type || (legacy.element?.includes('hundreds') ? 'hundreds_block' : legacy.element?.includes('tens') ? 'tens_block' : legacy.element?.includes('units') ? 'units_block' : 'dines_block'),
                  coordinates: legacy.coordinates || { x: 100, y: 200 },
                  duration_ms: legacy.duration_ms || 350
                }
              },
              somatic_indicators: {
                hesitation_detected: actionType === 'hesitation_timeout',
                undo_triggered: actionType === 'undo_click'
              }
            };
          }

          // Limit trace length to 40 events to guarantee < 50KB payload budget per PRD 5.2 & 6
          const MAX_VECTOR_TRACE_LENGTH = 40;
          const updatedTrace = [...currentTrace, newEvent].slice(-MAX_VECTOR_TRACE_LENGTH);
          const newTraceData = { ...students[studentId].traceData, semantic_trace: updatedTrace };
          students[studentId] = { ...students[studentId], traceData: newTraceData };
          
          firebaseSyncService.syncTraceData(studentId, { semantic_trace: updatedTrace }).catch(console.error);
        }
        return { students };
      }),

      updateConceptMastery: (studentId, updates) => set((state) => {
        const students = { ...state.students };
        if (students[studentId]) {
          students[studentId] = { ...students[studentId], conceptMastery: updates };
          firebaseSyncService.syncConceptMastery(studentId, updates).catch(console.error);
        }
        return { students };
      }),

      updateLiveSessionMetrics: (studentId, metrics) => set((state) => {
        const students = { ...state.students };
        if (students[studentId]) {
          const updatedMetrics = { ...students[studentId].liveSessionMetrics, ...metrics };
          students[studentId] = { ...students[studentId], liveSessionMetrics: updatedMetrics };
          firebaseSyncService.syncLiveSessionMetrics(studentId, updatedMetrics).catch(console.error);
        }
        return { students };
      }),

      markMeeting2Complete: (studentId) => set((state) => {
        const students = { ...state.students };
        if (students[studentId]) {
          const currentHighest = students[studentId].highestCompletedMeeting || 0;
          students[studentId] = { 
            ...students[studentId], 
            completedMeeting2: true,
            highestCompletedMeeting: Math.max(currentHighest, 2)
          };
          firebaseSyncService.syncMeeting2Complete(studentId).catch(console.error);
          firebaseSyncService.syncHighestCompletedMeeting(studentId, Math.max(currentHighest, 2)).catch(console.error);
        }
        return { students };
      }),

      updateHighestCompletedMeeting: (studentId, meeting) => set((state) => {
        const students = { ...state.students };
        if (students[studentId]) {
          const currentHighest = students[studentId].highestCompletedMeeting || 0;
          if (meeting > currentHighest) {
            students[studentId] = { ...students[studentId], highestCompletedMeeting: meeting };
            firebaseSyncService.syncHighestCompletedMeeting(studentId, meeting).catch(console.error);
          }
        }
        return { students };
      }),

      setRouteRecommendation: (studentId, route) => set((state) => {
        const students = { ...state.students };
        if (students[studentId]) {
          students[studentId] = { 
            ...students[studentId], 
            routeRecommendation: route,
            routeStatus: 'PENDING'
          };
          firebaseSyncService.syncRouteRecommendation(studentId, route).catch(console.error);
        }
        return { students };
      }),

      approveRoute: (studentId) => set((state) => {
        const student = state.students[studentId];
        if (!student) return state;
        // Also write to Firebase so the student's device is notified via the onValue listener
        firebaseSyncService.syncApproveRoute(studentId).catch(console.error);
        return {
          students: {
            ...state.students,
            [studentId]: {
              ...student,
              routeStatus: 'APPROVED'
            }
          }
        };
      }),

      applyPhysicalOverride: (studentId, overrideData) => set((state) => {
        const student = state.students[studentId];
        if (!student) return state;
        const updatedStudent: StudentData = {
          ...student,
          routeStatus: overrideData.routeStatus as RouteStatus,
          difficultyRecommendation: overrideData.difficultyRecommendation,
          isASD: overrideData.isASD,
          physicalOverride: overrideData.physicalOverride,
          overrideUpdatedAt: overrideData.overrideUpdatedAt,
        };
        firebaseSyncService.syncPhysicalOverride(studentId, overrideData).catch(console.error);
        return {
          students: {
            ...state.students,
            [studentId]: updatedStudent,
          },
        };
      }),

      updateStudent: (studentId, updates) => set((state) => {
        const student = state.students[studentId];
        if (!student) return state;
        return {
          students: {
            ...state.students,
            [studentId]: {
              ...student,
              ...updates,
            },
          },
        };
      }),

      resetStudentData: async (studentId: string, reason = 'TEACHER_INITIATED_RESET') => {
        const normId = normalizeStudentId(studentId);
        const num = normId.replace(/\D/g, '') || '1';
        const defaultName = `תלמיד ${num}`;

        // Module 23א: Step 1 & 2 - Call server-side Backup-Before-Delete Cloud Function
        try {
          const backupResetCallable = httpsCallable(functions, 'backupAndResetSessionData');
          const result = await backupResetCallable({
            reset_level: 'single_student',
            reason,
            student_id: normId,
            class_id: 'class_1',
          });
          const resData = result.data as any;
          if (!resData || resData.status !== 'SUCCESS') {
            throw new Error('הגיבוי נכשל. האיפוס בוטל ולא נמחקו נתונים.');
          }
        } catch (err: any) {
          console.error('[Module 23א] Backup-before-delete failed for single student:', err);
          toast.error('הגיבוי נכשל. האיפוס בוטל ולא נמחקו נתונים.');
          return; // CRITICAL: Stop execution immediately — no local state or DB deletion
        }

        const cleanStudent: StudentData = {
          studentId: normId,
          classId: 'class_1',
          name: defaultName,
          completedMeeting2: false,
          highestCompletedMeeting: 0,
          qMatrixResults: {
            task1_zero_placeholder: null,
            task3_flexible_regrouping: null,
            task4_basic_addition_fluency: null,
            task5_small_change: null,
            task6_subtraction_regrouping: null,
            task7_missing_subtrahend: null,
            task8_missing_addend: null,
          },
          traceData: { hesitation_events: 0, undo_clicks: 0, semantic_trace: [] },
          routeRecommendation: null,
          routeStatus: null,
          liveSessionMetrics: null,
          isOnline: false,
          physicalOverride: false,
          physicalOverrideActive: false,
          diagnosticReport: null,
          reflections: null,
        };

        // Update local Zustand state only after confirmed backup & server deletion
        set((state) => ({
          students: {
            ...state.students,
            [normId]: cleanStudent,
            ...(studentId !== normId ? { [studentId]: cleanStudent } : {}),
            [`student_${num}`]: cleanStudent,
          }
        }));

        useChatStore.getState().clearStudentMessages(normId);
        toast.success(`נתוני ${defaultName} אופסו בהצלחה לאחר גיבוי.`);
      },

      resetEntireSystemUsageData: async (reason: 'technical_fault' | 'student_stuck' | 'restart_session' | 'test_run' | 'other' = 'restart_session') => {
        // Module 23א: Step 1 & 2 - Call server-side Backup-Before-Delete Cloud Function for System
        try {
          const backupResetCallable = httpsCallable(functions, 'backupAndResetSessionData');
          const result = await backupResetCallable({
            reset_level: 'system',
            reason,
            class_id: 'class_1',
          });
          const resData = result.data as any;
          if (!resData || resData.status !== 'SUCCESS') {
            throw new Error('הגיבוי נכשל. האיפוס בוטל ולא נמחקו נתונים.');
          }
        } catch (err: any) {
          console.error('[Module 23א] Backup-before-delete failed for system:', err);
          toast.error('הגיבוי נכשל. האיפוס בוטל ולא נמחקו נתונים.');
          return; // CRITICAL: Stop execution immediately — no local state or DB deletion
        }

        const cleanStudents: Record<string, StudentData> = {};

        for (let i = 1; i <= 12; i++) {
          const normId = `student_user${i}`;
          const defaultName = `תלמיד ${i}`;
          const cleanStudent: StudentData = {
            studentId: normId,
            classId: 'class_1',
            name: defaultName,
            completedMeeting2: false,
            highestCompletedMeeting: 0,
            qMatrixResults: {
              task1_zero_placeholder: null,
              task3_flexible_regrouping: null,
              task4_basic_addition_fluency: null,
              task5_small_change: null,
              task6_subtraction_regrouping: null,
              task7_missing_subtrahend: null,
              task8_missing_addend: null,
            },
            traceData: { hesitation_events: 0, undo_clicks: 0, semantic_trace: [] },
            routeRecommendation: null,
            routeStatus: null,
            liveSessionMetrics: null,
            isOnline: false,
            physicalOverride: false,
            physicalOverrideActive: false,
            diagnosticReport: null,
            reflections: null,
          };
          cleanStudents[normId] = cleanStudent;
          cleanStudents[`student_${i}`] = cleanStudent;
        }

        set({ students: cleanStudents });
        useChatStore.getState().clearAllMessages();
        toast.success('כל נתוני המערכת אופסו בהצלחה לאחר גיבוי מלא לדרייב.');
      }
    })
);
