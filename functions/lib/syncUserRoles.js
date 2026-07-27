"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncUserRoles = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const UNIFIED_ADMIN_UID = "admin_unified_identity";
/**
 * Identity Alias Mapping & SSO Configuration (PRD 5.3)
 * Maps specified SSO emails to unified identities and strictly applies roles.
 */
exports.syncUserRoles = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const email = request.auth.token.email;
    if (!email) {
        throw new https_1.HttpsError("invalid-argument", "Email is required for role sync");
    }
    const TEACHER_EMAIL = process.env.TEACHER_SSO_PRIMARY_EMAIL;
    const ADMIN_PRIMARY = process.env.ADMIN_SSO_PRIMARY_EMAIL;
    const ADMIN_ALIAS = process.env.ADMIN_SSO_ALIAS_EMAIL;
    let claims = {};
    let roles = [];
    let resolvedUid = request.auth.uid;
    if (email === ADMIN_PRIMARY || email === ADMIN_ALIAS) {
        // Dual role authorization for admin
        roles = ["TEACHER", "ADMIN"];
        claims = { admin: true, teacher: true, roles };
        // Map them to a single, unified administrative User ID (UID)
        resolvedUid = UNIFIED_ADMIN_UID;
    }
    else if (email === TEACHER_EMAIL) {
        // Strict requirement: prevent teacher from ever obtaining admin claims
        roles = ["TEACHER"];
        claims = { teacher: true, admin: false, roles };
    }
    else {
        // Regular student or unknown user
        roles = ["STUDENT"];
        claims = { student: true, admin: false, teacher: false, roles };
    }
    try {
        // Set Auth Custom Claims on the actual token
        await admin.auth().setCustomUserClaims(request.auth.uid, claims);
        // Map identity to the database (Realtime Database in this case as it's the primary DB)
        const db = admin.database();
        await db.ref(`users/role_mapping/${request.auth.uid}`).set({
            unifiedUid: resolvedUid,
            email,
            roles,
            updatedAt: admin.database.ServerValue.TIMESTAMP
        });
        logger.info(`Successfully synced roles [${roles.join(", ")}] for user ${email}`);
        return {
            success: true,
            roles,
            unifiedUid: resolvedUid
        };
    }
    catch (error) {
        logger.error("Error setting custom claims", error);
        throw new https_1.HttpsError("internal", "Failed to sync user roles.");
    }
});
//# sourceMappingURL=syncUserRoles.js.map