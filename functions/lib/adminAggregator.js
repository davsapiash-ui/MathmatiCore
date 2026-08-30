"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hourlyAdminAggregator = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
/**
 * hourlyAdminAggregator (Module 24: Store Cache & Admin Aggregator)
 * Aggregates statistics across all schools, classrooms and sessions into store_cache/admin_metrics.
 * Runs on a recurring schedule once every 60 minutes.
 */
exports.hourlyAdminAggregator = (0, scheduler_1.onSchedule)({
    schedule: "every 60 minutes",
    timeZone: "Asia/Jerusalem",
    region: "us-central1",
}, async (event) => {
    const db = admin.firestore();
    const [schoolsSnap, classesSnap, sessionsSnap, studentsSnap] = await Promise.all([
        db.collection("schools").get(),
        db.collection("classes").get(),
        db.collection("sessions").get(),
        db.collection("students").get(),
    ]);
    let totalSessions = 0;
    let completedSessions = 0;
    let totalScoreSum = 0;
    // Module 24 §ב: per-session completion aggregates so the admin console never
    // needs a live per-student query to render its charts.
    const perSession = {};
    sessionsSnap.forEach((doc) => {
        const data = doc.data();
        totalSessions++;
        const sessionNumber = String(Number(data.session_number) || 0);
        if (!perSession[sessionNumber]) {
            perSession[sessionNumber] = { created: 0, completed: 0, scoreSum: 0 };
        }
        perSession[sessionNumber].created++;
        if (data.is_completed) {
            completedSessions++;
            totalScoreSum += Number(data.session_score_percent) || 0;
            perSession[sessionNumber].completed++;
            perSession[sessionNumber].scoreSum += Number(data.session_score_percent) || 0;
        }
    });
    const averageMastery = completedSessions > 0 ? Math.round(totalScoreSum / completedSessions) : 0;
    const sessionBreakdown = Object.entries(perSession).reduce((acc, [sessionNumber, agg]) => {
        acc[sessionNumber] = {
            created: agg.created,
            completed: agg.completed,
            completion_rate_percent: agg.created > 0 ? Math.round((agg.completed / agg.created) * 100) : 0,
            average_score_percent: agg.completed > 0 ? Math.round(agg.scoreSum / agg.completed) : 0,
        };
        return acc;
    }, {});
    const aggregatedMetrics = {
        updated_at: Date.now(),
        total_schools: schoolsSnap.size,
        total_classrooms: classesSnap.size,
        total_students: studentsSnap.size,
        total_sessions_created: totalSessions,
        total_sessions_completed: completedSessions,
        average_mastery_percent: averageMastery,
        completion_rate_percent: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0,
        session_breakdown: sessionBreakdown,
    };
    await db.collection("store_cache").doc("admin_metrics").set(aggregatedMetrics, { merge: true });
    logger.info("Updated admin_metrics cache successfully via hourly schedule", aggregatedMetrics);
});
//# sourceMappingURL=adminAggregator.js.map