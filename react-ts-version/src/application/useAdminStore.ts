import { create } from "zustand";
import { AuditLogger } from "@/infrastructure/services/AuditLogger";
import { firebaseSyncService } from "@/infrastructure/services/FirebaseSyncService";
import { addAuthorizedTeacherFirestore } from "@/infrastructure/services/AuthService";
import { teacherRecordKey } from "@/infrastructure/services/FirebaseSyncService";
import { ref, onValue, update, type Unsubscribe } from "firebase/database";
import { database } from "@/infrastructure/firebase";

export interface School {
  id: string;
  name: string;
  createdAt: number;
}

/**
 * זהות המורה היא כתובת הדוא"ל המוסדית ברשימה הלבנה — ותו לא.
 * שדות `name` ו-`dob` הוסרו: שם המורה אינו נדרש לשום החלטה במערכת,
 * ו-`dob` מעולם לא נאסף בפועל (התיבה לא הייתה מחוברת לשום קלט, כך
 * שנשמר בו אותו ערך קבוע לכל מורה). צומת `users/teachers` נקרא בידי
 * כל משתמש מחובר, ולכן ככל שנשמר בו פחות — כך טוב יותר.
 */
export interface Teacher {
  id: string;
  schoolId: string;
  ssoEmail: string; // Institutional Google SSO email — the sole teacher identity
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
  /** Module 4 / 25 class_type (e.g. "קבוצת ביקורת פיילוט"); optional for records created before it was persisted. */
  classType?: string;
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
  setGlobalStudentLimit: (limit: number) => Promise<void>;
  
  addSchool: (name: string) => void;
  deleteSchool: (id: string) => Promise<void>;
  
  /** Resolves once the RTDB record AND the login whitelist are written; rejects (and rolls back) otherwise. */
  addTeacher: (schoolId: string, ssoEmail: string) => Promise<Teacher>;
  deleteTeacher: (id: string) => Promise<void>;
  
  addClassRoom: (schoolId: string, teacherId: string, name: string, classType?: string) => Promise<void>;
  deleteClassRoom: (id: string) => Promise<void>;

  provisionFullInstitution: (params: {
    schoolName: string;
    teacherEmail: string;
    className: string;
    classType?: string;
    studentLimit?: number;
  }) => Promise<{ school: School; teacher: Teacher; classRoom: ClassRoom }>;

  resetInstitutionsToOfficialPilot: () => Promise<void>;
}

/**
 * users/teachers also receives presence stubs ({isOnline, lastPing}) from the
 * teacher dashboard and login-time records that carry `email` instead of
 * `ssoEmail`. Only a record with an e-mail is a teacher the console can show,
 * count, or address; presence stubs are dropped rather than counted as staff.
 */
export function normalizeTeacherRecords(val: Record<string, unknown>): Teacher[] {
  const out: Teacher[] = [];
  for (const [key, raw] of Object.entries(val || {})) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Partial<Teacher> & { email?: string };
    const email = typeof r.ssoEmail === 'string' && r.ssoEmail ? r.ssoEmail : typeof r.email === 'string' ? r.email : '';
    if (!email) continue;
    out.push({
      id: r.id || key,
      schoolId: r.schoolId || '',
      ssoEmail: email.toLowerCase().trim(),
      licenseActive: Boolean(r.licenseActive),
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
    });
  }
  return out;
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
          set({ teachers: normalizeTeacherRecords(val) });
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
    const pilotTeacherEmail = "1002220159@edu-haifa.org.il";
    const pilotTeacherKey = teacherRecordKey(pilotTeacherEmail);
    const cleanTeacher: Teacher = {
      id: pilotTeacherKey,
      schoolId: "school_bikorot",
      ssoEmail: pilotTeacherEmail,
      licenseActive: false,
      createdAt: timestamp,
    };
    const cleanClass: ClassRoom = {
      id: "class_1",
      schoolId: "school_bikorot",
      teacherId: pilotTeacherKey,
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
    await firebaseSet(ref(database, 'users/teachers'), { [pilotTeacherKey]: cleanTeacher });
    await firebaseSet(ref(database, 'classes'), { class_1: cleanClass });
    await firebaseSet(ref(database, 'public_classes'), { class_1: cleanPublicClass });
    await firebaseSet(ref(database, 'system_control/globalStudentLimit'), 12);
    // The reset must leave the pilot teacher able to sign in. A swallowed
    // failure here left the console showing a teacher who exists but cannot
    // log in — and the reset reported success. Let it surface.
    await addAuthorizedTeacherFirestore(pilotTeacherEmail, 'teacher', cleanSchool.id);

    AuditLogger.log("איפוס מוסדות לפיילוט", "admin", "כל המוסדות נוקו ואופסו למבנה הפיילוט הרשמי (בית ספר ביקורת, כיתת המבקרים)");
  },

  setGlobalStudentLimit: async (limit) => {
    const previous = get().globalStudentLimit;
    set({ globalStudentLimit: limit });
    try {
      await firebaseSyncService.setGlobalStudentLimit(limit);
      AuditLogger.log("עדכון מגבלת תלמידים", "admin", `מגבלה גלובלית חדשה: ${limit}`);
    } catch (err) {
      // המגבלה נשמרה במסך אבל לא בשרת — כיתות חדשות היו נפתחות במגבלה
      // הישנה בזמן שהמנהל רואה את החדשה.
      set({ globalStudentLimit: previous });
      console.error("Failed to set global student limit in Firebase", err);
      throw err;
    }
  },

  provisionFullInstitution: async ({
    schoolName,
    teacherEmail,
    className,
    classType,
    studentLimit = 12,
  }) => {
    const timestamp = Date.now();
    const schoolId = `school_${timestamp}`;
    const teacherId = teacherEmail.trim().toLowerCase();
    const teacherKey = teacherRecordKey(teacherId);
    const classId = `class_${timestamp}`;

    const school: School = {
      id: schoolId,
      name: schoolName.trim(),
      createdAt: timestamp,
    };

    const teacher: Teacher = {
      id: teacherKey,
      schoolId,
      ssoEmail: teacherId,
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
      ...(classType ? { classType } : {}),
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

    // Whitelist in Firestore for Google SSO — this is what lets the teacher in,
    // so a failure here fails the wizard instead of being logged and forgotten.
    if (teacherEmail.includes('@')) {
      await addAuthorizedTeacherFirestore(teacherId, 'teacher', schoolId);
    }

    AuditLogger.log("הקמת מוסד מלאה", "admin", `מוסד: ${schoolName}, מורה: ${teacherId}, כיתה: ${className}`);
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

  // מחיקת מוסד מסירה יחד איתו את המורות שלו — ואת הרשאות הכניסה שלהן.
  // עד כה המחיקה בוצעה מקומית והכתיבה לשרת נשלחה בלי להמתין לה, כך
  // שכשל בשרת הותיר את המנהל עם הודעת "נמחק" בזמן שהמוסד, המורות
  // וההרשאות שלהן ממשיכים להתקיים. אותו דפוס בדיוק כמו deleteTeacher:
  // עדכון אופטימי, החזרה לאחור בכשל, וזריקת השגיאה החוצה.
  deleteSchool: async (id) => {
    const school = get().schools.find(s => s.id === id);
    const previous = { schools: get().schools, teachers: get().teachers, classes: get().classes };
    set((state) => ({
      schools: state.schools.filter(s => s.id !== id),
      teachers: state.teachers.filter(t => t.schoolId !== id),
      classes: state.classes.filter(c => c.schoolId !== id)
    }));
    try {
      await firebaseSyncService.deleteSchool(id);
      if (school) AuditLogger.log("מחיקת מוסד", "admin", `מוסד נמחק: ${school.name}`);
    } catch (err) {
      set(previous);
      console.error("Failed to delete school from Firebase", err);
      throw err;
    }
  },

  addTeacher: async (schoolId, ssoEmail) => {
    const id = ssoEmail.trim().toLowerCase();
    const teacherKey = teacherRecordKey(id);
    const previous = get().teachers;
    const newTeacher: Teacher = {
      id: teacherKey,
      schoolId,
      ssoEmail: id,
      licenseActive: false,
      createdAt: Date.now()
    };
    // Optimistic: the card shows the teacher at once; a failed write below rolls it back.
    set((state) => ({
      teachers: [...state.teachers.filter(t => t.id !== teacherKey && t.ssoEmail !== id), newTeacher]
    }));
    try {
      const saved = await firebaseSyncService.addTeacher(schoolId, id);
      AuditLogger.log("יצירת מורה", "admin", `מורה חדש (דוא"ל SSO): ${id}`);
      return saved;
    } catch (err) {
      set({ teachers: previous });
      console.error("Failed to add teacher", err);
      throw err;
    }
  },

  deleteTeacher: async (id) => {
    const teacher = get().teachers.find(t => t.id === id || t.ssoEmail === id);
    const key = teacher?.id ?? id;
    const previous = { teachers: get().teachers, classes: get().classes };
    // A class is never deleted with its teacher (see FirebaseSyncService.deleteTeacher):
    // it is handed to another teacher of the same school when there is one.
    const successor = get().teachers.find(t => t.id !== key && t.schoolId === teacher?.schoolId);
    set((state) => ({
      teachers: state.teachers.filter(t => t.id !== key && t.ssoEmail !== id),
      classes: state.classes.map(c => c.teacherId === key && successor ? { ...c, teacherId: successor.id } : c),
    }));
    try {
      await firebaseSyncService.deleteTeacher(key);
      if (teacher) AuditLogger.log("מחיקת מורה", "admin", `מורה נמחק: ${teacher.ssoEmail}`);
    } catch (err) {
      set(previous);
      console.error("Failed to delete teacher from Firebase", err);
      throw err;
    }
  },

  addClassRoom: async (schoolId, teacherId, name, classType) => {
    const tempId = `class_${Date.now()}`;
    const limit = get().globalStudentLimit;
    const newClass: ClassRoom = {
      id: tempId,
      schoolId,
      teacherId,
      name: name.trim(),
      studentLimit: limit,
      createdAt: Date.now(),
      ...(classType ? { classType } : {}),
    };
    set((state) => ({ classes: [...state.classes, newClass] }));
    try {
      const realClass = await firebaseSyncService.addClassRoom(schoolId, teacherId, name, tempId, classType);
      if (realClass && realClass.id !== tempId) {
        set((state) => ({ classes: state.classes.map(c => c.id === tempId ? realClass : c) }));
      }
      AuditLogger.log("יצירת כיתה", "admin", `כיתה חדשה: ${name}`);
    } catch (err) {
      // כיתה שנכשלה בשרת נעלמת מהמסך במקום להישאר ככיתה מדומה שמורה
      // תשובץ אליה ולא תמצא בה דבר.
      set((state) => ({ classes: state.classes.filter(c => c.id !== tempId) }));
      console.error("Failed to add class to Firebase", err);
      throw err;
    }
  },

  deleteClassRoom: async (id) => {
    const classRoom = get().classes.find(c => c.id === id);
    const previous = get().classes;
    set((state) => ({ classes: state.classes.filter(c => c.id !== id) }));
    try {
      await firebaseSyncService.deleteClassRoom(id);
      if (classRoom) AuditLogger.log("מחיקת כיתה", "admin", `כיתה נמחקה: ${classRoom.name}`);
    } catch (err) {
      set({ classes: previous });
      console.error("Failed to delete class from Firebase", err);
      throw err;
    }
  }
}));

