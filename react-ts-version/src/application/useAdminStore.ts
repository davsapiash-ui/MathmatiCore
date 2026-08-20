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
  ssoEmail: string; // Institutional Google SSO email
  dob: string; // Optional legacy DOB fallback
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

export interface AdminStoreCache {
  totalStudents: number;
  activeClassesCount: number;
  totalSchools: number;
  totalTeachers: number;
  globalStudentLimit: number;
  systemHealth: 'OPTIMAL' | 'DEGRADED' | 'MAINTENANCE';
  averageMasteryScore: number;
  activityTrends: Array<{ time: string; students: number; activity: number; alerts: number }>;
  lastAggregatedAt: number;
}

interface AdminState {
  schools: School[];
  teachers: Teacher[];
  classes: ClassRoom[];
  globalStudentLimit: number;
  cache: AdminStoreCache | null;
  isSubscribed: boolean;
  
  // Actions
  initAdminSubscriptions: () => () => void;
  updateStoreCache: (partial: Partial<AdminStoreCache>) => void;
  setGlobalStudentLimit: (limit: number) => void;
  
  addSchool: (name: string) => void;
  deleteSchool: (id: string) => void;
  
  addTeacher: (schoolId: string, name: string, ssoEmail: string, dob: string) => void;
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

  resetInstitutionsToOfficialPilot: () => Promise<void>;
}

let adminUnsubscribes: Unsubscribe[] = [];

export const useAdminStore = create<AdminState>()((set, get) => ({
  schools: [],
  teachers: [],
  classes: [],
  globalStudentLimit: 12,
  cache: {
    totalStudents: 12,
    activeClassesCount: 1,
    totalSchools: 1,
    totalTeachers: 1,
    globalStudentLimit: 12,
    systemHealth: 'OPTIMAL',
    averageMasteryScore: 82,
    activityTrends: [
      { time: 'שבוע 1', students: 12, activity: 48, alerts: 0 },
      { time: 'שבוע 2', students: 12, activity: 56, alerts: 1 },
      { time: 'שבוע 3', students: 12, activity: 64, alerts: 0 },
      { time: 'שבוע 4', students: 12, activity: 72, alerts: 0 },
    ],
    lastAggregatedAt: Date.now(),
  },
  isSubscribed: false,

  updateStoreCache: (partial) => {
    set((state) => ({
      cache: state.cache ? { ...state.cache, ...partial, lastAggregatedAt: Date.now() } : null
    }));
  },

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

  resetInstitutionsToOfficialPilot: async () => {
    const timestamp = Date.now();
    const cleanSchool: School = {
      id: "school_bikorot",
      name: "בית ספר ביקורת",
      createdAt: timestamp,
    };
    const cleanTeacher: Teacher = {
      id: "1002220159",
      schoolId: "school_bikorot",
      name: "דוד ספיאשוילי",
      ssoEmail: "1002220159@edu-haifa.org.il",
      dob: "010190",
      licenseActive: false,
      createdAt: timestamp,
    };
    const cleanClass: ClassRoom = {
      id: "class_1",
      schoolId: "school_bikorot",
      teacherId: "1002220159",
      name: "המבקרים",
      studentLimit: 12,
      createdAt: timestamp,
    };
    const cleanPublicClass = {
      id: "class_1",
      name: "המבקרים",
      schoolId: "school_bikorot",
    };

    set({
      schools: [cleanSchool],
      teachers: [cleanTeacher],
      classes: [cleanClass],
      globalStudentLimit: 12,
    });

    const { set: firebaseSet } = await import("firebase/database");
    await firebaseSet(ref(database, 'schools'), { school_bikorot: cleanSchool });
    await firebaseSet(ref(database, 'users/teachers'), { "1002220159": cleanTeacher });
    await firebaseSet(ref(database, 'classes'), { class_1: cleanClass });
    await firebaseSet(ref(database, 'public_classes'), { class_1: cleanPublicClass });
    await firebaseSet(ref(database, 'system_control/globalStudentLimit'), 12);

    AuditLogger.log("איפוס מוסדות לפיילוט", "admin", "כל המוסדות נוקו ואופסו למבנה הפיילוט הרשמי (בית ספר ביקורת, כיתת המבקרים)");
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
    const teacherKey = teacherId.replace(/[@.#$[\]]/g, '_');
    const classId = `class_${timestamp}`;

    const school: School = {
      id: schoolId,
      name: schoolName.trim(),
      createdAt: timestamp,
    };

    const teacher: Teacher = {
      id: teacherKey,
      schoolId,
      name: teacherName.trim(),
      ssoEmail: teacherId,
      dob: teacherDob.trim() || "010190",
      licenseActive: false,
      createdAt: timestamp,
    };

    const classRoom: ClassRoom = {
      id: classId,
      schoolId,
      teacherId: teacherKey,
      name: className.trim() || "כיתת המבקרים",
      studentLimit: Math.min(12, Math.max(1, studentLimit)),
      createdAt: timestamp,
    };

    // Optimistic local state update
    set((state) => ({
      schools: [...state.schools.filter(s => s.id !== schoolId), school],
      teachers: [...state.teachers.filter(t => t.id !== teacherKey && t.ssoEmail !== teacherId), teacher],
      classes: [...state.classes.filter(c => c.id !== classId), classRoom],
    }));

    // Atomic Multi-Node Firebase RTDB update
    const updates: Record<string, any> = {};
    updates[`schools/${schoolId}`] = school;
    updates[`users/teachers/${teacherKey}`] = teacher;
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

  addTeacher: (schoolId, name, ssoEmail, dob) => {
    AuditLogger.log("יצירת מורה", "admin", `מורה חדש: ${name} (דוא"ל SSO: ${ssoEmail})`);
    const id = ssoEmail.trim();
    const teacherKey = id.replace(/[@.#$[\]]/g, '_');
    const newTeacher: Teacher = {
      id: teacherKey,
      schoolId,
      name: name.trim(),
      ssoEmail: id,
      dob: dob.trim() || "010190",
      licenseActive: false,
      createdAt: Date.now()
    };
    set((state) => ({
      teachers: [...state.teachers.filter(t => t.id !== teacherKey && t.ssoEmail !== id), newTeacher]
    }));
    firebaseSyncService.addTeacher(schoolId, name, ssoEmail, dob).catch(err => console.error("Failed to add teacher to Firebase", err));
    if (ssoEmail.includes('@')) {
      addAuthorizedTeacherFirestore(ssoEmail.trim(), 'teacher', name.trim(), schoolId).catch(err => console.error("Failed to add teacher to Firestore authorizedTeachers", err));
    }
  },

  deleteTeacher: (id) => {
    const teacher = get().teachers.find(t => t.id === id || t.ssoEmail === id);
    if (teacher) AuditLogger.log("מחיקת מורה", "admin", `מורה נמחק: ${teacher.name}`);
    set((state) => ({
      teachers: state.teachers.filter(t => t.id !== id && t.ssoEmail !== id),
      classes: state.classes.filter(c => c.teacherId !== id && c.teacherId !== teacher?.id)
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

