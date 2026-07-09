import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import type { MasteryProfile } from '@/core/QMatrix';

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

export interface TraceData {
  hesitation_events: number;
  undo_clicks: number;
  lastUpdate?: number;
}

export type RoutePath = 'GREEN' | 'YELLOW';
export type RouteStatus = 'PENDING' | 'APPROVED';

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
  routeStatus: RouteStatus | null;
  diagnosticReport?: DiagnosticReport | null;
  conceptMastery?: MasteryProfile;
}

interface AppState {
  currentUserRole: 'student' | 'teacher' | 'admin' | null;
  currentUserId: string | null;
  students: Record<string, StudentData>;
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
  updateConceptMastery: (studentId: string, updates: MasteryProfile) => void;
  markMeeting2Complete: (studentId: string) => void;
  updateHighestCompletedMeeting: (studentId: string, meeting: number) => void;

  // Routing Actions
  setRouteRecommendation: (studentId: string, route: RoutePath) => void;
  approveRoute: (studentId: string) => void;
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
      routeStatus: null
    };
  }
  return students;
};

const initialStudents = generateInitialStudents();

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      currentUserRole: null,
      currentUserId: null,
      students: initialStudents,
      globalChatEnabled: true,
      
      toggleGlobalChat: () => set((state) => ({ globalChatEnabled: !state.globalChatEnabled })),

      login: (role, id) => set((state) => {
        const newState: Partial<AppState> = { currentUserRole: role, currentUserId: id };
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
              routeStatus: null
            }
          };
        }
        return newState;
      }),
      
      logout: () => set({ currentUserRole: null, currentUserId: null }),

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

      updateConceptMastery: (studentId, updates) => set((state) => {
        const students = { ...state.students };
        if (students[studentId]) {
          students[studentId] = { ...students[studentId], conceptMastery: updates };
          firebaseSyncService.syncConceptMastery(studentId, updates).catch(console.error);
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
      })
    }),
    {
      name: 'main-store-v8',
      partialize: (state) => Object.fromEntries(
        Object.entries(state).filter(([key]) => !['students'].includes(key))
      ),
      merge: (persistedState: unknown, currentState) => {
        if (!persistedState) return currentState;
        const persisted = persistedState as Partial<AppState>;
        
        // Return current state's students (from generateInitialStudents) intact, 
        // merge other persisted top-level keys
        return {
          ...currentState,
          ...persisted
        };
      }
    }
  )
);
