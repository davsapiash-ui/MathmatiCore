// Harness only (scratchpad). Seeds the emulator: identities with custom claims
// set directly in the Auth emulator, a class of 12 learners in RTDB, and the
// session documents. No real credentials; demo project.
import { createRequire } from "module";
const require = createRequire("/home/user/MathmatiCore/functions/package.json");
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";
const admin = require("firebase-admin");
import { writeFileSync } from "fs";

admin.initializeApp({ projectId: "demo-mathmaticore", databaseURL: "http://127.0.0.1:9000?ns=demo-mathmaticore-default-rtdb" });
const PHASE = process.env.PHASE; // "before" | "after"

const TEACHER = { teacher: true, admin: false, role: "teacher", class_id: "class_1", roles: ["TEACHER"] };
// What syncUserRoles stamped on every admin sign-in before this change, and after it.
const ADMIN_BEFORE = { admin: true, teacher: true, role: "admin", roles: ["TEACHER", "ADMIN"] };
const ADMIN_AFTER = { admin: true, teacher: false, role: "admin", roles: ["ADMIN"] };
const STUDENT12 = { role: "student", student_id: 12, class_id: "class_1", roles: ["STUDENT"] };

const ids = {
  teacher: { uid: "teacher_pilot", email: "pilot.teacher@edu-haifa.org.il", claims: TEACHER },
  admin: { uid: "owner_admin", email: "owner@edu-haifa.org.il", claims: PHASE === "before" ? ADMIN_BEFORE : ADMIN_AFTER },
  student12: { uid: "anon_student12", claims: STUDENT12 },
};

const tokens = {};
for (const [k, v] of Object.entries(ids)) {
  try { await admin.auth().deleteUser(v.uid); } catch {}
  await admin.auth().createUser({ uid: v.uid, ...(v.email ? { email: v.email, emailVerified: true } : {}) });
  await admin.auth().setCustomUserClaims(v.uid, v.claims);
  tokens[k] = await admin.auth().createCustomToken(v.uid);
}
writeFileSync(new URL("./tokens.json", import.meta.url), JSON.stringify(tokens));

const fs = admin.firestore();
await fs.doc("authorizedTeachers/pilot.teacher@edu-haifa.org.il").set({ email: "pilot.teacher@edu-haifa.org.il", role: "teacher" });
await fs.doc("authorizedTeachers/owner@edu-haifa.org.il").set({ email: "owner@edu-haifa.org.il", role: "admin" });
await fs.doc("classes/class_1").set({ class_id: "class_1", school_id: "school_bikorot", class_name: "המבקרים", class_type: "כיתת ביקורת", teacher_id: "pilot_teacher_edu-haifa_org_il", student_count: 12 });
await fs.doc("store_cache/admin_metrics").set({ totalSchools: 1, totalTeachers: 1, totalStudents: 12, updatedAt: Date.now() });
for (let n = 1; n <= 12; n++) {
  await fs.doc(`students/student_user${n}`).set({ student_id: n, class_id: "class_1", school_id: "school_bikorot", created_at: Date.now() });
}
for (const n of [1, 2, 3, 4, 5]) {
  await fs.doc(`sessions/session_02_student_${n}`).set({
    session_id: `session_02_student_${n}`, class_id: "class_1", session_number: 2, is_completed: true,
    session_score_percent: 60, matrix_recommended_path: "green_path", teacher_gate_approved: false,
  });
}

const db = admin.database();
await db.ref().set(null);
await db.ref("schools/school_bikorot").set({ id: "school_bikorot", name: "בית ספר ביקורת", createdAt: Date.now() });
await db.ref("users/teachers/pilot_teacher_edu-haifa_org_il").set({ id: "pilot_teacher_edu-haifa_org_il", schoolId: "school_bikorot", ssoEmail: "pilot.teacher@edu-haifa.org.il", licenseActive: true, createdAt: Date.now() });
await db.ref("classes/class_1").set({ id: "class_1", schoolId: "school_bikorot", teacherId: "pilot_teacher_edu-haifa_org_il", name: "המבקרים", studentLimit: 12, createdAt: Date.now() });
await db.ref("public_classes/class_1").set({ id: "class_1", name: "המבקרים", schoolId: "school_bikorot" });
await db.ref("system_control/globalStudentLimit").set(12);
await db.ref("active_class_session").set({ active: true, status: "active", sessionNumber: 2, startedAt: Date.now(), teacherId: "teacher_pilot" });

const gate = { completedMeeting2: true, highestCompletedMeeting: 2, teacher_gate_approved: false, routeStatus: "PENDING_TEACHER_APPROVAL", matrix_recommended_path: "green_path" };
const learners = {
  1: { ...gate, isOnline: false, lastPing: Date.now() - 60000, hasJoinedSession: true },
  2: { ...gate, isOnline: true, isSocraticActive: true },
  3: { ...gate, isOnline: true, hesitating: { hesitating: true, timestamp: Date.now() - 20000 } },
  4: { ...gate, isOnline: true },
  5: { ...gate, isOnline: true, helpRequested: true },
  6: { isOnline: true, highestCompletedMeeting: 1 },
};
for (let n = 1; n <= 12; n++) {
  await db.ref(`users/students/student_user${n}`).set({ student_id: n, ...(learners[n] || { isOnline: false }) });
}
console.log("seeded", PHASE);

// Keep the online learners' heartbeat fresh (the radar requires a ping within 12 s).
if (process.env.HEARTBEAT) {
  setInterval(async () => {
    for (const n of [2, 3, 4, 5, 6]) await db.ref(`users/students/student_user${n}/lastPing`).set(Date.now());
  }, 3000);
} else {
  process.exit(0);
}
