import { create } from 'zustand';

import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import type { MasteryProfile } from '@/core/QMatrix';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

export interface QMatrix {
  task1_zero_placeholder: string | null;
  task2_estimation_error_margin: string | null;
  task3_flexible_regrouping: string | null;
  task4_basic_addition_fluency: string | null;
  task5_small_change: string | null;
  task6_subtraction_regrouping: string | null;
  task7_missing_subtrahend: string | null;
  task8_missing_addend: string | null;
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
  classId: string;
  name: string;
  qMatrixResults: QMatrix;
  traceData: TraceData;
  completedMeeting2: boolean;
  highestCompletedMeeting?: number;
  routeRecommendation: RoutePath | null;
  routeStatus: RouteStatus | string | null;
  difficultyRecommendation?: string | number | null;
  isASD?: boolean;
  physicalOverride?: boolean;
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
}

// Generate 30 users for Audit (ביקורת) environment
const generateInitialStudents = (): Record<string, StudentData> => {
  const students: Record<string, StudentData> = {};
  for (let i = 1; i <= 30; i++) {
    const id = `student_user${i}`;
    students[id] = {
      studentId: id,
      classId: 'class_1',
      name: `user${i}`,
      completedMeeting2: false, // Default
      highestCompletedMeeting: 0,
      qMatrixResults: {
        task1_zero_placeholder: null,
        task2_estimation_error_margin: null,
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
      
      toggleGlobalChat: () => set((state) => ({ globalChatEnabled: !state.globalChatEnabled })),

      login: (role, id) => set((state) => {
        const newState: Partial<AppState> = { currentUserRole: role, currentUserId: id, firebaseLoaded: false };
        if (role === 'student' && !state.students[id]) {
          // Auto-initialize new student (fallback)
          newState.students = {
            ...state.students,
            [id]: {
              studentId: id,
              classId: 'unknown_class',
              name: id.replace('student_', ''),
              completedMeeting2: false,
              highestCompletedMeeting: 0,
              qMatrixResults: {
                task1_zero_placeholder: null,
                task2_estimation_error_margin: null,
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
          
          // Also log individually to the vector_replays branch
          firebaseSyncService.logVectorReplayEvent(
            studentId,
            newEvent.session_id || "session_unknown",
            newEvent.interaction_data.action_type,
            newEvent.interaction_data.details,
            newEvent.somatic_indicators
          ).catch(console.error);
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
      })
    })
);
