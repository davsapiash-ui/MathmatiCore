"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncUserRoles = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const UNIFIED_ADMIN_UID = "admin_unified_identity";
/**
 * Identity Alias Mapping & SSO Configuration (PRD 5.3 & Module 25)
 * Maps specified SSO emails to unified identities and strictly applies roles, student_id (1-12), and class_id.
 */
exports.syncUserRoles = (0, https_1.onCall)({
    invoker: "public",
    cors: true,
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const email = request.auth.token.email;
    if (!email) {
        throw new https_1.HttpsError("invalid-argument", "Email is required for role sync");
    }
    const normalizedEmail = email.toLowerCase().trim();
    // The two pilot identities are a deliberate, documented fallback: they
    // guarantee the product owner and the lecturer are never locked out of
    // their own system if Firestore is unreachable. See the deviations
    // register. Everyone else goes through authorizedTeachers, which is what
    // makes deleting a teacher actually revoke her login.
    //
    // What was removed: "teacher_sso@domain.edu" was the DEFAULT when
    // TEACHER_SSO_PRIMARY_EMAIL is unset — a registrable address on a domain
    // this project does not own, granting teacher claims to whoever holds it.
    // "admin@mathmaticore.local" was the same shape for admin, and
    // "teacher_1002220159@mathmaticore.local" a third. An env var that is
    // actually set is the owner's own configuration and is still honoured; a
    // guessable default is not.
    const PILOT_ADMIN_EMAIL = "davidsep@edu-haifa.org.il";
    const PILOT_TEACHER_EMAIL = "1002220159@edu-haifa.org.il";
    const envEmail = (name) => {
        const raw = (process.env[name] || "").toLowerCase().trim();
        return raw.includes("@") ? raw : null;
    };
    const teacherFallbacks = new Set([PILOT_TEACHER_EMAIL, envEmail("TEACHER_SSO_PRIMARY_EMAIL")].filter(Boolean));
    const adminFallbacks = new Set([PILOT_ADMIN_EMAIL, envEmail("ADMIN_SSO_PRIMARY_EMAIL"), envEmail("ADMIN_SSO_ALIAS_EMAIL")].filter(Boolean));
    const firestore = admin.firestore();
    let isAuthorizedTeacher = false;
    let isAuthorizedAdmin = false;
    let claims = {};
    let roles = [];
    let resolvedUid = request.auth.uid;
    // Check the documented pilot fallback addresses
    if (adminFallbacks.has(normalizedEmail)) {
        isAuthorizedAdmin = true;
    }
    else if (teacherFallbacks.has(normalizedEmail)) {
        isAuthorizedTeacher = true;
    }
    else {
        // Dynamic check against Firestore authorizedTeachers collection
        try {
            const teacherDoc = await firestore.collection("authorizedTeachers").doc(normalizedEmail).get();
            if (teacherDoc.exists) {
                const data = teacherDoc.data();
                if ((data === null || data === void 0 ? void 0 : data.role) === "admin") {
                    isAuthorizedAdmin = true;
                }
                else {
                    isAuthorizedTeacher = true;
                }
            }
        }
        catch (err) {
            logger.warn(`Could not fetch authorizedTeachers doc for ${normalizedEmail}:`, err);
        }
    }
    if (isAuthorizedAdmin) {
        // Dual role authorization for admin
        roles = ["TEACHER", "ADMIN"];
        claims = {
            admin: true,
            teacher: true,
            role: "admin",
            roles
        };
        resolvedUid = UNIFIED_ADMIN_UID;
        // Ensure doc exists in authorizedTeachers collection
        try {
            // No name. The product owner's decision, recorded in the deviations
            // register: a teacher's only stored identity is the whitelisted
            // e-mail. This line re-created the field on every admin sign-in, in
            // the one collection every authenticated user can read.
            await firestore.collection("authorizedTeachers").doc(normalizedEmail).set({
                email: normalizedEmail,
                role: "admin",
                updatedAt: Date.now()
            }, { merge: true });
        }
        catch (e) {
            logger.warn("Auto-provision authorizedTeachers error:", e);
        }
    }
    else if (isAuthorizedTeacher) {
        // Strict requirement: prevent teacher from ever obtaining admin claims
        roles = ["TEACHER"];
        claims = {
            teacher: true,
            admin: false,
            role: "teacher",
            class_id: "class_1",
            roles
        };
        // Ensure doc exists in authorizedTeachers collection
        try {
            await firestore.collection("authorizedTeachers").doc(normalizedEmail).set({
                email: normalizedEmail,
                role: "teacher",
                updatedAt: Date.now()
            }, { merge: true });
        }
        catch (e) {
            logger.warn("Auto-provision authorizedTeachers error:", e);
        }
    }
    else {
        // Non-whitelisted users do not receive teacher/admin privileges
        roles = ["GUEST"];
        claims = {
            student: false,
            admin: false,
            teacher: false,
            role: "guest",
            roles
        };
    }
    try {
        // Set Auth Custom Claims on the actual token
        await admin.auth().setCustomUserClaims(request.auth.uid, claims);
        logger.info(`Stamped roles for ${normalizedEmail}: role=${claims.role}`);
        return {
            success: true,
            uid: request.auth.uid,
            resolvedUid,
            claims
        };
    }
    catch (error) {
        logger.error("Error setting custom claims:", error);
        throw new https_1.HttpsError("internal", "Failed to set custom claims: " + error.message);
    }
});
//# sourceMappingURL=syncUserRoles.js.map