import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AuditLogger } from "@/infrastructure/services/AuditLogger";

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

      addSchool: (name) => set((state) => {
        AuditLogger.log("יצירת מוסד", "admin", `מוסד חדש: ${name}`);
        return {
          schools: [...state.schools, { id: `school_${Date.now()}`, name, createdAt: Date.now() }]
        };
      }),

      deleteSchool: (id) => set((state) => {
        const school = state.schools.find(s => s.id === id);
        if (school) AuditLogger.log("מחיקת מוסד", "admin", `מוסד נמחק: ${school.name}`);
        return {
          schools: state.schools.filter(s => s.id !== id),
          // Cascade delete
          teachers: state.teachers.filter(t => t.schoolId !== id),
          classes: state.classes.filter(c => c.schoolId !== id)
        };
      }),

      addTeacher: (schoolId, name, taz, dob) => set((state) => {
        AuditLogger.log("יצירת מורה", "admin", `מורה חדש: ${name}`);
        return {
          teachers: [...state.teachers, { 
            id: `teacher_${Date.now()}`, 
            schoolId, 
            name, 
            taz, 
            dob, 
            licenseActive: true,
            createdAt: Date.now() 
          }]
        };
      }),

      deleteTeacher: (id) => set((state) => {
        const teacher = state.teachers.find(t => t.id === id);
        if (teacher) AuditLogger.log("מחיקת מורה", "admin", `מורה נמחק: ${teacher.name}`);
        return {
          teachers: state.teachers.filter(t => t.id !== id),
          classes: state.classes.filter(c => c.teacherId !== id)
        };
      }),

      addClassRoom: (schoolId, teacherId, name) => set((state) => {
        AuditLogger.log("יצירת כיתה", "admin", `כיתה חדשה: ${name}`);
        return {
          classes: [...state.classes, { 
            id: `class_${Date.now()}`, 
            schoolId, 
            teacherId, 
            name, 
            studentLimit: state.globalStudentLimit,
            createdAt: Date.now() 
          }]
        };
      }),

      deleteClassRoom: (id) => set((state) => {
        const classRoom = state.classes.find(c => c.id === id);
        if (classRoom) AuditLogger.log("מחיקת כיתה", "admin", `כיתה נמחקה: ${classRoom.name}`);
        return {
          classes: state.classes.filter(c => c.id !== id)
        };
      }),
    }),
    {
      name: "admin-storage",
    }
  )
);
