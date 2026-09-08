"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateClassMeetingReport = exports.CLASS_AI_ANALYSIS_TIMEOUT_MS = exports.CLASS_REPORT_RUNTIME = void 0;
exports.buildLearnerRow = buildLearnerRow;
exports.aggregateClass = aggregateClass;
exports.generateClassAnalysis = generateClassAnalysis;
exports.parseClassAnalysis = parseClassAnalysis;
exports.buildClassCsv = buildClassCsv;
exports.createClassReportPdfBuffer = createClassReportPdfBuffer;
exports.createClassReportPdfBufferWithPdfkit = createClassReportPdfBufferWithPdfkit;
const https_1 = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");
const exportDriveReport_1 = require("./exportDriveReport");
const meetingMetrics_1 = require("./meetingMetrics");
const pedagogicalReport_1 = require("./pedagogicalReport");
const hebrewPdf_1 = require("./hebrewPdf");
const htmlPdf_1 = require("./htmlPdf");
const reportHtml_1 = require("./reportHtml");
const reportAnalysis_1 = require("./reportAnalysis");
const geminiConfig_1 = require("./geminiConfig");
const PDFDocument = require("pdfkit");
/**
 * Module 23 — the CLASS report of one meeting (owner decision, 6.9.2026,
 * register item 12): "צריך להיות בכל מפגש גם דו"ח תלמיד וגם דו"ח כיתה" and
 * "כל מה שנמדד ליחיד אני רוצה בפלט כיתתי באופן שישמש את המחקר".
 *
 * Everything the individual report measures for one learner is measured here
 * for every learner of the meeting, from the same telemetry and by the same
 * functions (meetingMetrics.ts), and then aggregated for the class:
 *
 *   layer 1 (deterministic, server-side): per-learner first-attempt score by
 *     the PRD rule, the three working groups by the PRD percentage rule, and
 *     every counter (wrong digits by column, undos, deletions, hesitations,
 *     regroupings, Socratic cards and their triggers, error categories, active
 *     and recording minutes, reflections);
 *   layer 2 (the AI engine): class-level patterns and teaching
 *     recommendations, within the layer-1 framework, with the PRD's exact
 *     fallback sentence when the engine is unavailable.
 *
 * Outputs: a PDF for the teacher, a CSV of the per-learner table for the
 * research, both in Cloud Storage and mirrored to Drive under
 * "05 דוחות כיתה / מפגש N", and a Firestore document class_reports/{class}_session_{N}
 * carrying every number so the dashboard shows the report without regenerating.
 */
exports.CLASS_REPORT_RUNTIME = Object.assign(Object.assign(Object.assign({}, geminiConfig_1.GEMINI_SECRETS), htmlPdf_1.CHROMIUM_PDF_RUNTIME), { timeoutSeconds: 540 });
exports.CLASS_AI_ANALYSIS_TIMEOUT_MS = 20000;
const ALL_STUDENT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const COLUMN_NAMES_HE = ["אחדות", "עשרות", "מאות", "אלפים"];
const round1 = (n) => Math.round(n * 10) / 10;
function studentNumber(v) {
    const n = parseInt(String(v !== null && v !== void 0 ? v : "").replace(/\D/g, ""), 10);
    return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
}
function bump(map, key) {
    map[key] = (map[key] || 0) + 1;
}
/** Everything the individual report knows about one learner's meeting, as one row. */
function buildLearnerRow(studentId, events, compulsoryTotal, learningPath, sessionDoc, recording, reflectionsCount) {
    var _a, _b, _c, _d, _e, _f, _g;
    const sorted = [...events].sort((a, b) => (a.client_timestamp || 0) - (b.client_timestamp || 0));
    const first = (0, meetingMetrics_1.computeFirstAttemptScore)(sorted, compulsoryTotal);
    const summary = (0, meetingMetrics_1.summarizeMeeting)(sorted);
    const wrongByColumn = [0, 0, 0, 0];
    const triggers = {};
    const categories = {};
    const wrongInExercise = new Set();
    const outcomes = {};
    for (const ev of sorted) {
        const exId = String(ev.exercise_id || "");
        if (exId && !outcomes[exId])
            outcomes[exId] = "incomplete";
        switch (ev.event_type) {
            case "DIGIT_ENTERED":
                if (((_a = ev.details) === null || _a === void 0 ? void 0 : _a.is_correct) === false) {
                    const col = typeof ev.column_index === "number" ? ev.column_index : -1;
                    if (col >= 0 && col < 4)
                        wrongByColumn[col]++;
                    if (exId)
                        wrongInExercise.add(exId);
                }
                break;
            case "SOCRATIC_CARD_SHOWN":
                if (typeof ((_b = ev.details) === null || _b === void 0 ? void 0 : _b.trigger_reason) === "string")
                    bump(triggers, ev.details.trigger_reason);
                if (typeof ((_c = ev.details) === null || _c === void 0 ? void 0 : _c.error_category) === "string")
                    bump(categories, ev.details.error_category);
                break;
            case "PROBLEM_COMPLETE":
                if (exId)
                    outcomes[exId] = wrongInExercise.has(exId) ? "after_correction" : "first_try";
                break;
            default:
                break;
        }
    }
    const docScore = sessionDoc && typeof sessionDoc.session_score_percent === "number" ? sessionDoc.session_score_percent : null;
    const score = docScore !== null ? docScore : first.scorePercent;
    return {
        student_id: studentId,
        learning_path: learningPath,
        score_percent: score,
        score_source: docScore !== null ? "session_document" : "telemetry_first_attempt",
        recommendation_tier: (0, reportAnalysis_1.resolveRecommendationTier)(score),
        compulsory_total: first.denominator,
        correct_first_attempt: first.correctFirstAttempt,
        exercises_attempted: summary.exercises_attempted,
        exercises_completed: summary.exercises_completed,
        events: summary.events,
        first_event_at: summary.first_event_at,
        last_event_at: summary.last_event_at,
        active_minutes: summary.active_minutes,
        digits_entered: summary.digits_entered,
        wrong_digits: summary.wrong_digits,
        wrong_digits_units: wrongByColumn[0],
        wrong_digits_tens: wrongByColumn[1],
        wrong_digits_hundreds: wrongByColumn[2],
        wrong_digits_thousands: wrongByColumn[3],
        deletions: summary.deletions,
        undos: summary.undos,
        hesitations: summary.hesitations,
        hesitation_seconds_total: round1(summary.hesitation_seconds_total),
        regroupings: summary.regroupings,
        socratic_cards: summary.socratic_cards,
        socratic_triggers: triggers,
        error_categories: categories,
        reflection_submitted: summary.reflection_submitted || reflectionsCount > 0,
        reflections_count: reflectionsCount,
        recording_minutes: (_d = recording === null || recording === void 0 ? void 0 : recording.minutes) !== null && _d !== void 0 ? _d : 0,
        recording_truncated: (_e = recording === null || recording === void 0 ? void 0 : recording.truncated) !== null && _e !== void 0 ? _e : false,
        exercise_outcomes: outcomes,
        session_doc_score_percent: docScore,
        session_doc_recommended_path: (_f = sessionDoc === null || sessionDoc === void 0 ? void 0 : sessionDoc.matrix_recommended_path) !== null && _f !== void 0 ? _f : null,
        teacher_selected_path: (_g = sessionDoc === null || sessionDoc === void 0 ? void 0 : sessionDoc.teacher_selected_path) !== null && _g !== void 0 ? _g : null,
        teacher_gate_approved: Boolean(sessionDoc === null || sessionDoc === void 0 ? void 0 : sessionDoc.teacher_gate_approved),
    };
}
/** The class picture: the same measurements, summed and distributed across the learners. */
function aggregateClass(rows, eventsByLearner) {
    var _a, _b;
    const scores = rows.map((r) => r.score_percent).sort((a, b) => a - b);
    const n = rows.length;
    const median = n === 0 ? 0 : n % 2 === 1 ? scores[(n - 1) / 2] : (scores[n / 2 - 1] + scores[n / 2]) / 2;
    const sum = (pick) => rows.reduce((acc, r) => acc + pick(r), 0);
    const mergeCounts = (pick) => {
        const out = {};
        for (const r of rows)
            for (const [k, v] of Object.entries(pick(r)))
                out[k] = (out[k] || 0) + v;
        return out;
    };
    const tiers = { below_50: [], between_50_75: [], above_75: [] };
    for (const r of rows)
        tiers[r.recommendation_tier].push(r.student_id);
    // Per exercise: how many learners opened it, finished it, finished it first try,
    // and how much trouble it caused (wrong digits, cards, hesitations).
    const perExercise = new Map();
    const exerciseRow = (id) => {
        let row = perExercise.get(id);
        if (!row) {
            row = { exercise_id: id, attempted: 0, completed: 0, first_try: 0, first_try_percent: 0, wrong_digits: 0, socratic_cards: 0, hesitations: 0 };
            perExercise.set(id, row);
        }
        return row;
    };
    for (const r of rows) {
        for (const [exId, outcome] of Object.entries(r.exercise_outcomes)) {
            const row = exerciseRow(exId);
            row.attempted++;
            if (outcome !== "incomplete")
                row.completed++;
            if (outcome === "first_try")
                row.first_try++;
        }
        for (const ev of (_a = eventsByLearner.get(r.student_id)) !== null && _a !== void 0 ? _a : []) {
            const exId = String(ev.exercise_id || "");
            if (!exId)
                continue;
            if (ev.event_type === "DIGIT_ENTERED" && ((_b = ev.details) === null || _b === void 0 ? void 0 : _b.is_correct) === false)
                exerciseRow(exId).wrong_digits++;
            else if (ev.event_type === "SOCRATIC_CARD_SHOWN")
                exerciseRow(exId).socratic_cards++;
            else if (ev.event_type === "HESITATION_DETECTED")
                exerciseRow(exId).hesitations++;
        }
    }
    const exercises = Array.from(perExercise.values())
        .map((row) => (Object.assign(Object.assign({}, row), { first_try_percent: row.attempted > 0 ? Math.round((row.first_try / row.attempted) * 100) : 0 })))
        .sort((a, b) => a.exercise_id.localeCompare(b.exercise_id, undefined, { numeric: true }));
    const withData = new Set(rows.map((r) => r.student_id));
    return {
        learners_with_data: n,
        learners_without_data: ALL_STUDENT_IDS.filter((id) => !withData.has(id)),
        score_mean: n === 0 ? 0 : round1(sum((r) => r.score_percent) / n),
        score_median: round1(median),
        score_min: n === 0 ? 0 : scores[0],
        score_max: n === 0 ? 0 : scores[n - 1],
        tiers,
        paths: {
            green_path: rows.filter((r) => r.learning_path === "green_path").length,
            remediation_path: rows.filter((r) => r.learning_path === "remediation_path").length,
        },
        active_minutes_mean: n === 0 ? 0 : round1(sum((r) => r.active_minutes) / n),
        recording_minutes_total: round1(sum((r) => r.recording_minutes)),
        events_total: sum((r) => r.events),
        digits_entered_total: sum((r) => r.digits_entered),
        wrong_digits_total: sum((r) => r.wrong_digits),
        wrong_digits_by_column: {
            units: sum((r) => r.wrong_digits_units),
            tens: sum((r) => r.wrong_digits_tens),
            hundreds: sum((r) => r.wrong_digits_hundreds),
            thousands: sum((r) => r.wrong_digits_thousands),
        },
        deletions_total: sum((r) => r.deletions),
        undos_total: sum((r) => r.undos),
        hesitations_total: sum((r) => r.hesitations),
        hesitation_seconds_total: round1(sum((r) => r.hesitation_seconds_total)),
        regroupings_total: sum((r) => r.regroupings),
        socratic_cards_total: sum((r) => r.socratic_cards),
        socratic_triggers: mergeCounts((r) => r.socratic_triggers),
        error_categories: mergeCounts((r) => r.error_categories),
        reflections_submitted: rows.filter((r) => r.reflection_submitted).length,
        exercises,
    };
}
function buildClassSystemInstruction() {
    return `אתה מנתח פדגוגי של מערכת MathematiCore, המנתח את נתוני הביצוע של כיתה ג' שלמה במפגש אחד בחשבון (ערך מיקום, הקבצה, פריטה וחישוב במאונך).

חלוקת הלומדים לקבוצות עבודה כבר נקבעה בשרת לפי כלל אחוזים דטרמיניסטי, והיא סופית:
- ציון מתחת ל-50%: ${reportHtml_1.TIER_LABEL_HE.below_50}
- ציון 50%–75%: ${reportHtml_1.TIER_LABEL_HE.between_50_75}
- ציון מעל 75%: ${reportHtml_1.TIER_LABEL_HE.above_75}

חוקים מחייבים:
1. חל עליך איסור מוחלט לשנות, לסתור, או להמליץ בניגוד לחלוקה שלמעלה. אל תעביר לומד מקבוצה לקבוצה ואל תציע עזרי המחשה הסותרים אותה.
2. אל תציין ציון, אחוז או דירוג של לומד בודד. תאר דפוסים כיתתיים: אילו תרגילים, טורים ופעולות הקשו על רבים, ומה הצליח.
3. אל תפנה ללומדים ואל תנקוב בשם. לומד מזוהה במספרו בלבד.
4. בסס כל טענה על הראיות שבנתונים — תרגילים, טורים, מונים ואירועים קונקרטיים. אל תמציא נתונים שאינם בקלט.
5. כתוב בעברית תקנית, ענייני ותמציתי. כל פריט משפט אחד עד שניים.
6. החזר JSON תקין בלבד, לפי הסכימה:
{
  "class_patterns": ["string", ...],
  "teaching_recommendations": ["string", ...]
}
2 עד 5 פריטים בכל מערך. אם אין די ראיות, החזר מערכים ריקים.

מונחי הטורים: ${COLUMN_NAMES_HE.map((n, i) => `${i}=${n}`).join(", ")}.`;
}
/** Runs layer 2 for the class. Returns null on any failure; never throws. */
async function generateClassAnalysis(input) {
    if (input.learners.length === 0)
        return null;
    try {
        const ai = (0, geminiConfig_1.getGeminiClient)();
        const model = ai.getGenerativeModel({
            model: geminiConfig_1.GEMINI_MODEL_ID,
            generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
            systemInstruction: buildClassSystemInstruction(),
        });
        // An explicit projection, as in reportAnalysis.ts: only the measurements
        // the analysis reasons about reach the engine.
        const learners = input.learners.map((r) => ({
            student_id: r.student_id,
            tier: r.recommendation_tier,
            compulsory_total: r.compulsory_total,
            correct_first_attempt: r.correct_first_attempt,
            wrong_digits_by_column: [r.wrong_digits_units, r.wrong_digits_tens, r.wrong_digits_hundreds, r.wrong_digits_thousands],
            deletions: r.deletions,
            undos: r.undos,
            hesitations: r.hesitations,
            regroupings: r.regroupings,
            socratic_cards: r.socratic_cards,
            socratic_triggers: r.socratic_triggers,
            error_categories: r.error_categories,
            exercise_outcomes: r.exercise_outcomes,
        }));
        const a = input.aggregates;
        const userPrompt = `נתוני הכיתה לניתוח:

מפגש: ${input.session_number}
לומדים עם נתונים: ${a.learners_with_data}
חלוקה לקבוצות (מספרי לומדים): ${JSON.stringify(a.tiers)}
טעויות ספרה לפי טור: ${JSON.stringify(a.wrong_digits_by_column)}
תרגילים (כמה פתחו, כמה סיימו, כמה בניסיון ראשון, טעויות, כרטיסי חניכה, היסוסים):
${JSON.stringify(a.exercises)}
טריגרים של כרטיסי חניכה: ${JSON.stringify(a.socratic_triggers)}
סיווגי שגיאה: ${JSON.stringify(a.error_categories)}
סה"כ: ביטולים ${a.undos_total}, מחיקות ${a.deletions_total}, היסוסים ${a.hesitations_total}, המרות ${a.regroupings_total}, רפלקציות ${a.reflections_submitted}

שורות הלומדים (אנונימיות):
${JSON.stringify(learners)}

נסח את הדפוסים הכיתתיים שאותרו ואת המלצות ההוראה לכיתה הפיזית להמשך, בתוך החלוקה שנקבעה.`;
        const timeout = new Promise((resolve) => setTimeout(() => resolve(null), exports.CLASS_AI_ANALYSIS_TIMEOUT_MS));
        const call = model.generateContent(userPrompt).then((r) => r.response.text());
        const text = await Promise.race([call, timeout]);
        if (text === null) {
            logger.warn("[classReport] Gemini class analysis timed out; report ships with layer 1 only.", { session_number: input.session_number });
            return null;
        }
        return parseClassAnalysis(text);
    }
    catch (err) {
        logger.warn("[classReport] Gemini class analysis unavailable; report ships with layer 1 only.", { error: String(err) });
        return null;
    }
}
function parseClassAnalysis(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (_a) {
        return null;
    }
    const clean = (value) => Array.isArray(value)
        ? value.filter((x) => typeof x === "string").map((x) => x.trim()).filter((x) => x.length > 0)
        : null;
    const patterns = clean(parsed === null || parsed === void 0 ? void 0 : parsed.class_patterns);
    const recommendations = clean(parsed === null || parsed === void 0 ? void 0 : parsed.teaching_recommendations);
    if (patterns === null || recommendations === null)
        return null;
    if (patterns.length === 0 && recommendations.length === 0)
        return null;
    return { class_patterns: patterns, teaching_recommendations: recommendations };
}
// ---------------------------------------------------------------------------
// Outputs: CSV for the research, PDF for the teacher.
// ---------------------------------------------------------------------------
/** One row per learner, every measurement as its own column; BOM so Excel reads the Hebrew. */
function buildClassCsv(rows, exercises) {
    const exerciseIds = exercises.map((e) => e.exercise_id);
    const cell = (val) => {
        const text = val === null || val === undefined ? "" : typeof val === "object" ? JSON.stringify(val) : String(val);
        return `"${text.replace(/"/g, '""')}"`;
    };
    const iso = (t) => (typeof t === "number" && t > 0 ? new Date(t).toISOString() : "");
    const headers = [
        "student_id", "learning_path", "score_percent", "score_source", "recommendation_tier", "compulsory_total",
        "correct_first_attempt", "exercises_attempted", "exercises_completed", "events", "first_event_iso", "last_event_iso",
        "active_minutes", "digits_entered", "wrong_digits", "wrong_digits_units", "wrong_digits_tens", "wrong_digits_hundreds",
        "wrong_digits_thousands", "deletions", "undos", "hesitations", "hesitation_seconds_total", "regroupings",
        "socratic_cards", "socratic_triggers", "error_categories", "reflection_submitted", "reflections_count",
        "recording_minutes", "recording_truncated", "session_doc_score_percent", "session_doc_recommended_path",
        "teacher_selected_path", "teacher_gate_approved",
        ...exerciseIds.map((id) => `outcome_${id}`),
    ];
    const lines = rows.map((r) => [
        r.student_id, r.learning_path, r.score_percent, r.score_source, r.recommendation_tier, r.compulsory_total,
        r.correct_first_attempt, r.exercises_attempted, r.exercises_completed, r.events, iso(r.first_event_at), iso(r.last_event_at),
        r.active_minutes, r.digits_entered, r.wrong_digits, r.wrong_digits_units, r.wrong_digits_tens, r.wrong_digits_hundreds,
        r.wrong_digits_thousands, r.deletions, r.undos, r.hesitations, r.hesitation_seconds_total, r.regroupings,
        r.socratic_cards, r.socratic_triggers, r.error_categories, r.reflection_submitted, r.reflections_count,
        r.recording_minutes, r.recording_truncated, r.session_doc_score_percent, r.session_doc_recommended_path,
        r.teacher_selected_path, r.teacher_gate_approved,
        ...exerciseIds.map((id) => { var _a; return (_a = r.exercise_outcomes[id]) !== null && _a !== void 0 ? _a : "not_attempted"; }),
    ].map(cell).join(","));
    return "﻿" + [headers.map(cell).join(","), ...lines].join("\n");
}
/**
 * Renders the class report to a PDF buffer: HTML printed by headless Chromium,
 * with the pdfkit renderer below as the rollback path (PDF_ENGINE=pdfkit, or
 * automatically if Chromium fails). See htmlPdf.ts.
 */
function createClassReportPdfBuffer(report) {
    return (0, htmlPdf_1.renderWithFallback)("classReport", () => (0, htmlPdf_1.renderHtmlToPdf)((0, reportHtml_1.classReportHtml)(report), Object.assign(Object.assign({}, reportHtml_1.CLASS_REPORT_PDF_OPTIONS), { footerTemplate: (0, reportHtml_1.reportFooterTemplate)(report.generated_at) })), () => createClassReportPdfBufferWithPdfkit(report));
}
/**
 * Legacy renderer: pdfkit + the hebrewPdf bidi workaround. Kept verbatim as
 * the rollback path for the Chromium renderer above.
 */
function createClassReportPdfBufferWithPdfkit(report) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: "A4", margin: 40 });
            const chunks = [];
            doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            doc.on("end", () => resolve(Buffer.concat(chunks)));
            doc.on("error", (err) => reject(err));
            const fontCandidates = [
                path.join(__dirname, "../fonts/Arial.ttf"),
                path.join(__dirname, "fonts/Arial.ttf"),
                path.join(process.cwd(), "fonts/Arial.ttf"),
            ];
            for (const f of fontCandidates) {
                if (fs.existsSync(f)) {
                    doc.font(f);
                    break;
                }
            }
            const a = report.aggregates;
            const rows = report.learners;
            const line = (text, size = 10, color = "#334155", indentRight = 0) => {
                doc.fontSize(size).fillColor(color);
                (0, hebrewPdf_1.rtlText)(doc, text, { lineGap: 3, indentRight });
            };
            const heading = (text, color = "#1e293b") => {
                doc.moveDown(0.8);
                doc.fontSize(14).fillColor(color);
                (0, hebrewPdf_1.rtlText)(doc, text);
                doc.moveDown(0.3);
            };
            doc.fontSize(22).fillColor("#1e1b4b");
            (0, hebrewPdf_1.rtlText)(doc, report.title_he, { align: "center" });
            doc.moveDown(0.4);
            doc.fontSize(11).fillColor("#475569");
            (0, hebrewPdf_1.rtlText)(doc, "דוח כיתתי חסוי | מדיניות אפס מידע מזהה (Zero PII) | לומדים מזוהים במספר בלבד", { align: "center" });
            doc.moveDown(1);
            doc.rect(40, doc.y, 515, 60).fillAndStroke("#f8fafc", "#cbd5e1");
            doc.fillColor("#0f172a").fontSize(11);
            const cardY = doc.y + 12;
            (0, hebrewPdf_1.rtlText)(doc, `מפגש: ${report.session_number}`, 400, cardY, { width: 140 });
            (0, hebrewPdf_1.rtlText)(doc, `לומדים עם נתונים: ${a.learners_with_data} מתוך 12`, 200, cardY, { width: 190 });
            (0, hebrewPdf_1.rtlText)(doc, `ציון ממוצע: ${a.score_mean}%`, 55, cardY, { width: 140 });
            (0, hebrewPdf_1.rtlText)(doc, `חציון: ${a.score_median}% | טווח: ${a.score_min}%–${a.score_max}% | מסלול ירוק: ${a.paths.green_path} | מסלול ביסוס: ${a.paths.remediation_path}`, 55, cardY + 25, { width: 490 });
            doc.x = 40;
            doc.y = cardY + 60;
            heading("1. קבוצות עבודה לפי כלל האחוזים (שכבה 1, דטרמיניסטית)", "#166534");
            for (const tier of ["below_50", "between_50_75", "above_75"]) {
                const ids = a.tiers[tier];
                line(`${reportHtml_1.TIER_LABEL_HE[tier]}: ${ids.length > 0 ? ids.map((id) => `תלמיד ${id}`).join(", ") : "אין"}`, 10, "#14532d");
            }
            if (a.learners_without_data.length > 0) {
                line(`ללא פעולות מתועדות במפגש זה: ${a.learners_without_data.map((id) => `תלמיד ${id}`).join(", ")}`, 9, "#64748b");
            }
            heading("2. תמונת מצב כיתתית");
            line(`פעולות מתועדות: ${a.events_total} | ספרות שהוזנו: ${a.digits_entered_total} | ספרות שגויות: ${a.wrong_digits_total} (אחדות ${a.wrong_digits_by_column.units}, עשרות ${a.wrong_digits_by_column.tens}, מאות ${a.wrong_digits_by_column.hundreds}, אלפים ${a.wrong_digits_by_column.thousands})`);
            line(`מחיקות: ${a.deletions_total} | ביטולים: ${a.undos_total} | היסוסים: ${a.hesitations_total} (${a.hesitation_seconds_total} שניות) | המרות (הקבצה/פריטה): ${a.regroupings_total}`);
            const triggers = Object.entries(a.socratic_triggers).map(([k, v]) => `${k}: ${v}`).join(", ");
            const categories = Object.entries(a.error_categories).map(([k, v]) => `${k}: ${v}`).join(", ");
            line(`כרטיסי חניכה: ${a.socratic_cards_total}${triggers ? ` (${triggers})` : ""} | סיווגי שגיאה: ${categories || "אין"}`);
            line(`זמן פעילות ממוצע: ${a.active_minutes_mean} דקות | דקות הקלטה: ${a.recording_minutes_total} | רפלקציות: ${a.reflections_submitted} מתוך ${a.learners_with_data}`);
            heading("3. תרגילים: כמה לומדים פתרו בניסיון ראשון");
            if (a.exercises.length === 0)
                line("לא נרשמו תרגילים.");
            for (const ex of a.exercises) {
                line(`${ex.exercise_id}: פתחו ${ex.attempted}, סיימו ${ex.completed}, בניסיון ראשון ${ex.first_try} (${ex.first_try_percent}%) | ספרות שגויות ${ex.wrong_digits} | כרטיסים ${ex.socratic_cards} | היסוסים ${ex.hesitations}`);
            }
            heading("4. טבלת הלומדים (כל מה שנמדד ליחיד)");
            line("לומד | ציון | נכון בניסיון ראשון | תרגילים | ספרות שגויות (א/ע/מ/אל) | מחיקות | ביטולים | היסוסים | המרות | כרטיסים | דקות | רפלקציה", 8, "#64748b");
            for (const r of rows) {
                line(`תלמיד ${r.student_id} | ${r.score_percent}% | ${r.correct_first_attempt}/${r.compulsory_total} | ${r.exercises_completed}/${r.exercises_attempted} | ${r.wrong_digits} (${r.wrong_digits_units}/${r.wrong_digits_tens}/${r.wrong_digits_hundreds}/${r.wrong_digits_thousands}) | ${r.deletions} | ${r.undos} | ${r.hesitations} | ${r.regroupings} | ${r.socratic_cards} | ${r.active_minutes} | ${r.reflection_submitted ? "כן" : "לא"}`, 9, "#0f172a");
                const outcomes = Object.entries(r.exercise_outcomes).map(([id, o]) => `${id}: ${reportHtml_1.OUTCOME_HE[o]}`).join(", ");
                if (outcomes)
                    line(outcomes, 8, "#64748b", 16);
            }
            heading("5. ניתוח הבינה: דפוסים כיתתיים והמלצות הוראה", "#92400e");
            const patterns = Array.isArray(report.class_patterns) ? report.class_patterns : [];
            const teaching = Array.isArray(report.teaching_recommendations) ? report.teaching_recommendations : [];
            if (patterns.length > 0 || teaching.length > 0) {
                if (patterns.length > 0) {
                    line("דפוסים כיתתיים שאותרו:", 11, "#92400e");
                    for (const p of patterns)
                        line(`• ${p}`, 10, "#78350f");
                }
                if (teaching.length > 0) {
                    doc.moveDown(0.3);
                    line("המלצות הוראה לכיתה:", 11, "#92400e");
                    for (const t of teaching)
                        line(`• ${t}`, 10, "#78350f");
                }
            }
            else {
                line(pedagogicalReport_1.EXACT_AI_FALLBACK_TEXT, 10, "#78350f");
            }
            doc.moveDown(1.5);
            const genTime = report.generated_at ? new Date(report.generated_at) : new Date();
            doc.fontSize(8).fillColor("#94a3b8");
            (0, hebrewPdf_1.rtlText)(doc, `נוצר אוטומטית בתאריך ${genTime.toLocaleDateString("he-IL")} | מנוע MathematiCore v7.0`, { align: "center" });
            doc.end();
        }
        catch (err) {
            reject(err);
        }
    });
}
// ---------------------------------------------------------------------------
// The callable.
// ---------------------------------------------------------------------------
exports.generateClassMeetingReport = (0, https_1.onCall)(exports.CLASS_REPORT_RUNTIME, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated.");
    }
    const token = request.auth.token;
    const callerRoles = Array.isArray(token.roles) ? token.roles : token.role ? [token.role] : [];
    const isTeacher = callerRoles.includes("TEACHER") || token.role === "teacher" || token.teacher === true;
    const isAdmin = callerRoles.includes("ADMIN") || token.role === "admin" || token.admin === true;
    if (!isTeacher && !isAdmin) {
        throw new https_1.HttpsError("permission-denied", "Only teachers or admins may generate a class report.");
    }
    const { classId = "class_1" } = request.data || {};
    const sessionNumber = Number((_a = request.data) === null || _a === void 0 ? void 0 : _a.sessionNumber);
    if (!Number.isInteger(sessionNumber) || sessionNumber < 1 || sessionNumber > 8) {
        throw new https_1.HttpsError("invalid-argument", "sessionNumber must be 1-8.");
    }
    if (isTeacher && !isAdmin && token.class_id && token.class_id !== classId) {
        throw new https_1.HttpsError("permission-denied", "Teacher is restricted to their own class.");
    }
    const db = admin.firestore();
    const rtdb = admin.database();
    // ── 1. Every telemetry event of this meeting, per learner ──────────────
    const allTelemetry = await (0, meetingMetrics_1.readAllDocs)(db.collection("telemetry_logs"));
    const eventsByLearner = new Map();
    let telemetryEventCount = 0;
    for (const { data } of allTelemetry) {
        if ((0, meetingMetrics_1.sessionNumberFromId)(String(data.session_id || "")) !== sessionNumber)
            continue;
        const n = studentNumber(data.student_id);
        if (n === null)
            continue;
        telemetryEventCount++;
        eventsByLearner.set(n, [...((_b = eventsByLearner.get(n)) !== null && _b !== void 0 ? _b : []), data]);
    }
    if (eventsByLearner.size === 0) {
        throw new https_1.HttpsError("not-found", `אין פעולות מתועדות למפגש ${sessionNumber} של אף תלמיד; אין מה לנתח.`);
    }
    // ── 2. The learners' live records: path, recordings ─────────────────────
    const studentsSnap = await rtdb.ref("users/students").get();
    const studentsNode = studentsSnap.val() || {};
    const learnerPath = new Map();
    const recordingByLearner = new Map();
    for (const [key, raw] of Object.entries(studentsNode)) {
        const n = studentNumber(key);
        if (n === null || !raw || typeof raw !== "object")
            continue;
        const node = raw;
        if (!learnerPath.has(n)) {
            learnerPath.set(n, node.teacher_selected_path === "remediation_path" || node.pedagogicalPath === "remediation_path" ? "remediation_path" : "green_path");
        }
        const recordings = node.telemetry_sessions && typeof node.telemetry_sessions === "object" ? node.telemetry_sessions : {};
        for (const rec of Object.values(recordings)) {
            if (!rec || typeof rec !== "object")
                continue;
            const metas = Object.values((rec.metadata && typeof rec.metadata === "object" ? rec.metadata : {}))
                .filter((m) => m && typeof m.startTime === "number");
            const meeting = (_d = (_c = metas.find((m) => typeof m.sessionNumber === "number")) === null || _c === void 0 ? void 0 : _c.sessionNumber) !== null && _d !== void 0 ? _d : null;
            if (meeting !== sessionNumber || metas.length === 0)
                continue;
            const start = Math.min(...metas.map((m) => m.startTime));
            const end = Math.max(...metas.map((m) => (typeof m.endTime === "number" ? m.endTime : m.startTime)));
            const prev = (_e = recordingByLearner.get(n)) !== null && _e !== void 0 ? _e : { minutes: 0, truncated: false };
            recordingByLearner.set(n, {
                minutes: round1(prev.minutes + (end - start) / 60000),
                truncated: prev.truncated || rec.recording_truncated === true,
            });
        }
    }
    // ── 3. Session documents and reflections of this meeting ────────────────
    const sessionDocs = await (0, meetingMetrics_1.readAllDocs)(db.collection("sessions").where("class_id", "==", classId))
        .catch(async () => (0, meetingMetrics_1.readAllDocs)(db.collection("sessions")));
    const sessionDocByLearner = new Map();
    for (const { data } of sessionDocs) {
        const n = studentNumber(data.student_id);
        const m = Number(data.session_number) || (0, meetingMetrics_1.sessionNumberFromId)(String(data.session_id || ""));
        if (n !== null && m === sessionNumber)
            sessionDocByLearner.set(n, data);
    }
    const reflectionDocs = await (0, meetingMetrics_1.readAllDocs)(db.collection("srl_reflections")).catch(() => []);
    const reflectionsByLearner = new Map();
    for (const { data } of reflectionDocs) {
        const n = studentNumber(data.student_id);
        const m = Number(data.session_number) || (0, meetingMetrics_1.sessionNumberFromId)(String(data.session_id || ""));
        if (n !== null && m === sessionNumber)
            reflectionsByLearner.set(n, ((_f = reflectionsByLearner.get(n)) !== null && _f !== void 0 ? _f : 0) + 1);
    }
    // ── 4. One row per learner, then the class ──────────────────────────────
    const compulsoryCache = new Map();
    const learners = [];
    for (const n of Array.from(eventsByLearner.keys()).sort((a, b) => a - b)) {
        const pathOf = (_g = learnerPath.get(n)) !== null && _g !== void 0 ? _g : "green_path";
        const compulsory = await (0, meetingMetrics_1.resolveCompulsoryTotal)(db, sessionNumber, pathOf, compulsoryCache);
        learners.push(buildLearnerRow(n, (_h = eventsByLearner.get(n)) !== null && _h !== void 0 ? _h : [], compulsory, pathOf, (_j = sessionDocByLearner.get(n)) !== null && _j !== void 0 ? _j : null, (_k = recordingByLearner.get(n)) !== null && _k !== void 0 ? _k : null, (_l = reflectionsByLearner.get(n)) !== null && _l !== void 0 ? _l : 0));
    }
    const aggregates = aggregateClass(learners, eventsByLearner);
    // ── 5. Layer 2 ──────────────────────────────────────────────────────────
    const analysis = await generateClassAnalysis({ class_id: classId, session_number: sessionNumber, aggregates, learners });
    const generatedAt = Date.now();
    const reportId = `${classId}_session_${sessionNumber}`;
    const report = {
        report_id: reportId,
        class_id: classId,
        session_number: sessionNumber,
        title_he: `MathematiCore - דוח כיתה למפגש ${sessionNumber}`,
        generated_at: generatedAt,
        telemetry_event_count: telemetryEventCount,
        learners,
        aggregates,
        class_patterns: (_m = analysis === null || analysis === void 0 ? void 0 : analysis.class_patterns) !== null && _m !== void 0 ? _m : [],
        teaching_recommendations: (_o = analysis === null || analysis === void 0 ? void 0 : analysis.teaching_recommendations) !== null && _o !== void 0 ? _o : [],
        ai_analysis_available: Boolean(analysis),
        ai_fallback_text: pedagogicalReport_1.EXACT_AI_FALLBACK_TEXT,
    };
    // ── 6. PDF + CSV to Storage, mirror to Drive, record in Firestore ───────
    const stamp = new Date(generatedAt).toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
    const bucket = admin.storage().bucket();
    const pdfPath = `reports/${classId}/session_${sessionNumber}/class_report_${generatedAt}.pdf`;
    const csvPath = `reports/${classId}/session_${sessionNumber}/class_table_${generatedAt}.csv`;
    const pdfBuffer = await createClassReportPdfBuffer(report);
    const csvText = buildClassCsv(learners, aggregates.exercises);
    const csvBuffer = Buffer.from(csvText, "utf-8");
    const tokenUrl = (storagePath, downloadToken) => `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;
    const pdfToken = require("crypto").randomUUID();
    const csvToken = require("crypto").randomUUID();
    const meta = { class_id: classId, session_number: String(sessionNumber), read_only: "true" };
    try {
        await bucket.file(pdfPath).save(pdfBuffer, { contentType: "application/pdf", metadata: { metadata: Object.assign(Object.assign({}, meta), { firebaseStorageDownloadTokens: pdfToken }) } });
        await bucket.file(csvPath).save(csvBuffer, { contentType: "text/csv; charset=utf-8", metadata: { metadata: Object.assign(Object.assign({}, meta), { firebaseStorageDownloadTokens: csvToken }) } });
    }
    catch (err) {
        logger.error("[classReport] Storage write failed:", err);
        throw new https_1.HttpsError("internal", `הדוח חושב אך שמירת הקבצים נכשלה: ${(err === null || err === void 0 ? void 0 : err.message) || err}`);
    }
    const pdfUrl = tokenUrl(pdfPath, pdfToken);
    const csvUrl = tokenUrl(csvPath, csvToken);
    let drivePdfUrl = null;
    let driveCsvUrl = null;
    try {
        const folderId = await (0, exportDriveReport_1.resolveDriveFolder)([exportDriveReport_1.DRIVE_FOLDERS.classReports, `מפגש ${sessionNumber}`]);
        const pdfRes = await (0, exportDriveReport_1.uploadBufferToDrive)(pdfBuffer, `דוח_כיתה_מפגש${sessionNumber}_${stamp}.pdf`, "application/pdf", folderId);
        if (pdfRes.success)
            drivePdfUrl = pdfRes.webViewLink;
        else
            logger.warn(`[classReport] Drive PDF mirror skipped: ${pdfRes.error}`);
        const csvRes = await (0, exportDriveReport_1.uploadBufferToDrive)(csvBuffer, `טבלת_כיתה_מפגש${sessionNumber}_${stamp}.csv`, "text/csv", folderId);
        if (csvRes.success)
            driveCsvUrl = csvRes.webViewLink;
        else
            logger.warn(`[classReport] Drive CSV mirror skipped: ${csvRes.error}`);
    }
    catch (err) {
        logger.warn(`[classReport] Drive mirror failed (non-fatal): ${(err === null || err === void 0 ? void 0 : err.message) || err}`);
    }
    const stored = Object.assign(Object.assign({}, report), { storage_pdf_path: pdfPath, storage_csv_path: csvPath, pdf_url: pdfUrl, csv_url: csvUrl, drive_pdf_url: drivePdfUrl, drive_csv_url: driveCsvUrl, created_at: admin.firestore.FieldValue.serverTimestamp(), is_read_only: true });
    await db.collection("class_reports").doc(reportId).set(stored);
    logger.info(`[classReport] Class report for ${classId} meeting ${sessionNumber}: ${learners.length} learners, ${telemetryEventCount} events.`);
    return {
        status: "SUCCESS",
        report: Object.assign(Object.assign({}, report), { pdf_url: pdfUrl, csv_url: csvUrl, drive_pdf_url: drivePdfUrl, drive_csv_url: driveCsvUrl }),
    };
});
//# sourceMappingURL=classReport.js.map