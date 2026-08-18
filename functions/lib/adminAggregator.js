"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hourlyAdminAggregator = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
/**
 * hourlyAdminAggregator (Module 24: Store Cache & Admin Aggregator)
 * Aggregates statistics across all schools, classrooms and sessions into store_cache/admin_metrics.
 */
exports.hourlyAdminAggregator = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated.");
    }
    const db = admin.firestore();
    const [schoolsSnap, classesSnap, sessionsSnap] = await Promise.all([
        db.collection("schools").get(),
        db.collection("classes").get(),
        db.collection("sessions").get(),
    ]);
    let totalSessions = 0;
    let completedSessions = 0;
    let totalScoreSum = 0;
    sessionsSnap.forEach((doc) => {
        const data = doc.data();
        totalSessions++;
        if (data.is_completed) {
            completedSessions++;
            totalScoreSum += Number(data.session_score_percent) || 0;
        }
    });
    const averageMastery = completedSessions > 0 ? Math.round(totalScoreSum / completedSessions) : 0;
    const aggregatedMetrics = {
        updated_at: Date.now(),
        total_schools: schoolsSnap.size,
        total_classrooms: classesSnap.size,
        total_sessions_created: totalSessions,
        total_sessions_completed: completedSessions,
        average_mastery_percent: averageMastery,
        completion_rate_percent: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0,
    };
    await db.collection("store_cache").doc("admin_metrics").set(aggregatedMetrics, { merge: true });
    logger.info("Updated admin_metrics cache successfully", aggregatedMetrics);
    return { status: "SUCCESS", metrics: aggregatedMetrics };
});
//# sourceMappingURL=adminAggregator.js.map