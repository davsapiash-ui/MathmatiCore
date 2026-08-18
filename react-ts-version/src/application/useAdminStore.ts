import { create } from "zustand";
import { AuditLogger } from "@/infrastructure/services/AuditLogger";
import { firebaseSyncService } from "@/infrastructure/services/FirebaseSyncService";
import { addAuthorizedTeacherFirestore } from "@/infrastructure/services/AuthService";
import { ref, onValue, update, type Unsubscribe } from "firebase/database";
import { database } from "@/infrastructure/firebase";

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
  isSubscribed: boolean;
  
  // Actions
  initAdminSubscriptions: () => () => void;
  setGlobalStudentLimit: (limit: number) => void;
  
  addSchool: (name: string) => void;
  deleteSchool: (id: string) => void;
  
  addTeacher: (schoolId: string, name: string, taz: string, dob: string) => void;
  deleteTeacher: (id: string) => void;
  
  addClassRoom: (schoolId: string, teacherId: string, name: string) => void;
  deleteClassRoom: (id: string) => void;

  provisionFullInstitution: (params: {
    schoolName: string;
    teacherName: string;
    teacherEmail: string;
    teacherDob?: string;
    className: string;
    classType?: string;
    studentLimit?: number;
  }) => Promise<{ school: School; teacher: Teacher; classRoom: ClassRoom }>;
}

let adminUnsubscribes: Unsubscribe[] = [];

export const useAdminStore = create<AdminState>()((set, get) => ({
  schools: [],
  teachers: [],
  classes: [],
  globalStudentLimit: 12,
  isSubscribed: false,

  initAdminSubscriptions: () => {
    // If already subscribed, return the cleanup function
    if (get().isSubscribed && adminUnsubscribes.length > 0) {
      return () => {
        adminUnsubscribes.forEach(unsub => unsub());
        adminUnsubscribes = [];
        set({ isSubscribed: false });
      };
    }

    try {
      const schoolsRef = ref(database, 'schools');
      const unsubSchools = onValue(schoolsRef, (snap) => {
        if (snap.exists()) {
          const val = snap.val() || {};
          const schools = Object.values(val) as School[];
          set({ schools });
        } else {
          set({ schools: [] });
        }
      }, (err) => console.error("Error subscribing to schools:", err));

      const teachersRef = ref(database, 'users/teachers');
      const unsubTeachers = onValue(teachersRef, (snap) => {
        if (snap.exists()) {
          const val = snap.val() || {};
          const teachers = Object.values(val) as Teacher[];
          set({ teachers });
        } else {
          set({ teachers: [] });
        }
      }, (err) => console.error("Error subscribing to teachers:", err));

      const classesRef = ref(database, 'classes');
      const unsubClasses = onValue(classesRef, (snap) => {
        if (snap.exists()) {
          const val = snap.val() || {};
          const classes = Object.values(val) as ClassRoom[];
          set({ classes });
        } else {
          set({ classes: [] });
        }
      }, (err) => console.error("Error subscribing to classes:", err));

      const limitRef = ref(database, 'system_control/globalStudentLimit');
      const unsubLimit = onValue(limitRef, (snap) => {
        if (snap.exists()) {
          const limit = Number(snap.val()) || 12;
          set({ globalStudentLimit: limit });
        }
      }, (err) => console.error("Error subscribing to limit:", err));

      adminUnsubscribes = [unsubSchools, unsubTeachers, unsubClasses, unsubLimit];
      set({ isSubscribed: true });
    } catch (e) {
      console.error("Failed to initialize admin subscriptions:", e);
    }

    return () => {
      adminUnsubscribes.forEach(unsub => unsub());
      adminUnsubscribes = [];
      set({ isSubscribed: false });
    };
  },

  setGlobalStudentLimit: (limit) => {
    AuditLogger.log("עדכון מגבלת תלמידים", "admin", `מגבלה גלובלית חדשה: ${limit}`);
    set({ globalStudentLimit: limit });
    firebaseSyncService.setGlobalStudentLimit(limit).catch(err => console.error("Failed to set global student limit in Firebase", err));
  },

  provisionFullInstitution: async ({
    schoolName,
    teacherName,
    teacherEmail,
    teacherDob = "010190",
    className,
    studentLimit = 12,
  }) => {
    const timestamp = Date.now();
    const schoolId = `school_${timestamp}`;
    const teacherId = teacherEmail.trim();
    const classId = `class_${timestamp}`;

    const school: School = {
      id: schoolId,
      name: schoolName.trim(),
      createdAt: timestamp,
    };

    const teacher: Teacher = {
      id: teacherId,
      schoolId,
      name: teacherName.trim(),
      taz: teacherId,
      dob: teacherDob.trim() || "010190",
      licenseActive: false,
      createdAt: timestamp,
    };

    const classRoom: ClassRoom = {
      id: classId,
      schoolId,
      teacherId,
      name: className.trim() || "כיתת המבקרים",
      studentLimit: Math.min(12, Math.max(1, studentLimit)),
      createdAt: timestamp,
    };

    // Optimistic local state update
    set((state) => ({
      schools: [...state.schools.filter(s => s.id !== schoolId), school],
      teachers: [...state.teachers.filter(t => t.id !== teacherId), teacher],
      classes: [...state.classes.filter(c => c.id !== classId), classRoom],
    }));

    // Atomic Multi-Node Firebase RTDB update
    const updates: Record<string, any> = {};
    updates[`schools/${schoolId}`] = school;
    updates[`users/teachers/${teacherId}`] = teacher;
    updates[`classes/${classId}`] = classRoom;
    updates[`public_classes/${classId}`] = { id: classId, name: classRoom.name, schoolId };

    await update(ref(database), updates);

    // Whitelist in Firestore for Google SSO
    if (teacherEmail.includes('@')) {
      await addAuthorizedTeacherFirestore(teacherEmail.trim(), 'teacher', teacherName.trim(), schoolId).catch(console.error);
    }

    AuditLogger.log("הקמת מוסד מלאה", "admin", `מוסד: ${schoolName}, מורה: ${teacherName}, כיתה: ${className}`);
    return { school, teacher, classRoom };
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
    AuditLogger.log("יצירת מורה", "admin", `מורה חדש: ${name} (ת"ז/דוא"ל: ${taz})`);
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
    if (taz.includes('@')) {
      addAuthorizedTeacherFirestore(taz.trim(), 'teacher', name.trim(), schoolId).catch(err => console.error("Failed to add teacher to Firestore authorizedTeachers", err));
    }
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

