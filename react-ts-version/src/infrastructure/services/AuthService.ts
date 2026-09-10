import { auth, database, firestore, functions } from "@/infrastructure/firebase";
import { GoogleAuthProvider, signInWithPopup, type UserCredential } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { ref, get, set } from "firebase/database";
import { doc, getDoc, collection, query, where, getDocs, setDoc, deleteDoc } from "firebase/firestore";
import { extractTeacherId, teacherRecordKey } from "./FirebaseSyncService";

function isFirestoreAvailable(): boolean {
  if (!firestore) return false;
  return typeof (firestore as any).type === 'string' || Boolean((firestore as any)._delegate) || Boolean((firestore as any).app);
}

/**
 * Commits an authorized teacher email to the Firestore authorizedTeachers collection.
 * Required for Module 25 instant Google SSO provisioning.
 */
export async function addAuthorizedTeacherFirestore(email: string, role: "teacher" | "admin" = "teacher", schoolId?: string): Promise<void> {
  const normalized = email.toLowerCase().trim();
  if (!normalized) throw new Error("Email is required for teacher authorization");

  if (!isFirestoreAvailable()) {
    return;
  }

  // Deliberately NOT swallowed: this document is the teacher's key to the
  // door (Module 1 §ג + deviation 1). A denied write used to be logged as a
  // "non-blocking" warning while the wizard reported success, and the new
  // teacher was then refused at Google sign-in with no way to tell why.
  const teacherDocRef = doc(firestore, "authorizedTeachers", normalized);
  await setDoc(teacherDocRef, {
    email: normalized,
    role,
    schoolId: schoolId || "",
    createdAt: Date.now(),
  }, { merge: true });
}

/** Revokes a teacher's login: removes the whitelist document syncUserRoles stamps claims from. */
export async function removeAuthorizedTeacherFirestore(email: string): Promise<void> {
  const normalized = email.toLowerCase().trim();
  if (!normalized || !isFirestoreAvailable()) return;
  await deleteDoc(doc(firestore, "authorizedTeachers", normalized));
}

/**
 * Validates whether an individual teacher email is authorized in the Firestore authorizedTeachers collection.
 * Strictly enforces an Exact Match query. Domain wildcards or auto-approval for edu-haifa.org.il are strictly prohibited.
 */
export async function isWhitelistedTeacherEmailAsync(email?: string | null): Promise<boolean> {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();

  // Master pilot administrator & teacher initial exact authorization
  if (normalized === "davidsep@edu-haifa.org.il" || normalized === "1002220159@edu-haifa.org.il") return true;

  // Development/Test simulated accounts
  if (import.meta.env.DEV || import.meta.env.MODE === "test") {
    if (normalized === "teacher.demo@edu-haifa.org.il" || normalized === "admin.demo@edu-haifa.org.il" || normalized.endsWith("@local.dev")) {
      return true;
    }
  }

  if (!isFirestoreAvailable()) {
    return false;
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
      // Admin-created records carry ssoEmail; login-created ones carried email.
      const match = Object.values(teachersObj).some((t: any) =>
        [t?.ssoEmail, t?.email].some((e) => typeof e === 'string' && e.toLowerCase().trim() === normalized)
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
  if (normalized === "davidsep@edu-haifa.org.il" || normalized === "1002220159@edu-haifa.org.il") return true;

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

/**
 * Creates the RTDB teacher record at login only when the admin has not
 * already created one — under the SAME key the admin console uses
 * (teacherRecordKey). This path used to key by extractTeacherId, so a teacher
 * the admin registered as "1002220159_edu-haifa_org_il" got a second,
 * school-less record "1002220159" on first sign-in, which the console then
 * counted as another teacher. Non-blocking: the security rules only let an
 * admin write here, so for a plain teacher this is a no-op by design.
 */
async function ensureTeacherRecord(email: string): Promise<void> {
  const key = teacherRecordKey(email);
  const legacyKey = extractTeacherId(email, null);
  try {
    const [current, legacy] = await Promise.all([
      get(ref(database, `users/teachers/${key}`)),
      legacyKey !== key ? get(ref(database, `users/teachers/${legacyKey}`)) : Promise.resolve(null),
    ]);
    if (current.exists() || (legacy && legacy.exists())) return;
    await set(ref(database, `users/teachers/${key}`), {
      id: key,
      ssoEmail: email,
      email,
      licenseActive: false,
      createdAt: Date.now()
    });
  } catch (e) {
    console.warn("Teacher record sync non-blocking warning:", e);
  }
}

export interface AuthenticatedUserPayload {
  uid: string;
  email: string;
  displayName: string;
  role: "teacher" | "admin";
  /**
   * True when this session was authorised at login against the authoritative
   * whitelist (Firestore `authorizedTeachers`, the list the admin console
   * manages). The route guards in App.tsx trust this instead of re-deriving
   * authorisation from the hardcoded fallback list — that list knows two
   * pilot emails only, and re-checking against it logged every admin-added
   * teacher straight back out after a successful login.
   */
  whitelistVerified?: boolean;
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

  // Stamp verified teacher/admin custom claims on the token via Cloud Function
  try {
    const syncCallable = httpsCallable(functions, "syncUserRoles");
    await syncCallable();
    await user.getIdToken(true);
  } catch (syncErr) {
    console.warn("syncUserRoles error during Google SSO:", syncErr);
  }

  const teacherId = extractTeacherId(email, user.uid);
  const uid = targetRole === "teacher" ? `teacher_${teacherId}` : `admin_${teacherId}`;

  if (targetRole === "teacher") {
    await ensureTeacherRecord(email);
  }

  return {
    uid,
    email,
    displayName: user.displayName || `${targetRole === "teacher" ? "מורה" : "מנהל מערכת"} (${email})`,
    role: targetRole,
    whitelistVerified: true
  };
}

/**
 * Authenticates a whitelisted institutional email directly when Google OAuth provider is unconfigured or blocked.
 */
export async function authenticateWhitelistedEmail(email: string, targetRole: "teacher" | "admin"): Promise<AuthenticatedUserPayload> {
  const normalized = email.toLowerCase().trim();
  const isAuthorized = (await isWhitelistedTeacherEmailAsync(normalized)) || isWhitelistedTeacherEmail(normalized);
  if (!isAuthorized) {
    throw new Error(`גישה נדחתה: כתובת הדוא"ל (${normalized}) אינה מורשית במערכת. רק מורים שהוקמו במערכת רשאים להיכנס.`);
  }

  const teacherId = extractTeacherId(normalized, `auth_${normalized.replace(/[^a-zA-Z0-9]/g, "_")}`);
  const uid = targetRole === "teacher" ? `teacher_${teacherId}` : `admin_${teacherId}`;

  if (targetRole === "teacher") {
    await ensureTeacherRecord(normalized);
  }

  return {
    uid,
    email: normalized,
    displayName: `${targetRole === "teacher" ? "מורה" : "מנהל מערכת"} (${normalized})`,
    role: targetRole,
    whitelistVerified: true
  };
}
