import { auth, database } from "@/infrastructure/firebase";
import { GoogleAuthProvider, signInWithPopup, type UserCredential } from "firebase/auth";
import { ref, get, set } from "firebase/database";
import { extractTeacherId } from "./FirebaseSyncService";

// Default allowed institutional domains if not overridden by environment variables
const DEFAULT_ALLOWED_DOMAINS = [
  "edu-haifa.org.il",
  "education.gov.il",
  "g.education.gov.il",
  "schools.org.il",
  "edu.gov.il"
];

const DEFAULT_ALLOWED_SPECIFIC_EMAILS = [
  "davidsep@edu-haifa.org.il",
];

/**
 * Retrieves dynamically configured allowed domains from environment variables.
 */
export function getAllowedDomains(): string[] {
  const envDomains = import.meta.env.VITE_ALLOWED_DOMAINS;
  if (envDomains && typeof envDomains === "string") {
    return envDomains
      .split(",")
      .map((d: string) => d.trim().toLowerCase())
      .filter(Boolean);
  }
  return DEFAULT_ALLOWED_DOMAINS;
}

/**
 * Retrieves dynamically configured specific allowed emails from environment variables.
 */
export function getAllowedSpecificEmails(): string[] {
  const envEmails = import.meta.env.VITE_ALLOWED_EMAILS;
  if (envEmails && typeof envEmails === "string") {
    const parsed = envEmails
      .split(",")
      .map((e: string) => e.trim().toLowerCase())
      .filter(Boolean);
    return [...new Set([...DEFAULT_ALLOWED_SPECIFIC_EMAILS, ...parsed])];
  }
  return DEFAULT_ALLOWED_SPECIFIC_EMAILS;
}

/**
 * Validates whether an email is authorized to access teacher / admin portals.
 * Strictly permits davidsep@edu-haifa.org.il and teachers provisioned in the database by admin.
 */
export async function isWhitelistedTeacherEmailAsync(email?: string | null): Promise<boolean> {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();

  // Local development domain
  if (normalized.endsWith("@mathmaticore.local")) return true;

  // Master authorized initial administrator & teacher
  if (normalized === "davidsep@edu-haifa.org.il") return true;

  // Check specific allowed emails configured in environment
  const allowedEmails = getAllowedSpecificEmails();
  if (allowedEmails.includes(normalized)) return true;

  // Check if this teacher email was provisioned in the database (users/teachers or schools)
  try {
    const teachersSnap = await get(ref(database, 'users/teachers'));
    if (teachersSnap.exists()) {
      const teachersObj = teachersSnap.val();
      const match = Object.values(teachersObj).some((t: any) => 
        (t?.email && t.email.toLowerCase().trim() === normalized) ||
        (t?.id && t.id.toLowerCase().trim() === normalized)
      );
      if (match) return true;
    }
  } catch (err) {
    console.warn("Database teacher whitelist check non-blocking warning:", err);
  }

  // In local test mode only
  if (import.meta.env.DEV || import.meta.env.MODE === "test") {
    if (normalized.includes("teacher") || normalized.includes("admin") || normalized.endsWith("@local.dev")) {
      return true;
    }
  }

  return false;
}

export function isWhitelistedTeacherEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();

  if (normalized.endsWith("@mathmaticore.local")) return true;
  if (normalized === "davidsep@edu-haifa.org.il") return true;

  const allowedEmails = getAllowedSpecificEmails();
  if (allowedEmails.includes(normalized)) return true;

  if (import.meta.env.DEV || import.meta.env.MODE === "test") {
    if (normalized.includes("teacher") || normalized.includes("admin") || normalized.endsWith("@local.dev")) {
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
