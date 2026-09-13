"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readCallerRoles = readCallerRoles;
exports.requireTeacherForIndividualData = requireTeacherForIndividualData;
exports.requireAdmin = requireAdmin;
const https_1 = require("firebase-functions/v2/https");
function readCallerRoles(token) {
    var _a;
    const rawRoles = token.roles;
    const roles = (Array.isArray(rawRoles) ? rawRoles : token.role ? [token.role] : [])
        .map((r) => String(r).toLowerCase());
    const role = String((_a = token.role) !== null && _a !== void 0 ? _a : "").toLowerCase();
    const studentId = Number(token.student_id);
    return {
        isTeacher: roles.includes("teacher") || role === "teacher" || token.teacher === true,
        isAdmin: roles.includes("admin") || role === "admin" || token.admin === true,
        studentId: Number.isInteger(studentId) && studentId >= 1 && studentId <= 12 ? studentId : null,
        classId: typeof token.class_id === "string" && token.class_id ? token.class_id : null,
    };
}
/**
 * Module 24 §ב: a system administrator is blocked from an individual
 * learner's telemetry and documents. The Firestore rules already say this
 * (`allow read: if (isTeacher() || ...) && !isAdmin()`), and an Admin-SDK
 * function has to say it too.
 *
 * The product owner's identity carries both the teacher and the admin claim,
 * so it passes. An admin-only identity does not.
 */
function requireTeacherForIndividualData(token) {
    const caller = readCallerRoles(token);
    if (!caller.isTeacher) {
        throw new https_1.HttpsError("permission-denied", "רק מורה רשאית להפיק או לקרוא נתונים של לומד יחיד.");
    }
    return caller;
}
/** An action reserved for a system administrator. */
function requireAdmin(token) {
    const caller = readCallerRoles(token);
    if (!caller.isAdmin) {
        throw new https_1.HttpsError("permission-denied", "פעולה זו שמורה למנהל המערכת.");
    }
    return caller;
}
//# sourceMappingURL=callerIdentity.js.map