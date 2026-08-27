"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPedagogicalReportDownloadUrl = exports.generatePedagogicalReportPDF = exports.EXACT_AI_FALLBACK_TEXT = void 0;
exports.createPedagogicalReportPdfBuffer = createPedagogicalReportPdfBuffer;
const https_1 = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const exportDriveReport_1 = require("./exportDriveReport");
const PDFDocument = require("pdfkit");
exports.EXACT_AI_FALLBACK_TEXT = "הניתוח הפדגוגי המפורט אינו זמין כעת. ההמלצות שלהלן מבוססות על מדדי הביצוע.";
const COLUMN_NAMES_HE = ["אחדות", "עשרות", "מאות", "אלפים"];
/**
 * Generates deterministic, chronological Exercise Narratives for compulsory exercises (Module 23).
 * Constructed from telemetry events without invoking the AI engine.
 */
function generateExerciseNarrativeFromEvents(telemetryDocs) {
    var _a;
    const narratives = [];
    const exerciseMap = {};
    // Group events chronologically by exercise_id
    telemetryDocs.sort((a, b) => (a.client_timestamp || 0) - (b.client_timestamp || 0));
    for (const doc of telemetryDocs) {
        const exId = doc.exercise_id || "ex_1";
        if (!exerciseMap[exId])
            exerciseMap[exId] = [];
        exerciseMap[exId].push(doc);
    }
    let exerciseIdx = 1;
    for (const [exId, events] of Object.entries(exerciseMap)) {
        let regroupCount = 0;
        let regroupCols = [];
        let dragCount = 0;
        let digitsEntered = 0;
        let undoCount = 0;
        let firstAttemptCorrect = true;
        for (const ev of events) {
            if (ev.event_type === 'BLOCK_DRAG_COMPLETE')
                dragCount++;
            if (ev.event_type === 'REGROUPING_SUCCESS') {
                regroupCount++;
                if (ev.column_index !== undefined && ev.column_index !== null) {
                    regroupCols.push(ev.column_index);
                }
            }
            if (ev.event_type === 'DIGIT_ENTERED') {
                digitsEntered++;
                if (((_a = ev.details) === null || _a === void 0 ? void 0 : _a.is_correct) === false) {
                    firstAttemptCorrect = false;
                }
            }
            if (ev.event_type === 'UNDO_EXECUTED')
                undoCount++;
        }
        const colText = regroupCols.length > 0
            ? `בטור ה${COLUMN_NAMES_HE[regroupCols[0]] || 'עשרות'}`
            : 'ללא צורך בפריטה מורכבת';
        const narrative = `משימת חובה ${exerciseIdx} (${exId}): הלומד ביצע ${dragCount} גרירות בלוקים, ${regroupCount > 0 ? `ביצע המרה עשרונית ${colText}` : 'שמר על המבנה העשרוני'}, הזין ${digitsEntered} ספרות ללוח והפעיל ${undoCount} פעולות ביטול (Undo) לבקרה עצמית. התרגיל הושלם ${firstAttemptCorrect ? 'בהצלחה בניסיון הראשון' : 'לאחר בקרה ותיקון שגיאה'}.`;
        narratives.push(narrative);
        exerciseIdx++;
    }
    if (narratives.length === 0) {
        narratives.push("לא נרשמו אירועי טלמטריה עבור משימות החובה במפגש זה.");
    }
    return narratives;
}
/**
 * Renders server-side binary PDF buffer using PDFKit (Module 23).
 */
function createPedagogicalReportPdfBuffer(report) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: "A4", margin: 40 });
            const chunks = [];
            doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            doc.on("end", () => resolve(Buffer.concat(chunks)));
            doc.on("error", (err) => reject(err));
            // Header
            doc.fontSize(22).fillColor("#1e1b4b").text("MathematiCore - Pedagogical Report", { align: "center" });
            doc.moveDown(0.4);
            doc.fontSize(12).fillColor("#475569").text(`Confidential Student Assessment | Zero PII Policy`, { align: "center" });
            doc.moveDown(1);
            // Metadata summary card
            doc.rect(40, doc.y, 515, 60).fillAndStroke("#f8fafc", "#cbd5e1");
            doc.fillColor("#0f172a").fontSize(12);
            const cardY = doc.y + 12;
            doc.text(`Student: ${report.anonymous_student_label}`, 55, cardY);
            doc.text(`Session: ${report.session_number}`, 220, cardY);
            doc.text(`Session Score: ${report.score_percent}%`, 380, cardY);
            doc.text(`Path: ${report.matrix_recommended_path === 'green_path' ? 'Green Track (Advanced)' : 'Remediation Path (Yellow)'}`, 55, cardY + 22);
            doc.y = cardY + 60;
            doc.moveDown(1);
            // Grouping Recommendation
            doc.fontSize(14).fillColor("#166534").text("1. Pedagogical Routing Recommendation");
            doc.moveDown(0.3);
            doc.fontSize(11).fillColor("#14532d").text(`Routing Group: ${report.routing_group}`);
            doc.fontSize(10).fillColor("#334155").text(`Details: ${report.recommendation_details_he || report.routing_label_he}`);
            doc.moveDown(1);
            // Chronological Exercise Narratives
            doc.fontSize(14).fillColor("#1e293b").text("2. Chronological Exercise Narratives");
            doc.moveDown(0.4);
            if (report.exercise_narratives && Array.isArray(report.exercise_narratives)) {
                for (const narrative of report.exercise_narratives) {
                    doc.fontSize(10).fillColor("#334155").text(`* ${narrative}`, { lineGap: 3 });
                    doc.moveDown(0.3);
                }
            }
            doc.moveDown(1);
            // AI Insights / Exact Fallback
            doc.fontSize(14).fillColor("#92400e").text("3. Pedagogical Cognitive Insights");
            doc.moveDown(0.3);
            doc.fontSize(10).fillColor("#78350f").text(report.ai_fallback_text || exports.EXACT_AI_FALLBACK_TEXT, { lineGap: 3 });
            doc.moveDown(1.5);
            // Footer
            const footerText = `Generated automatically on ${new Date(report.generated_at).toISOString()} | MathematiCore Autonomous Engine v7.0`;
            doc.fontSize(8).fillColor("#94a3b8").text(footerText, 40, 780, { align: "center", width: 515 });
            doc.end();
        }
        catch (renderErr) {
            reject(renderErr);
        }
    });
}
/**
 * generatePedagogicalReportPDF (Module 23: Pedagogical Reporting Engine)
 * Computes metrics, builds deterministic Exercise Narratives, renders an authoritative
 * binary PDF, stores it in Cloud Storage, and returns signed download link + structured data.
 */
exports.generatePedagogicalReportPDF = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated.");
    }
    const { sessionId, classId = "class_1", sessionNumber } = request.data || {};
    if (!sessionId) {
        throw new https_1.HttpsError("invalid-argument", "Missing sessionId.");
    }
    const db = admin.firestore();
    const sessionDoc = await db.collection("sessions").doc(sessionId).get();
    if (!sessionDoc.exists) {
        throw new https_1.HttpsError("not-found", `Session ${sessionId} not found.`);
    }
    const sessionData = sessionDoc.data() || {};
    const studentId = sessionId.split("_").pop() || "1";
    const clampedStudentNum = Math.min(12, Math.max(1, parseInt(studentId.replace(/\D/g, '') || '1', 10)));
    const resolvedSessionNumber = Number(sessionNumber) || sessionData.session_number || (sessionId.includes("_2_") || sessionId.includes("_02_") ? 2 : 8);
    // Read telemetry logs for Exercise Narrative construction
    const telemetrySnap = await db.collection("telemetry_logs")
        .where("session_id", "==", sessionId)
        .limit(100)
        .get();
    const telemetryDocs = telemetrySnap.docs.map(d => d.data());
    const exerciseNarratives = generateExerciseNarrativeFromEvents(telemetryDocs);
    // Read student record if available
    const studentDoc = await db.collection("students").doc(studentId).get();
    const studentData = studentDoc.exists ? studentDoc.data() : null;
    const score = sessionData.session_score_percent !== undefined && sessionData.session_score_percent !== null
        ? sessionData.session_score_percent
        : 0;
    let routingGroup = 'Independent challenge track, whiteboard';
    let routingLabelHe = 'מסלול אתגר עצמאי, לוח מחיק';
    let recommendationDetailsHe = 'המלצה למסלול אתגר וחקר עצמאי תוך שימוש בלוח מחיק ומשימות הרחבה והעמקה.';
    if (score < 50) {
        routingGroup = 'Small homogeneous group, physical ten frames';
        routingLabelHe = 'קבוצה הומוגנית קטנה, מסגרות עשר פיזיות';
        recommendationDetailsHe = 'המלצה לעבודה בקבוצה קטנה הומוגנית עם תיווך צמוד ושימוש במסגרות עשר פיזיות לביסוס המבנה העשרוני.';
    }
    else if (score <= 75) {
        routingGroup = 'Heterogeneous peer discourse, abacus';
        routingLabelHe = 'שיח עמיתים הטרוגני, חשבונייה';
        recommendationDetailsHe = 'המלצה ללמידה שיתופית ושיח עמיתים הטרוגני בשילוב חשבונייה לחיזוק הגמישות בהמרות וחקר משותף.';
    }
    // Assemble pedagogical report data payload
    const report = {
        report_id: `rep_${sessionId}`,
        generated_at: Date.now(),
        anonymous_student_label: `תלמיד ${clampedStudentNum}`,
        student_id: clampedStudentNum,
        session_number: resolvedSessionNumber,
        is_completed: Boolean(sessionData.is_completed),
        score_percent: score,
        matrix_recommended_path: sessionData.matrix_recommended_path || (score >= 50 ? "green_path" : "remediation_path"),
        teacher_selected_path: sessionData.teacher_selected_path || null,
        teacher_gate_approved: Boolean(sessionData.teacher_gate_approved),
        routing_group: routingGroup,
        routing_label_he: routingLabelHe,
        recommendation_details_he: recommendationDetailsHe,
        support_profile_id: (studentData === null || studentData === void 0 ? void 0 : studentData.support_profile_id) || "default",
        support_profile_version: (studentData === null || studentData === void 0 ? void 0 : studentData.support_profile_version) || 1,
        exercise_narratives: exerciseNarratives,
        ai_fallback_text: exports.EXACT_AI_FALLBACK_TEXT,
        summary_text_he: `דוח פדגוגי מסכם למפגש ${resolvedSessionNumber}. ציון שליטה: ${score}%. מסלול מומלץ: ${score >= 50 ? 'העמקה (ירוק)' : 'ביסוס ומענה מותאם (צהוב - remediation_path)'}.`
    };
    // Render authoritative server-side PDF binary & Upload to Cloud Storage
    let pdfUrl = "";
    const storageFilePath = `reports/${classId}/session_${resolvedSessionNumber}/student_${clampedStudentNum}_${Date.now()}.pdf`;
    let storageSuccess = false;
    let storageErrorMessage = "";
    let driveMirrorUrl = null;
    try {
        const pdfBuffer = await createPedagogicalReportPdfBuffer(report);
        const bucket = admin.storage().bucket();
        const file = bucket.file(storageFilePath);
        await file.save(pdfBuffer, {
            contentType: "application/pdf",
            metadata: {
                metadata: {
                    student_id: String(clampedStudentNum),
                    session_id: sessionId,
                    class_id: classId,
                    session_number: String(resolvedSessionNumber),
                    read_only: "true",
                },
            },
        });
        try {
            const [signedUrl] = await file.getSignedUrl({
                action: "read",
                expires: Date.now() + 60 * 60 * 1000, // 1 hour initial signed URL
            });
            pdfUrl = signedUrl;
        }
        catch (signErr) {
            pdfUrl = `https://storage.googleapis.com/${bucket.name}/${storageFilePath}`;
        }
        // Link permanent storage PDF path and timestamp to SessionDocument
        await db.collection("sessions").doc(sessionId).set({
            pedagogical_report_pdf_path: storageFilePath,
            pedagogical_report_generated_at: Date.now(),
        }, { merge: true });
        // Record immutable report artifact in Firestore reports collection
        await db.collection("reports").doc(`rep_${sessionId}`).set({
            report_id: `rep_${sessionId}`,
            session_id: sessionId,
            student_id: clampedStudentNum,
            class_id: classId,
            session_number: resolvedSessionNumber,
            storage_path: storageFilePath,
            score_percent: score,
            routing_group: routingGroup,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            is_read_only: true,
        });
        storageSuccess = true;
        logger.info(`Authoritative pedagogical PDF generated and stored at ${storageFilePath}`);
        // Module 23 Drive mirror: archive a copy of the same PDF in the shared Drive folder.
        // Best-effort only — a Drive failure must never fail or degrade report generation.
        try {
            const driveFileName = `PedagogicalReport_session${resolvedSessionNumber}_student${clampedStudentNum}_${Date.now()}.pdf`;
            const driveResult = await (0, exportDriveReport_1.uploadBufferToDrive)(pdfBuffer, driveFileName, "application/pdf");
            if (driveResult.success) {
                driveMirrorUrl = driveResult.webViewLink;
                await db.collection("reports").doc(`rep_${sessionId}`).set({
                    drive_file_id: driveResult.fileId,
                    drive_file_url: driveResult.webViewLink,
                }, { merge: true });
                logger.info(`Pedagogical PDF mirrored to shared Drive folder: ${driveResult.fileId}`);
            }
            else {
                logger.warn(`Drive mirror skipped (non-fatal): ${driveResult.error}`);
            }
        }
        catch (driveErr) {
            logger.warn(`Drive mirror failed (non-fatal): ${(driveErr === null || driveErr === void 0 ? void 0 : driveErr.message) || driveErr}`);
        }
    }
    catch (storageErr) {
        storageErrorMessage = (storageErr === null || storageErr === void 0 ? void 0 : storageErr.message) || "Storage write error";
        logger.error(`Failed to store PDF in Cloud Storage:`, storageErr);
    }
    if (!storageSuccess) {
        return {
            status: "DEGRADED_JSON_ONLY",
            pdf_stored: false,
            error_message: storageErrorMessage,
            report,
            downloadUrl: null,
            storagePath: null,
        };
    }
    return {
        status: "SUCCESS",
        pdf_stored: true,
        report,
        downloadUrl: pdfUrl,
        storagePath: storageFilePath,
        driveMirrorUrl,
    };
});
/**
 * getPedagogicalReportDownloadUrl (Module 23 & 27: On-demand secure signed URL generator)
 * Validates teacher authorization and returns a fresh 1-hour signed URL for the stored PDF.
 */
exports.getPedagogicalReportDownloadUrl = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated.");
    }
    const { sessionId } = request.data || {};
    if (!sessionId) {
        throw new https_1.HttpsError("invalid-argument", "Missing sessionId.");
    }
    const db = admin.firestore();
    const reportDoc = await db.collection("reports").doc(`rep_${sessionId}`).get();
    if (!reportDoc.exists) {
        throw new https_1.HttpsError("not-found", `Report rep_${sessionId} not found.`);
    }
    const data = reportDoc.data() || {};
    const storagePath = data.storage_path;
    if (!storagePath) {
        throw new https_1.HttpsError("not-found", "Storage path not found on report document.");
    }
    // Teacher authorization check against class_id
    const callerRoles = request.auth.token.roles || (request.auth.token.role ? [request.auth.token.role] : []);
    const isTeacher = callerRoles.includes("TEACHER") || request.auth.token.role === "teacher";
    const isAdmin = callerRoles.includes("ADMIN") || request.auth.token.role === "admin";
    const callerClassId = request.auth.token.class_id;
    if (!isTeacher && !isAdmin) {
        throw new https_1.HttpsError("permission-denied", "Unauthorized access.");
    }
    if (isTeacher && !isAdmin && callerClassId && callerClassId !== data.class_id) {
        throw new https_1.HttpsError("permission-denied", "Access denied: teacher not assigned to this class.");
    }
    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);
    const [signedUrl] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 60 * 60 * 1000, // 1 hour fresh signed URL
    });
    return {
        status: "SUCCESS",
        downloadUrl: signedUrl,
        storagePath,
    };
});
//# sourceMappingURL=pedagogicalReport.js.map