import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { claimsForSignIn, parseRequestedRole, withReadOnlyFlag } from "./roleClaims";

const UNIFIED_ADMIN_UID = "admin_unified_identity";

/**
 * Identity Alias Mapping & SSO Configuration (PRD 5.3 & Module 25)
 * Maps specified SSO emails to unified identities and strictly applies roles, student_id (1-12), and class_id.
 */
export const syncUserRoles = onCall(
  {
    invoker: "public",
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const email = request.auth.token.email;
    if (!email) {
      throw new HttpsError("invalid-argument", "Email is required for role sync");
    }

    // The role comes from the address in the token. An address the provider has
    // not verified proves nothing about who holds it (a password sign-up could
    // claim any teacher's address). Google staff sign-in always carries true.
    if (request.auth.token.email_verified !== true) {
      throw new HttpsError("permission-denied", "The e-mail address is not verified");
    }

    const normalizedEmail = email.toLowerCase().trim();

    // authorizedTeachers is the single source of truth. Five hardcoded
    // bypasses used to sit here, three of them guessable —
    // "teacher_sso@domain.edu" was the DEFAULT when the env var is unset, on a
    // domain this project does not own. They are gone, and so is the pilot
    // pair: the product owner confirmed both addresses are in the whitelist,
    // and keeping them hardcoded meant deleting a teacher could not actually
    // revoke her login.
    //
    // The emergency hatch is the environment variables, which are the owner's
    // own configuration rather than a value anyone can guess. They are honoured
    // only when they look like an address.
    const envEmail = (name: string): string | null => {
      const raw = (process.env[name] || "").toLowerCase().trim();
      return raw.includes("@") ? raw : null;
    };
    const teacherFallbacks = new Set([envEmail("TEACHER_SSO_PRIMARY_EMAIL")].filter(Boolean) as string[]);
    const adminFallbacks = new Set(
      [envEmail("ADMIN_SSO_PRIMARY_EMAIL"), envEmail("ADMIN_SSO_ALIAS_EMAIL")].filter(Boolean) as string[]
    );

    const firestore = admin.firestore();
    let isAuthorizedTeacher = false;
    let isAuthorizedAdmin = false;
    // Owner decision 11.10.2026: a read-only staff account (authorizedTeachers
    // doc `readOnly: true`) sees everything and changes nothing. Only the
    // whitelist document can set it; the env-var fallbacks are the owner's own.
    let isReadOnly = false;
    let resolvedUid = request.auth.uid;

    // Check the documented pilot fallback addresses
    if (adminFallbacks.has(normalizedEmail)) {
      isAuthorizedAdmin = true;
    } else if (teacherFallbacks.has(normalizedEmail)) {
      isAuthorizedTeacher = true;
    } else {
      // Dynamic check against Firestore authorizedTeachers collection
      try {
        const teacherDoc = await firestore.collection("authorizedTeachers").doc(normalizedEmail).get();
        if (teacherDoc.exists) {
          const data = teacherDoc.data();
          // Typed in the console as a boolean or as the text "true" (owner, 11.10.2026: the text is easier to enter).
          isReadOnly = data?.readOnly === true || String(data?.readOnly ?? "").trim().toLowerCase() === "true";
          if (data?.role === "admin") {
            isAuthorizedAdmin = true;
          } else {
            isAuthorizedTeacher = true;
          }
        }
      } catch (err) {
        // A read that failed is not a teacher who is not on the list. Falling
        // through stamped "guest" over her existing teacher claims on a
        // Firestore hiccup — a silent demotion the client then swallowed with
        // a console.warn. Refuse instead; her current token stays as it is.
        logger.error(`Could not fetch authorizedTeachers doc for ${normalizedEmail}:`, err);
        throw new HttpsError("unavailable", "לא ניתן לאמת את ההרשאה כרגע. ההרשאות הקיימות נשמרות; נסו שוב בעוד רגע.");
      }
    }

    // The role this sign-in chose on the login screen (register, gap יא).
    const requestedRole = parseRequestedRole(request.data);
    const claims = withReadOnlyFlag(
      claimsForSignIn({ isAuthorizedAdmin, isAuthorizedTeacher }, requestedRole),
      isReadOnly
    );
    // The claims always go on the caller's own uid (setCustomUserClaims below).
    // UNIFIED_ADMIN_UID is only a label returned to the client — no account's
    // claims change through it, and no client code reads it. A read-only
    // sign-in keeps its own uid even as that label, so it is never presented
    // as the owner's shared admin identity nor makes that identity read-only.
    if (isAuthorizedAdmin && claims.role === "admin" && claims.readOnly !== true) {
      resolvedUid = UNIFIED_ADMIN_UID;
    }

    if (isAuthorizedAdmin || isAuthorizedTeacher) {
      // Ensure doc exists in authorizedTeachers collection. It keeps the
      // address's authorisation (admin or teacher), not the role of this
      // sign-in: the owner signing in as the teacher stays an admin address.
      //
      // No name. The product owner's decision, recorded in the deviations
      // register: a teacher's only stored identity is the whitelisted e-mail.
      try {
        await firestore.collection("authorizedTeachers").doc(normalizedEmail).set({
          email: normalizedEmail,
          role: isAuthorizedAdmin ? "admin" : "teacher",
          updatedAt: Date.now()
        }, { merge: true });
      } catch (e) {
        logger.warn("Auto-provision authorizedTeachers error:", e);
      }
    }

    try {
      // Set Auth Custom Claims on the actual token
      await admin.auth().setCustomUserClaims(request.auth.uid, claims);
      
      logger.info(`Stamped roles for ${normalizedEmail}: role=${claims.role}${claims.readOnly === true ? " (read-only)" : ""}`);

      return {
        success: true,
        uid: request.auth.uid,
        resolvedUid,
        claims
      };
    } catch (error: any) {
      logger.error("Error setting custom claims:", error);
      throw new HttpsError("internal", "Failed to set custom claims: " + error.message);
    }
  }
);
