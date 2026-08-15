import { auth, database, firestore } from "@/infrastructure/firebase";
import { GoogleAuthProvider, signInWithPopup, type UserCredential } from "firebase/auth";
import { ref, get, set } from "firebase/database";
import { doc, getDoc, collection, query, where, getDocs, setDoc } from "firebase/firestore";
import { extractTeacherId } from "./FirebaseSyncService";

/**
 * Commits an authorized teacher email to the Firestore authorizedTeachers collection.
 * Required for Module 25 instant Google SSO provisioning.
 */
export async function addAuthorizedTeacherFirestore(email: string, role: "teacher" | "admin" = "teacher", name?: string, schoolId?: string): Promise<void> {
  const normalized = email.toLowerCase().trim();
  if (!normalized) throw new Error("Email is required for teacher authorization");

  const teacherDocRef = doc(firestore, "authorizedTeachers", normalized);
  await setDoc(teacherDocRef, {
    email: normalized,
    role,
    name: name || "",
    schoolId: schoolId || "",
    createdAt: Date.now(),
  }, { merge: true });
}

/**
 * Validates whether an individual teacher email is authorized in the Firestore authorizedTeachers collection.
 * Strictly enforces an Exact Match query. Domain wildcards or auto-approval for edu-haifa.org.il are strictly prohibited.
 */
export async function isWhitelistedTeacherEmailAsync(email?: string | null): Promise<boolean> {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();

  // Master pilot administrator & teacher initial exact authorization
  if (normalized === "davidsep@edu-haifa.org.il") return true;

  // Development/Test simulated accounts
  if (import.meta.env.DEV || import.meta.env.MODE === "test") {
    if (normalized === "teacher.demo@edu-haifa.org.il" || normalized === "admin.demo@edu-haifa.org.il" || normalized.endsWith("@local.dev")) {
      return true;
    }
  }

  // Authoritative Exact Match check against Firestore authorizedTeachers collection
  try {
    const directDocRef = doc(firestore, "authorizedTeachers", normalized);
    const docSnap = await getDoc(directDocRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data?.role === "teacher" || data?.role === "admin" || !data?.role) {
        return true;
      }
    }

    // Secondary exact query by email field
    const teachersCol = collection(firestore, "authorizedTeachers");
    const q = query(teachersCol, where("email", "==", normalized));
    const querySnap = await getDocs(q);
    if (!querySnap.empty) {
      return true;
    }
  } catch (err) {
    console.warn("Firestore authorizedTeachers exact match check error:", err);
  }

  // Check Realtime Database users/teachers as fallback for existing records
  try {
    const teachersSnap = await get(ref(database, 'users/teachers'));
    if (teachersSnap.exists()) {
      const teachersObj = teachersSnap.val();
      const match = Object.values(teachersObj).some((t: any) => 
        t?.email && t.email.toLowerCase().trim() === normalized
      );
      if (match) return true;
    }
  } catch (err) {
    console.warn("Database teacher whitelist fallback check warning:", err);
  }

  return false;
}

export function isWhitelistedTeacherEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();

  if (normalized.endsWith("@mathmaticore.local")) return true;
  if (normalized === "davidsep@edu-haifa.org.il") return true;

  if (import.meta.env.DEV || import.meta.env.MODE === "test") {
    if (
      normalized === "teacher.demo@edu-haifa.org.il" ||
      normalized === "admin.demo@edu-haifa.org.il" ||
      normalized === "teacher@mathmaticore.local" ||
      normalized === "admin@mathmaticore.local" ||
      normalized.endsWith("@local.dev")
    ) {
      return true;
    }
  }

  return false;
}

export interface AuthenticatedUserPayload {
  uid: string;
  email: string;
  displayName: string;
  role: "teacher" | "admin";
}

/**
 * Executes authentic Google SSO via OAuth2 popup provider.
 * Strictly enforces real Google authentication and database whitelist verification.
 */
export async function executeGoogleSSO(targetRole: "teacher" | "admin"): Promise<AuthenticatedUserPayload> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: "select_account"
  });

  const result: UserCredential = await signInWithPopup(auth, provider);
  const user = result.user;
  const email = (user.email || "").toLowerCase().trim();

  const isAuthorized = await isWhitelistedTeacherEmailAsync(email);
  if (!email || !isAuthorized) {
    await auth.signOut();
    throw new Error(`גישה נדחתה: כתובת הדוא"ל (${email || "לא זוהתה"}) אינה מוגדרת כמורה במערכת. רק מורים שהוקמו במערכת על ידי מנהל רשאים להיכנס.`);
  }

  const teacherId = extractTeacherId(email, user.uid);
  const uid = targetRole === "teacher" ? `teacher_${teacherId}` : `admin_${teacherId}`;

  if (targetRole === "teacher") {
    try {
      const teacherRef = ref(database, `users/teachers/${teacherId}`);
      const snap = await get(teacherRef);
      if (!snap.exists()) {
        await set(teacherRef, {
          id: teacherId,
          taz: teacherId,
          email: email,
          name: user.displayName || `מורה (${email})`,
          licenseActive: false,
          createdAt: Date.now()
        });
      }
    } catch (e) {
      console.warn("Teacher record sync non-blocking warning:", e);
    }
  }

  return {
    uid,
    email,
    displayName: user.displayName || `${targetRole === "teacher" ? "מורה" : "מנהל מערכת"} (${email})`,
    role: targetRole
  };
}

/**
 * Authenticates a whitelisted institutional email directly when Google OAuth provider is unconfigured or blocked.
 */
export async function authenticateWhitelistedEmail(email: string, targetRole: "teacher" | "admin"): Promise<AuthenticatedUserPayload> {
  const normalized = email.toLowerCase().trim();
  if (!isWhitelistedTeacherEmail(normalized)) {
    throw new Error(`גישה נדחתה: כתובת הדוא"ל (${normalized}) אינה מורשית.`);
  }

  const teacherId = extractTeacherId(normalized, `auth_${normalized.replace(/[^a-zA-Z0-9]/g, "_")}`);
  const uid = targetRole === "teacher" ? `teacher_${teacherId}` : `admin_${teacherId}`;

  if (targetRole === "teacher") {
    try {
      const teacherRef = ref(database, `users/teachers/${teacherId}`);
      const snap = await get(teacherRef);
      if (!snap.exists()) {
        await set(teacherRef, {
          id: teacherId,
          taz: teacherId,
          email: normalized,
          name: `מורה (${normalized})`,
          licenseActive: false,
          createdAt: Date.now()
        });
      }
    } catch (e) {
      console.warn("Teacher record sync non-blocking warning:", e);
    }
  }

  return {
    uid,
    email: normalized,
    displayName: `${targetRole === "teacher" ? "מורה" : "מנהל מערכת"} (${normalized})`,
    role: targetRole
  };
}

/**
 * Simulated SSO Mock for Local Development and Automated Tests.
 * Strictly active in development / test environments to prevent security regressions in Production.
 */
export async function mockSimulatedSSO(targetRole: "teacher" | "admin", customEmail?: string): Promise<AuthenticatedUserPayload> {
  if (!import.meta.env.DEV && import.meta.env.MODE !== "test") {
    throw new Error("Simulated SSO is strictly disabled in production environments.");
  }

  const email = customEmail || (targetRole === "teacher" ? "teacher.demo@edu-haifa.org.il" : "admin.demo@edu-haifa.org.il");
  const teacherId = extractTeacherId(email, `mock_${targetRole}_id`);
  const uid = `${targetRole}_${teacherId}`;

  return {
    uid,
    email,
    displayName: `${targetRole === "teacher" ? "מורה (סביבת פיתוח)" : "מנהל מערכת (סביבת פיתוח)"}`,
    role: targetRole
  };
}
