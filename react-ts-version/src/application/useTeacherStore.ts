import { create } from 'zustand';
import type { PedagogicalPath } from '@/types';

export type RadarCellColor = 'GREEN' | 'YELLOW' | 'RED' | 'GREY';

export interface StudentRadarCell {
  student_id: number; // Strictly 1-12
  status: RadarCellColor;
  lastActiveTimestamp: number;
  isHesitating: boolean; // 45s hesitation
  isSocraticActive: boolean; // Socratic card active
  isOnline: boolean; // Presence heartbeat within 15s
  activeSessionNumber: number;
  currentExerciseId: string | null;
  teacherGateApproved: boolean;
  teacherSelectedPath: PedagogicalPath | null;
  matrixRecommendedPath: PedagogicalPath | null;
  supportProfileId: string | null;
  supportProfileVersion: number;
}

export interface TeacherDashboardState {
  // Grid 3x4 for 12 anonymous students (Module 18)
  studentsGrid: Record<number, StudentRadarCell>;
  
  // Projector Mode (Module 15)
  projectorMode: boolean;
  projectorModeUpdatedAt: number;
  updatedByTeacherId: string | null;

  // Actions
  updateStudentPresence: (studentId: number, isOnline: boolean, timestamp?: number) => void;
  setStudentHesitation: (studentId: number, isHesitating: boolean) => void;
  setStudentSocraticActive: (studentId: number, isSocraticActive: boolean) => void;
  setProjectorMode: (active: boolean, teacherId: string, timestamp?: number) => void;
  approveTeacherGate: (
    studentId: number,
    selectedPath: PedagogicalPath,
    teacherId: string
  ) => void;
  assignSupportProfile: (
    studentId: number,
    profileId: string | null,
    teacherId: string
  ) => void;
  computeCellColor: (cell: StudentRadarCell) => RadarCellColor;
  refreshGridPresence: () => void;
}

/**
 * Calculates the display color for a student radar cell based on strict PRD Module 18 hierarchy:
 * RED > GREY > YELLOW > GREEN
 */
export function calculateRadarColor(cell: {
  isOnline: boolean;
  isSocraticActive: boolean;
  isHesitating: boolean;
  lastActiveTimestamp: number;
}): RadarCellColor {
  // 1. RED: Socratic intervention card is currently open/active
  if (cell.isSocraticActive) {
    return 'RED';
  }

  // 2. GREY: Student is disconnected (or last heartbeat > 15s ago)
  const isHeartbeatExpired = Date.now() - cell.lastActiveTimestamp > 15000;
  if (!cell.isOnline || isHeartbeatExpired) {
    return 'GREY';
  }

  // 3. YELLOW: 45s cognitive hesitation detected
  if (cell.isHesitating) {
    return 'YELLOW';
  }

  // 4. GREEN: Normal active learning (cognitive action within last 30s)
  return 'GREEN';
}

function initialize12StudentGrid(): Record<number, StudentRadarCell> {
  const grid: Record<number, StudentRadarCell> = {};
  for (let id = 1; id <= 12; id++) {
    grid[id] = {
      student_id: id,
      status: 'GREY',
      lastActiveTimestamp: 0,
      isHesitating: false,
      isSocraticActive: false,
      isOnline: false,
      activeSessionNumber: 1,
      currentExerciseId: null,
      teacherGateApproved: false,
      teacherSelectedPath: null,
      matrixRecommendedPath: null,
      supportProfileId: null,
      supportProfileVersion: 1,
    };
  }
  return grid;
}

export const useTeacherStore = create<TeacherDashboardState>((set, get) => ({
  studentsGrid: initialize12StudentGrid(),
  projectorMode: false,
  projectorModeUpdatedAt: 0,
  updatedByTeacherId: null,

  computeCellColor: (cell: StudentRadarCell): RadarCellColor => {
    return calculateRadarColor(cell);
  },

  updateStudentPresence: (studentId: number, isOnline: boolean, timestamp = Date.now()) => {
    if (studentId < 1 || studentId > 12) return;
    set((state) => {
      const current = state.studentsGrid[studentId];
      if (!current) return state;
      const updated: StudentRadarCell = {
        ...current,
        isOnline,
        lastActiveTimestamp: timestamp,
      };
      updated.status = calculateRadarColor(updated);
      return {
        studentsGrid: {
          ...state.studentsGrid,
          [studentId]: updated,
        },
      };
    });
  },

  setStudentHesitation: (studentId: number, isHesitating: boolean) => {
    if (studentId < 1 || studentId > 12) return;
    set((state) => {
      const current = state.studentsGrid[studentId];
      if (!current) return state;
      const updated: StudentRadarCell = {
        ...current,
        isHesitating,
        lastActiveTimestamp: isHesitating ? current.lastActiveTimestamp : Date.now(),
      };
      updated.status = calculateRadarColor(updated);
      return {
        studentsGrid: {
          ...state.studentsGrid,
          [studentId]: updated,
        },
      };
    });
  },

  setStudentSocraticActive: (studentId: number, isSocraticActive: boolean) => {
    if (studentId < 1 || studentId > 12) return;
    set((state) => {
      const current = state.studentsGrid[studentId];
      if (!current) return state;
      const updated: StudentRadarCell = {
        ...current,
        isSocraticActive,
      };
      updated.status = calculateRadarColor(updated);
      return {
        studentsGrid: {
          ...state.studentsGrid,
          [studentId]: updated,
        },
      };
    });
  },

  setProjectorMode: (active: boolean, teacherId: string, timestamp = Date.now()) => {
    const s = get();
    // Ignore outdated timestamp updates
    if (timestamp < s.projectorModeUpdatedAt) return;
    set({
      projectorMode: active,
      projectorModeUpdatedAt: timestamp,
      updatedByTeacherId: teacherId,
    });
  },

  approveTeacherGate: (studentId: number, selectedPath: PedagogicalPath, teacherId: string) => {
    if (studentId < 1 || studentId > 12) return;
    set((state) => {
      const current = state.studentsGrid[studentId];
      if (!current) return state;
      return {
        studentsGrid: {
          ...state.studentsGrid,
          [studentId]: {
            ...current,
            teacherGateApproved: true,
            teacherSelectedPath: selectedPath,
          },
        },
      };
    });
  },

  assignSupportProfile: (studentId: number, profileId: string | null, teacherId: string) => {
    if (studentId < 1 || studentId > 12) return;
    set((state) => {
      const current = state.studentsGrid[studentId];
      if (!current) return state;
      return {
        studentsGrid: {
          ...state.studentsGrid,
          [studentId]: {
            ...current,
            supportProfileId: profileId,
            supportProfileVersion: current.supportProfileVersion + 1,
          },
        },
      };
    });
  },

  refreshGridPresence: () => {
    const now = Date.now();
    set((state) => {
      let changed = false;
      const nextGrid = { ...state.studentsGrid };
      for (let id = 1; id <= 12; id++) {
        const cell = nextGrid[id];
        if (cell) {
          const wasOnline = cell.isOnline;
          const isFresh = now - cell.lastActiveTimestamp <= 15000;
          if (wasOnline && !isFresh) {
            const updated = { ...cell, isOnline: false };
            updated.status = calculateRadarColor(updated);
            nextGrid[id] = updated;
            changed = true;
          }
        }
      }
      return changed ? { studentsGrid: nextGrid } : state;
    });
  },
}));
