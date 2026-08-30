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
    const TEACHER_EMAIL = (process.env.TEACHER_SSO_PRIMARY_EMAIL || "teacher_sso@domain.edu").toLowerCase().trim();
    const TEACHER_LOCAL = "teacher_1002220159@mathmaticore.local";
    const ADMIN_PRIMARY = (process.env.ADMIN_SSO_PRIMARY_EMAIL || "davidsep@edu-haifa.org.il").toLowerCase().trim();
    const ADMIN_ALIAS = (process.env.ADMIN_SSO_ALIAS_EMAIL || "admin@mathmaticore.local").toLowerCase().trim();
    const firestore = admin.firestore();
    let isAuthorizedTeacher = false;
    let isAuthorizedAdmin = false;
    let claims = {};
    let roles = [];
    let resolvedUid = request.auth.uid;
    // Check hardcoded pilot addresses
    if (normalizedEmail === ADMIN_PRIMARY ||
        normalizedEmail === ADMIN_ALIAS ||
        normalizedEmail.startsWith("davidsep") ||
        normalizedEmail.startsWith("davsapiash")) {
        isAuthorizedAdmin = true;
    }
    else if (normalizedEmail === TEACHER_EMAIL || normalizedEmail === TEACHER_LOCAL || normalizedEmail === "1002220159@edu-haifa.org.il") {
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
            await firestore.collection("authorizedTeachers").doc(normalizedEmail).set({
                email: normalizedEmail,
                role: "admin",
                name: "David Sep (Admin)",
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