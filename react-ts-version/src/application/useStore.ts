import { create } from 'zustand';

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

export interface StudentData {
  studentId: string;
  name: string;
  qMatrixResults: QMatrix;
  traceData: TraceData;
  completedMeeting2: boolean;
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
  
  // Q-Matrix Actions
  updateQMatrix: (studentId: string, updates: Partial<QMatrix>) => void;
  markMeeting2Complete: (studentId: string) => void;
}

// Mock initial data
const initialStudents: Record<string, StudentData> = {
  'student-1': {
    studentId: 'student-1',
    name: 'דוד כהן',
    completedMeeting2: false,
    qMatrixResults: {
      task1_zero_placeholder: null,
      task2_estimation_error_margin: null,
      task3_flexible_regrouping: null,
      task4_basic_addition_fluency: null,
      task5_basic_subtraction_fluency: null,
    },
    traceData: { hesitation_events: 0, undo_clicks: 0 }
  },
  'student-2': {
    studentId: 'student-2',
    name: 'נועה לוי',
    completedMeeting2: true,
    qMatrixResults: {
      task1_zero_placeholder: true,
      task2_estimation_error_margin: 0.1,
      task3_flexible_regrouping: true,
      task4_basic_addition_fluency: false, // Needs basic addition help
      task5_basic_subtraction_fluency: true,
    },
    traceData: { hesitation_events: 5, undo_clicks: 2 }
  },
  'student-3': {
    studentId: 'student-3',
    name: 'רון ישראלי',
    completedMeeting2: true,
    qMatrixResults: {
      task1_zero_placeholder: false, // Needs zero placeholder help
      task2_estimation_error_margin: 0.5,
      task3_flexible_regrouping: false,
      task4_basic_addition_fluency: true,
      task5_basic_subtraction_fluency: false,
    },
    traceData: { hesitation_events: 12, undo_clicks: 8 }
  }
};

export const useStore = create<AppState>((set) => ({
  currentUserRole: null,
  currentUserId: null,
  students: initialStudents,

  login: (role, id) => set({ currentUserRole: role, currentUserId: id }),
  logout: () => set({ currentUserRole: null, currentUserId: null }),

  incrementHesitation: (studentId) => set((state) => ({
    students: {
      ...state.students,
      [studentId]: {
        ...state.students[studentId],
        traceData: {
          ...state.students[studentId].traceData,
          hesitation_events: state.students[studentId].traceData.hesitation_events + 1
        }
      }
    }
  })),

  incrementUndo: (studentId) => set((state) => ({
    students: {
      ...state.students,
      [studentId]: {
        ...state.students[studentId],
        traceData: {
          ...state.students[studentId].traceData,
          undo_clicks: state.students[studentId].traceData.undo_clicks + 1
        }
      }
    }
  })),

  updateQMatrix: (studentId, updates) => set((state) => ({
    students: {
      ...state.students,
      [studentId]: {
        ...state.students[studentId],
        qMatrixResults: {
          ...state.students[studentId].qMatrixResults,
          ...updates
        }
      }
    }
  })),
  
  markMeeting2Complete: (studentId) => set((state) => ({
    students: {
      ...state.students,
      [studentId]: {
        ...state.students[studentId],
        completedMeeting2: true
      }
    }
  }))
}));
