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

const INITIAL_SCHOOL_ID = 'school_bikorot';
const INITIAL_CLASS_ID = 'class_1';

export const useAdminStore = create<AdminState>()((set) => ({
  schools: [],
  teachers: [],
  classes: [],
  globalStudentLimit: 35,

  setGlobalStudentLimit: (limit) => {
    AuditLogger.log("עדכון מגבלת תלמידים", "admin", `מגבלה גלובלית חדשה: ${limit}`);
    firebaseSyncService.setGlobalStudentLimit(limit).catch(err => console.error("Failed to set global student limit in Firebase", err));
  },

  addSchool: (name) => {
    AuditLogger.log("יצירת מוסד", "admin", `מוסד חדש: ${name}`);
    firebaseSyncService.addSchool(name).catch(err => console.error("Failed to add school to Firebase", err));
  },

  deleteSchool: (id) => {
    const school = useAdminStore.getState().schools.find(s => s.id === id);
    if (school) AuditLogger.log("מחיקת מוסד", "admin", `מוסד נמחק: ${school.name}`);
    firebaseSyncService.deleteSchool(id).catch(err => console.error("Failed to delete school from Firebase", err));
  },

  addTeacher: (schoolId, name, taz, dob) => {
    AuditLogger.log("יצירת מורה", "admin", `מורה חדש: ${name} (ת"ז: ${taz})`);
    firebaseSyncService.addTeacher(schoolId, name, taz, dob).catch(err => console.error("Failed to add teacher to Firebase", err));
  },

  deleteTeacher: (id) => {
    const teacher = useAdminStore.getState().teachers.find(t => t.id === id);
    if (teacher) AuditLogger.log("מחיקת מורה", "admin", `מורה נמחק: ${teacher.name}`);
    firebaseSyncService.deleteTeacher(id).catch(err => console.error("Failed to delete teacher from Firebase", err));
  },

  addClassRoom: (schoolId, teacherId, name) => {
    AuditLogger.log("יצירת כיתה", "admin", `כיתה חדשה: ${name}`);
    firebaseSyncService.addClassRoom(schoolId, teacherId, name).catch(err => console.error("Failed to add class to Firebase", err));
  },

  deleteClassRoom: (id) => {
    const classRoom = useAdminStore.getState().classes.find(c => c.id === id);
    if (classRoom) AuditLogger.log("מחיקת כיתה", "admin", `כיתה נמחקה: ${classRoom.name}`);
    firebaseSyncService.deleteClassRoom(id).catch(err => console.error("Failed to delete class from Firebase", err));
  }
}));
