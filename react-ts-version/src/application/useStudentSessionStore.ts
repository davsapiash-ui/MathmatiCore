import { create } from "zustand";

interface StudentSessionState {
  currentModule: string | null;
  startTime: number | null;
  hesitationEvents: number;
  undoEvents: number;
  startSession: (moduleName: string) => void;
  logHesitation: () => void;
  logUndo: () => void;
  endSession: () => void;
}

export const useStudentSessionStore = create<StudentSessionState>((set) => ({
  currentModule: null,
  startTime: null,
  hesitationEvents: 0,
  undoEvents: 0,
  startSession: (moduleName) =>
    set({
      currentModule: moduleName,
      startTime: Date.now(),
      hesitationEvents: 0,
      undoEvents: 0,
    }),
  logHesitation: () =>
    set((state) => ({ hesitationEvents: state.hesitationEvents + 1 })),
  logUndo: () => set((state) => ({ undoEvents: state.undoEvents + 1 })),
  endSession: () =>
    set({ currentModule: null, startTime: null }),
}));
