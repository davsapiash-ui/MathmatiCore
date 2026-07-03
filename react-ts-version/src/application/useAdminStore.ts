import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface School {
  id: string;
  name: string;
  createdAt: number;
}

export interface Teacher {
  id: string;
  schoolId: string;
  taz: string; // ID number, used as username
  dob: string; // 6-digit date of birth (DDMMYY), used as password
  name: string;
  licenseActive: boolean;
  createdAt: number;
}

export interface ClassRoom {
  id: string;
  schoolId: string;
  teacherId: string;
  name: string;
  studentLimit: number;
  createdAt: number;
}

interface AdminState {
  schools: School[];
  teachers: Teacher[];
  classes: ClassRoom[];
  globalStudentLimit: number;
  
  // Actions
  setGlobalStudentLimit: (limit: number) => void;
  
  addSchool: (name: string) => void;
  deleteSchool: (id: string) => void;
  
  addTeacher: (schoolId: string, name: string, taz: string, dob: string) => void;
  deleteTeacher: (id: string) => void;
  
  addClassRoom: (schoolId: string, teacherId: string, name: string) => void;
  deleteClassRoom: (id: string) => void;
}

export const useAdminStore = create<AdminState>()(
  persist(
    (set) => ({
      schools: [],
      teachers: [],
      classes: [],
      globalStudentLimit: 35,

      setGlobalStudentLimit: (limit) => set({ globalStudentLimit: limit }),

      addSchool: (name) => set((state) => ({
        schools: [...state.schools, { id: `school_${Date.now()}`, name, createdAt: Date.now() }]
      })),

      deleteSchool: (id) => set((state) => ({
        schools: state.schools.filter(s => s.id !== id),
        // Cascade delete
        teachers: state.teachers.filter(t => t.schoolId !== id),
        classes: state.classes.filter(c => c.schoolId !== id)
      })),

      addTeacher: (schoolId, name, taz, dob) => set((state) => ({
        teachers: [...state.teachers, { 
          id: `teacher_${Date.now()}`, 
          schoolId, 
          name, 
          taz, 
          dob, 
          licenseActive: true,
          createdAt: Date.now() 
        }]
      })),

      deleteTeacher: (id) => set((state) => ({
        teachers: state.teachers.filter(t => t.id !== id),
        // Note: Classes assigned to this teacher might need reassignment, but for now we just keep them or delete them
        classes: state.classes.filter(c => c.teacherId !== id)
      })),

      addClassRoom: (schoolId, teacherId, name) => set((state) => ({
        classes: [...state.classes, { 
          id: `class_${Date.now()}`, 
          schoolId, 
          teacherId, 
          name, 
          studentLimit: state.globalStudentLimit,
          createdAt: Date.now() 
        }]
      })),

      deleteClassRoom: (id) => set((state) => ({
        classes: state.classes.filter(c => c.id !== id)
      })),
    }),
    {
      name: "admin-storage",
    }
  )
);
