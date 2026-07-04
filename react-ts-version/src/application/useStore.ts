import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface QMatrix {
  task1_zero_placeholder: boolean | null;
  task2_estimation_error_margin: number | null;
  task3_flexible_regrouping: boolean | null;
  task4_basic_addition_fluency: boolean | null;
  task5_basic_subtraction_fluency: boolean | null;
}

export interface TraceData {
  hesitation_events: number;
  undo_clicks: number;
}

export type RoutePath = 'GREEN' | 'YELLOW';
export type RouteStatus = 'PENDING' | 'APPROVED';

export interface StudentData {
  studentId: string;
  classId: string;
  name: string;
  qMatrixResults: QMatrix;
  traceData: TraceData;
  completedMeeting2: boolean;
  routeRecommendation: RoutePath | null;
  routeStatus: RouteStatus | null;
}

interface AppState {
  currentUserRole: 'student' | 'teacher' | 'admin' | null;
  currentUserId: string | null;
  students: Record<string, StudentData>;
  login: (role: 'student' | 'teacher' | 'admin', id: string) => void;
  logout: () => void;
  
  // Trace Data Actions
  incrementHesitation: (studentId: string) => void;
  incrementUndo: (studentId: string) => void;
  resetTraceData: (studentId: string) => void;
  
  // Q-Matrix Actions
  updateQMatrix: (studentId: string, updates: Partial<QMatrix>) => void;
  markMeeting2Complete: (studentId: string) => void;

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
      qMatrixResults: {
        task1_zero_placeholder: null,
        task2_estimation_error_margin: null,
        task3_flexible_regrouping: null,
        task4_basic_addition_fluency: null,
        task5_basic_subtraction_fluency: null,
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
              qMatrixResults: {
                task1_zero_placeholder: null,
                task2_estimation_error_margin: null,
                task3_flexible_regrouping: null,
                task4_basic_addition_fluency: null,
                task5_basic_subtraction_fluency: null,
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
        return {
          students: {
            ...state.students,
            [studentId]: {
              ...student,
              traceData: { hesitation_events: 0, undo_clicks: 0 }
            }
          }
        };
      }),

      updateQMatrix: (studentId, updates) => set((state) => {
        const student = state.students[studentId];
        if (!student) return state;
        return {
          students: {
            ...state.students,
            [studentId]: {
              ...student,
              qMatrixResults: {
                ...student.qMatrixResults,
                ...updates
              }
            }
          }
        };
      }),

      markMeeting2Complete: (studentId) => set((state) => {
        const student = state.students[studentId];
        if (!student) return state;
        return {
          students: {
            ...state.students,
            [studentId]: {
              ...student,
              completedMeeting2: true
            }
          }
        };
      }),

      setRouteRecommendation: (studentId, route) => set((state) => {
        const student = state.students[studentId];
        if (!student) return state;
        return {
          students: {
            ...state.students,
            [studentId]: {
              ...student,
              routeRecommendation: route,
              routeStatus: 'PENDING'
            }
          }
        };
      }),

      approveRoute: (studentId) => set((state) => {
        const student = state.students[studentId];
        if (!student) return state;
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
      name: 'main-store-v7',
      merge: (persistedState: any, currentState) => {
        if (!persistedState) return currentState;
        
        const mergedStudents = { ...currentState.students, ...(persistedState.students || {}) };
        
        // Deep merge each student to make sure new fields are present
        Object.keys(mergedStudents).forEach(key => {
          mergedStudents[key] = {
            ...currentState.students[key], // Code defaults if this is an initial student
            ...mergedStudents[key], // Persisted data overwrites
          };
          
          // Schema migration for old students that didn't have route Recommendation/Status
          if (mergedStudents[key].routeRecommendation === undefined) {
            mergedStudents[key].routeRecommendation = null;
          }
          if (mergedStudents[key].routeStatus === undefined) {
            mergedStudents[key].routeStatus = null;
          }
        });

        return {
          ...currentState,
          ...persistedState,
          students: mergedStudents
        };
      }
    }
  )
);
