import { create } from "zustand";
import { AuditLogger } from "@/infrastructure/services/AuditLogger";
import { firebaseSyncService } from "@/infrastructure/services/FirebaseSyncService";

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

export const useAdminStore = create<AdminState>()((set, get) => ({
  schools: [],
  teachers: [],
  classes: [],
  globalStudentLimit: 12,

  setGlobalStudentLimit: (limit) => {
    AuditLogger.log("עדכון מגבלת תלמידים", "admin", `מגבלה גלובלית חדשה: ${limit}`);
    set({ globalStudentLimit: limit });
    firebaseSyncService.setGlobalStudentLimit(limit).catch(err => console.error("Failed to set global student limit in Firebase", err));
  },

  addSchool: (name) => {
    AuditLogger.log("יצירת מוסד", "admin", `מוסד חדש: ${name}`);
    const tempId = `school_${Date.now()}`;
    const newSchool: School = { id: tempId, name, createdAt: Date.now() };
    set((state) => ({ schools: [...state.schools, newSchool] }));
    firebaseSyncService.addSchool(name, tempId).then((realSchool) => {
      if (realSchool && realSchool.id !== tempId) {
        set((state) => ({
          schools: state.schools.map(s => s.id === tempId ? realSchool : s)
        }));
      }
    }).catch(err => {
      console.error("Failed to add school to Firebase", err);
    });
  },

  deleteSchool: (id) => {
    const school = get().schools.find(s => s.id === id);
    if (school) AuditLogger.log("מחיקת מוסד", "admin", `מוסד נמחק: ${school.name}`);
    set((state) => ({
      schools: state.schools.filter(s => s.id !== id),
      teachers: state.teachers.filter(t => t.schoolId !== id),
      classes: state.classes.filter(c => c.schoolId !== id)
    }));
    firebaseSyncService.deleteSchool(id).catch(err => console.error("Failed to delete school from Firebase", err));
  },

  addTeacher: (schoolId, name, taz, dob) => {
    AuditLogger.log("יצירת מורה", "admin", `מורה חדש: ${name} (ת"ז: ***${taz.slice(-4)})`);
    const id = taz.trim();
    const newTeacher: Teacher = {
      id,
      schoolId,
      name: name.trim(),
      taz: id,
      dob: dob.trim() || "010190",
      licenseActive: false,
      createdAt: Date.now()
    };
    set((state) => ({
      teachers: [...state.teachers.filter(t => t.id !== id), newTeacher]
    }));
    firebaseSyncService.addTeacher(schoolId, name, taz, dob).catch(err => console.error("Failed to add teacher to Firebase", err));
  },

  deleteTeacher: (id) => {
    const teacher = get().teachers.find(t => t.id === id);
    if (teacher) AuditLogger.log("מחיקת מורה", "admin", `מורה נמחק: ${teacher.name}`);
    set((state) => ({
      teachers: state.teachers.filter(t => t.id !== id),
      classes: state.classes.filter(c => c.teacherId !== id)
    }));
    firebaseSyncService.deleteTeacher(id).catch(err => console.error("Failed to delete teacher from Firebase", err));
  },

  addClassRoom: (schoolId, teacherId, name) => {
    AuditLogger.log("יצירת כיתה", "admin", `כיתה חדשה: ${name}`);
    const tempId = `class_${Date.now()}`;
    const limit = get().globalStudentLimit;
    const newClass: ClassRoom = {
      id: tempId,
      schoolId,
      teacherId,
      name: name.trim(),
      studentLimit: limit,
      createdAt: Date.now()
    };
    set((state) => ({ classes: [...state.classes, newClass] }));
    firebaseSyncService.addClassRoom(schoolId, teacherId, name, tempId).then((realClass) => {
      if (realClass && realClass.id !== tempId) {
        set((state) => ({
          classes: state.classes.map(c => c.id === tempId ? realClass : c)
        }));
      }
    }).catch(err => console.error("Failed to add class to Firebase", err));
  },

  deleteClassRoom: (id) => {
    const classRoom = get().classes.find(c => c.id === id);
    if (classRoom) AuditLogger.log("מחיקת כיתה", "admin", `כיתה נמחקה: ${classRoom.name}`);
    set((state) => ({
      classes: state.classes.filter(c => c.id !== id)
    }));
    firebaseSyncService.deleteClassRoom(id).catch(err => console.error("Failed to delete class from Firebase", err));
  }
}));
