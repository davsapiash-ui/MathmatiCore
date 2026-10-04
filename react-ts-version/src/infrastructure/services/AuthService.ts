import { auth, database, firestore, functions } from "@/infrastructure/firebase";
import { GoogleAuthProvider, signInWithPopup, type UserCredential } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { ref, get, set } from "firebase/database";
import { doc, getDoc, collection, query, where, getDocs, setDoc, deleteDoc } from "firebase/firestore";
import { extractTeacherId, teacherRecordKey } from "./FirebaseSyncService";
import { claimsMatchRole } from "./staffRoleClaims";

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
  // door (Module 1 §ג; the spec sets no domain filter). A denied write used to be logged as a
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
  const ref = doc(firestore, "authorizedTeachers", normalized);
  // Removing a teacher never removes an admin: the owner's own address can
  // also sit in the teacher list (dual account, register gap יא), and deleting
  // its entry would strip the admin's claims (revokeRemovedStaff).
  const existing = await getDoc(ref);
  if (existing.exists() && existing.data()?.role === "admin") return;
  await deleteDoc(ref);
}

/**
 * Validates whether an individual teacher email is authorized in the Firestore authorizedTeachers collection.
 * Strictly enforces an Exact Match query. Domain wildcards or auto-approval for edu-haifa.org.il are strictly prohibited.
 */
export async function isWhitelistedTeacherEmailAsync(email?: string | null): Promise<boolean> {
  // A list that could not be read authorises nobody (fail-closed).
  return (await whitelistedStaffRoleAsync(email).catch(() => null)) !== null;
}

/** The whitelist could not be read at all (offline, network failure): no answer, not a "no". */
export const WHITELIST_UNREACHABLE_CODE = "staff/whitelist-unreachable";

/** Firestore's codes for a read that never reached the server. A refusal by the rules is not one of them. */
function isNetworkFailure(err: unknown): boolean {
  const code = String((err as { code?: unknown } | null)?.code ?? "");
  return code === "unavailable" || code === "deadline-exceeded";
}

/**
 * The staff role the whitelist grants an address: "admin" (who may sign in as
 * either role — the owner's dual account, register gap יא), "teacher", or null
 * when the address is not on the list.
 *
 * Throws (code WHITELIST_UNREACHABLE_CODE) when the list could not be read
 * because of the network. That used to return null as well, so a listed
 * teacher whose connection dropped at this moment was refused like a stranger.
 */
export async function whitelistedStaffRoleAsync(email?: string | null): Promise<"teacher" | "admin" | null> {
  if (!email) return null;
  const normalized = email.toLowerCase().trim();

  // The two pilot addresses used to short-circuit this check. They are in
  // the whitelist like everyone else, and hardcoding them meant deleting a
  // teacher could not revoke her login. authorizedTeachers is
  // the single source of truth.

  // Development/Test simulated accounts
  if (import.meta.env.DEV || import.meta.env.MODE === "test") {
    if (normalized === "teacher.demo@edu-haifa.org.il" || normalized === "admin.demo@edu-haifa.org.il" || normalized.endsWith("@local.dev")) {
      return normalized === "teacher.demo@edu-haifa.org.il" ? "teacher" : "admin";
    }
  }

  if (!isFirestoreAvailable()) {
    return null;
  }

  // The same reading syncUserRoles makes: a listed address is the teacher's
  // unless its document says admin.
  const roleOf = (data: Record<string, unknown> | undefined): "teacher" | "admin" =>
    data?.role === "admin" ? "admin" : "teacher";

  // Authoritative Exact Match check against Firestore authorizedTeachers collection
  try {
    const directDocRef = doc(firestore, "authorizedTeachers", normalized);
    const docSnap = await getDoc(directDocRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data?.role === "teacher" || data?.role === "admin" || !data?.role) {
        return roleOf(data);
      }
    }

    // Secondary exact query by email field
    const teachersCol = collection(firestore, "authorizedTeachers");
    const q = query(teachersCol, where("email", "==", normalized));
    const querySnap = await getDocs(q);
    if (!querySnap.empty) {
      return roleOf(querySnap.docs[0]?.data());
    }
  } catch (err) {
    console.warn("Firestore authorizedTeachers exact match check error:", err);
    if (isNetworkFailure(err)) {
      throw Object.assign(new Error("authorizedTeachers unreachable"), { code: WHITELIST_UNREACHABLE_CODE });
    }
  }

  // No second list. The RTDB users/teachers node used to be read here as a
  // fallback, which kept it readable by every visitor (the anonymous session
  // every page load creates) and let anyone who wrote a record there pass this
  // check. It is now staff-only (database.rules.json), and authorizedTeachers is
  // the single source, as the admin security screen states.
  return null;
}

export function isWhitelistedTeacherEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();

  // No hardcoded production addresses. This is the synchronous route guard,
  // reached only when a session is missing the whitelistVerified stamp that
  // every successful login writes — that is, a session that never authorised
  // against the real list, and which should be sent back to the login screen.

  if (import.meta.env.DEV || import.meta.env.MODE === "test") {
    // "@mathmaticore.local" used to be accepted unconditionally, in
    // production too — a domain wildcard, sitting directly under a comment
    // saying domain wildcards are prohibited. It belongs here, with the other
    // development accounts.
    if (
      normalized === "teacher.demo@edu-haifa.org.il" ||
      normalized === "admin.demo@edu-haifa.org.il" ||
      normalized.endsWith("@mathmaticore.local") ||
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

  const listedRole = email
    ? await whitelistedStaffRoleAsync(email).catch(async (listErr) => {
        // The list gave no answer (network). Still fail-closed — nobody is
        // signed in — but it is not a refusal: the sign-in screen offers a
        // retry, as it does for a failed server handshake below.
        console.warn("authorizedTeachers read failed during Google SSO:", listErr);
        await auth.signOut().catch(() => {});
        throw Object.assign(new Error(STAFF_SIGNIN_REFUSED_HE), { code: STAFF_HANDSHAKE_FAILED_CODE });
      })
    : null;
  const isAuthorized = listedRole !== null;
  if (!email || !isAuthorized) {
    await auth.signOut();
    // Module 1 §ג: a refusal names no reason and repeats no address.
    throw new Error(STAFF_SIGNIN_REFUSED_HE);
  }

  // Stamp verified teacher/admin custom claims on the token via Cloud Function.
  // The claims are those of the role chosen for this sign-in only (register,
  // gap יא; PRD Module 24 §ב): an admin sign-in does not carry the teacher's.
  // The server decides them from the whitelist; the door only asks.
  //
  // PRD Module 1 §ג, strict instructions: "If the server request times out or
  // fails during authentication, trigger an immediate rollback to the idle
  // state ... the global authentication state is only updated upon successful
  // handshake ... fail-closed". A failure used to be logged and the sign-in
  // carried on from the client's own whitelist read: a teacher whose claims
  // were never stamped landed in a dashboard the rules refuse to fill.
  let claims: Record<string, unknown> | null = null;
  try {
    const syncCallable = httpsCallable(functions, "syncUserRoles");
    await syncCallable({ role: targetRole });
    await user.getIdToken(true);
  } catch (syncErr) {
    console.warn("syncUserRoles error during Google SSO:", syncErr);
    await auth.signOut().catch(() => {});
    // The address passed the whitelist check above: an authorised teacher
    // whose server check failed (network, cold start). Marked so the sign-in
    // screen can offer a retry instead of the silent return meant for
    // "המשתמש הלא מורשה" (Module 1 §ג).
    throw Object.assign(new Error(STAFF_SIGNIN_REFUSED_HE), { code: STAFF_HANDSHAKE_FAILED_CODE });
  }
  try {
    claims = ((await user.getIdTokenResult()).claims ?? null) as Record<string, unknown> | null;
  } catch {
    claims = null;
  }

  // The session's role is the verified one, not the door that was clicked: a
  // teacher-only address that came in through the admin door is the teacher.
  const role = verifiedStaffRole(claims, listedRole, targetRole);

  const teacherId = extractTeacherId(email, user.uid);
  const uid = role === "teacher" ? `teacher_${teacherId}` : `admin_${teacherId}`;

  if (role === "teacher") {
    await ensureTeacherRecord(email);
  }

  return {
    uid,
    email,
    // No display name: the Google account's name is never read, kept or shown
    // (register, "הסרת שמות מורים מהמערכת" — the address is the only identity).
    role,
    whitelistVerified: true
  };
}

/** The one refusal a staff sign-in shows: no reason, no address. */
/** An authorised staff sign-in whose server handshake failed — worth a retry. */
export const STAFF_HANDSHAKE_FAILED_CODE = "staff/handshake-failed";

export const STAFF_SIGNIN_REFUSED_HE = "הכניסה נדחתה. לבירור יש לפנות למנהל המערכת.";

/**
 * The role of a staff session. The token's claims decide (syncUserRoles
 * stamps them from the whitelist). A token without a single staff role — the
 * stamping failed, or legacy dual claims — falls back to the whitelist: an
 * admin address may take the role it asked for (the owner's dual account,
 * register gap יא); any other listed address is the teacher.
 */
export function verifiedStaffRole(
  claims: Record<string, unknown> | null | undefined,
  listedRole: "teacher" | "admin",
  requestedRole: "teacher" | "admin"
): "teacher" | "admin" {
  if (claims && claimsMatchRole(claims, "teacher")) return "teacher";
  if (claims && claimsMatchRole(claims, "admin")) return "admin";
  return listedRole === "admin" ? requestedRole : "teacher";
}
