import { create } from "zustand";
import { AuditLogger } from "@/infrastructure/services/AuditLogger";
import { firebaseSyncService } from "@/infrastructure/services/FirebaseSyncService";
import { addAuthorizedTeacherFirestore, PROTECTED_STAFF_REMOVAL_ERROR } from "@/infrastructure/services/AuthService";
import { teacherRecordKey } from "@/infrastructure/services/FirebaseSyncService";
import { ref, onValue, update, type Unsubscribe } from "firebase/database";
import { collection, onSnapshot } from "firebase/firestore";
import { database, firestore } from "@/infrastructure/firebase";
import { PILOT_SCHOOL_ID, PILOT_SCHOOL_NAME, PILOT_CLASS_ID, PILOT_CLASS_NAME, PILOT_CLASS_CAPACITY, ONE_INSTITUTION_MESSAGE } from "@/core/pilotInstitution";

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
 * צוות בלבד (מורה ומנהל), ובכל זאת ככל שנשמר בו פחות — כך טוב יותר.
 */
export interface Teacher {
  id: string;
  schoolId: string;
  ssoEmail: string; // Institutional Google SSO email — the sole teacher identity (in memory only; read from authorizedTeachers)
  licenseActive: boolean;
  createdAt: number;
  /** The role in authorizedTeachers. An admin entry is never removed from the console. */
  role?: 'teacher' | 'admin';
  /** A read-only staff entry (the lecturers, owner decision 11.10.2026); never removed from the console. */
  readOnly?: boolean;
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
  
  // No deleteSchool and no deleteClassRoom (owner, 11.10.2026): the pilot's
  // one school and one class are not deleted from the console, and a staff
  // member is never removed by deleting a school.
  addSchool: (name: string) => void;

  /** Resolves once the RTDB record AND the login whitelist are written; rejects (and rolls back) otherwise. */
  addTeacher: (schoolId: string, ssoEmail: string) => Promise<Teacher>;
  /** Refuses (rejects) an admin entry or a read-only entry. */
  deleteTeacher: (id: string) => Promise<void>;

  addClassRoom: (schoolId: string, teacherId: string, name: string, classType?: string) => Promise<void>;

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
 * Module 25 §ב.3: "כתובות הדוא"ל של אנשי הצוות נשמרות רק לצורך הזדהות, ברשימת
 * המורשים (authorizedTeachers) וב-Firebase Auth". The console's staff list is
 * that collection — the RTDB users/teachers node keeps no address any more,
 * and its presence stubs and login-time records are no longer read.
 *
 * `id` is the key every other path already uses for the teacher (class
 * teacherId, the teacher–admin chat): teacherRecordKey(email), computed here
 * in memory. The pilot has one school (Module 25 §ב.1), so an entry without a
 * school belongs to it.
 */
export function staffFromAuthorizedTeachers(docs: Array<{ id: string; data: Record<string, unknown> | undefined }>): Teacher[] {
  const out: Teacher[] = [];
  for (const { id, data } of docs) {
    const d = data || {};
    const email = String((typeof d.email === 'string' && d.email) || id || '').toLowerCase().trim();
    if (!email.includes('@')) continue;
    out.push({
      id: teacherRecordKey(email),
      schoolId: typeof d.schoolId === 'string' && d.schoolId ? d.schoolId : PILOT_SCHOOL_ID,
      ssoEmail: email,
      licenseActive: false,
      createdAt: typeof d.createdAt === 'number' ? d.createdAt : 0,
      role: d.role === 'admin' ? 'admin' : 'teacher',
      ...(d.readOnly === true ? { readOnly: true } : {}),
    });
  }
  return out;
}

/** An admin entry or a read-only entry: shown in the console, never removed from it (owner, 11.10.2026). */
export function isProtectedStaff(t: Pick<Teacher, 'role' | 'readOnly'> | null | undefined): boolean {
  return t?.role === 'admin' || t?.readOnly === true;
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

      adminUnsubscribes = [unsubSchools, unsubClasses, unsubLimit];
      set({ isSubscribed: true });
    } catch (e) {
      console.error("Failed to initialize admin subscriptions:", e);
    }

    // The staff list: authorizedTeachers (Module 25 §ב.3), not users/teachers.
    // Its own try: a failure here leaves the RTDB listeners above running.
    try {
      const unsubStaff = onSnapshot(collection(firestore, 'authorizedTeachers'), (snap) => {
        const docs: Array<{ id: string; data: Record<string, unknown> | undefined }> = [];
        snap.forEach((d) => { docs.push({ id: d.id, data: d.data() as Record<string, unknown> | undefined }); });
        set({ teachers: staffFromAuthorizedTeachers(docs) });
      }, (err) => console.error("Error subscribing to authorizedTeachers:", err));
      if (typeof unsubStaff === 'function') adminUnsubscribes.push(unsubStaff);
    } catch (e) {
      console.error("Failed to subscribe to authorizedTeachers:", e);
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
    // Module 25 §ב.3: the RTDB record carries no e-mail address.
    const cleanTeacherRecord = {
      id: pilotTeacherKey,
      schoolId: "school_bikorot",
      licenseActive: false,
      createdAt: timestamp,
    };
    // The pilot address keeps whatever role and readOnly mark it has in
    // authorizedTeachers (owner, 11.10.2026: never downgrade an admin).
    const listedPilot = get().teachers.find((t) => t.id === pilotTeacherKey);
    const cleanTeacher: Teacher = {
      ...cleanTeacherRecord,
      ssoEmail: pilotTeacherEmail,
      ...(listedPilot?.role ? { role: listedPilot.role } : {}),
      ...(listedPilot?.readOnly ? { readOnly: true } : {}),
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

    // Owner, 11.10.2026: this reset never removes a staff member. Every teacher
    // and every read-only lecturer keeps their record and their login right;
    // only the school and class structure returns to the pilot's.
    const keptTeachers = get().teachers.filter((t) => t.id && t.id !== pilotTeacherKey);

    set({
      schools: [cleanSchool],
      teachers: [cleanTeacher, ...keptTeachers],
      classes: [cleanClass],
      globalStudentLimit: 12,
    });

    const { set: firebaseSet } = await import("firebase/database");
    await firebaseSet(ref(database, 'schools'), { school_bikorot: cleanSchool });

    // חוקי ה-RTDB מתירים כתיבה למנהל תחת `users/teachers/$teacherId` — ולא
    // על הצומת `users/teachers` עצמו, שאין לו כלל `.write`. כתיבה מלאה של
    // הצומת נדחתה תמיד, וכיוון שהיא הופיעה אחרי כתיבת בתי הספר, האיפוס
    // נשבר באמצע: בתי הספר כבר נמחקו, המורות נשארו, והמסך הציג "שגיאה
    // באיפוס מוסדות הפיילוט". עדכון רב-נתיבי נבדק מול כל ילד בנפרד, ולכן
    // עובר — ונשאר פעולה אחת שלמה.
    await update(ref(database, 'users/teachers'), { [pilotTeacherKey]: cleanTeacherRecord });
    await firebaseSet(ref(database, 'classes'), { class_1: cleanClass });
    await firebaseSet(ref(database, 'public_classes'), { class_1: cleanPublicClass });
    await firebaseSet(ref(database, 'system_control/globalStudentLimit'), 12);
    // The reset must leave the pilot teacher able to sign in. A swallowed
    // failure here left the console showing a teacher who exists but cannot
    // log in — and the reset reported success. Let it surface.
    // An existing authorizedTeachers document keeps its role (an admin stays an
    // admin): addAuthorizedTeacherFirestore writes the role only to a new one.
    await addAuthorizedTeacherFirestore(pilotTeacherEmail, 'teacher', cleanSchool.id);

    AuditLogger.log("איפוס מוסדות לפיילוט", "admin", "המוסדות אופסו למבנה הפיילוט הרשמי (בית ספר ביקורת, כיתת המבקרים); המורות והמרצות נשארו");
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

  // Module 25 §ב.1: one school, "בית ספר ביקורת", and one class, "המבקרים".
  // Ids and names come from the spec, never from the form, and a second
  // institution is refused rather than created next to the first.
  provisionFullInstitution: async ({
    teacherEmail,
    classType,
    studentLimit = 12,
  }) => {
    if (get().schools.length > 0 || get().classes.length > 0) {
      throw new Error(ONE_INSTITUTION_MESSAGE);
    }
    const timestamp = Date.now();
    const schoolId = PILOT_SCHOOL_ID;
    const teacherId = teacherEmail.trim().toLowerCase();
    const teacherKey = teacherRecordKey(teacherId);
    const classId = PILOT_CLASS_ID;

    const school: School = {
      id: schoolId,
      name: PILOT_SCHOOL_NAME,
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
      name: PILOT_CLASS_NAME,
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
    // Module 25 §ב.3: no e-mail address in RTDB — the address is in authorizedTeachers (below).
    updates[`users/teachers/${teacherKey}`] = { id: teacherKey, schoolId, licenseActive: false, createdAt: timestamp };
    updates[`classes/${classId}`] = classRoom;
    updates[`public_classes/${classId}`] = { id: classId, name: classRoom.name, schoolId };

    await update(ref(database), updates);

    // Module 25 §ד: the class document in Firestore, with the class type the admin chose.
    await firebaseSyncService.writeClassDocument(classType);

    // Whitelist in Firestore for Google SSO — this is what lets the teacher in,
    // so a failure here fails the wizard instead of being logged and forgotten.
    if (teacherEmail.includes('@')) {
      await addAuthorizedTeacherFirestore(teacherId, 'teacher', schoolId);
    }

    AuditLogger.log("הקמת מוסד מלאה", "admin", `מוסד: ${PILOT_SCHOOL_NAME}, מורה: ${teacherId}, כיתה: ${PILOT_CLASS_NAME}`);
    return { school, teacher, classRoom };
  },

  // Module 25 §ב.1: the pilot has exactly one school, "בית ספר ביקורת". Its name
  // is fixed by the spec, so the argument is ignored, and a second school is
  // refused rather than created.
  addSchool: (_name) => {
    if (get().schools.length > 0) {
      console.warn(ONE_INSTITUTION_MESSAGE);
      return;
    }
    AuditLogger.log("יצירת מוסד", "admin", `מוסד: ${PILOT_SCHOOL_NAME}`);
    const newSchool: School = { id: PILOT_SCHOOL_ID, name: PILOT_SCHOOL_NAME, createdAt: Date.now() };
    set((state) => ({ schools: [...state.schools, newSchool] }));
    firebaseSyncService.addSchool(PILOT_SCHOOL_NAME, PILOT_SCHOOL_ID).catch(err => {
      set((state) => ({ schools: state.schools.filter(s => s.id !== PILOT_SCHOOL_ID) }));
      console.error("Failed to add school to Firebase", err);
    });
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
    // Owner, 11.10.2026: an admin entry or a read-only entry (the lecturers)
    // is never removed. The service refuses it too, from authorizedTeachers.
    if (isProtectedStaff(teacher)) {
      throw new Error(PROTECTED_STAFF_REMOVAL_ERROR);
    }
    const key = teacher?.id ?? id;
    const previous = { teachers: get().teachers, classes: get().classes };
    // A class is never deleted with its teacher (see FirebaseSyncService.deleteTeacher):
    // it is handed to another teacher of the same school when there is one —
    // a teacher, not an admin or a read-only entry.
    const successor = get().teachers.find(t => t.id !== key && t.schoolId === teacher?.schoolId && !isProtectedStaff(t));
    set((state) => ({
      teachers: state.teachers.filter(t => t.id !== key && t.ssoEmail !== id),
      classes: state.classes.map(c => c.teacherId === key && successor ? { ...c, teacherId: successor.id } : c),
    }));
    try {
      // Not on the console's list: the service reads the old record and chooses itself.
      await firebaseSyncService.deleteTeacher(key, teacher ? { email: teacher.ssoEmail, successorId: successor?.id ?? null } : {});
      if (teacher) AuditLogger.log("מחיקת מורה", "admin", `מורה נמחק: ${teacher.ssoEmail}`);
    } catch (err) {
      set(previous);
      console.error("Failed to delete teacher from Firebase", err);
      throw err;
    }
  },

  // Module 25 §ב.1: exactly one class, "המבקרים". A second class is refused —
  // learners are identified by number alone (1–12), so it would share the first
  // class's identities, progress and reports.
  addClassRoom: async (schoolId, teacherId, _name, classType) => {
    if (get().classes.length > 0) {
      throw new Error(ONE_INSTITUTION_MESSAGE);
    }
    const tempId = PILOT_CLASS_ID;
    const newClass: ClassRoom = {
      id: tempId,
      schoolId,
      teacherId,
      name: PILOT_CLASS_NAME,
      studentLimit: PILOT_CLASS_CAPACITY,
      createdAt: Date.now(),
      ...(classType ? { classType } : {}),
    };
    set((state) => ({ classes: [...state.classes, newClass] }));
    try {
      const realClass = await firebaseSyncService.addClassRoom(schoolId, teacherId, PILOT_CLASS_NAME, tempId, classType);
      if (realClass && realClass.id !== tempId) {
        set((state) => ({ classes: state.classes.map(c => c.id === tempId ? realClass : c) }));
      }
      AuditLogger.log("יצירת כיתה", "admin", `כיתה: ${PILOT_CLASS_NAME}`);
    } catch (err) {
      // כיתה שנכשלה בשרת נעלמת מהמסך במקום להישאר ככיתה מדומה שמורה
      // תשובץ אליה ולא תמצא בה דבר.
      set((state) => ({ classes: state.classes.filter(c => c.id !== tempId) }));
      console.error("Failed to add class to Firebase", err);
      throw err;
    }
  },
}));

