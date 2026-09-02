"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AI_ANALYSIS_TIMEOUT_MS = void 0;
exports.resolveRecommendationTier = resolveRecommendationTier;
exports.buildFailedExercises = buildFailedExercises;
exports.buildTelemetrySummary = buildTelemetrySummary;
exports.generateReportAnalysis = generateReportAnalysis;
exports.parseAnalysisResponse = parseAnalysisResponse;
const logger = require("firebase-functions/logger");
const geminiConfig_1 = require("./geminiConfig");
/**
 * The tier boundaries are the PRD's, and they are the same 50% line Module 20
 * uses to pick matrix_recommended_path. 75 itself belongs to the middle tier —
 * the spec's third band reads "> 75%" and says explicitly "(לא כולל 75)".
 */
function resolveRecommendationTier(scorePercent) {
    if (scorePercent < 50)
        return "below_50";
    if (scorePercent <= 75)
        return "between_50_75";
    return "above_75";
}
/** Human-readable statement of layer 1's decision, handed to the engine as a constraint. */
const TIER_FRAMEWORK_HE = {
    below_50: "עבודה בקבוצה הומוגנית קטנה, תיווך פרונטלי צמוד של המורה, ושימוש בתבניות עשר פיזיות ומקלות מנייה.",
    between_50_75: "עבודה בקבוצה הטרוגנית הכוללת את שני הקצוות, שיח עמיתים ופתרון בעיות משותף באמצעות חשבונייה פיזית.",
    above_75: "עבודה עצמאית עם משימות האתגר והעומק של כיתה ג', ושימוש בלוח מחיק פיזי וכרטיסיות מספרים.",
};
/**
 * The PRD's expected outcome for this module is a PDF produced in under a
 * second, while the same module mandates an AI-authored analysis layer and an
 * explicit timeout fallback. Those two cannot both hold on a cold model call,
 * so the timeout is the knob that decides which one gives: short enough that a
 * stalled engine never holds the teacher's download hostage, long enough that
 * a healthy call normally lands. On expiry the report ships complete with
 * layer 1 and the fixed fallback sentence, exactly as the spec prescribes.
 */
exports.AI_ANALYSIS_TIMEOUT_MS = 8000;
const COLUMN_NAMES_HE = ["אחדות", "עשרות", "מאות", "אלפים"];
/**
 * Builds the exercise templates for the exercises the learner actually erred
 * on, preferring the canonical Module 26 catalog in Firestore and falling back
 * to what the telemetry itself proves when a bank is unavailable.
 *
 * Fields are copied one by one rather than spread. Zero-PII is a structural
 * guarantee here, not a regex applied afterwards: nothing reaches the engine
 * except values this function names explicitly, so no field added to a task or
 * an event upstream can ever ride along unnoticed.
 */
function buildFailedExercises(failedExerciseIds, regroupingColumnsByExercise, catalogTasks, sessionNumber, learningPath) {
    const byId = new Map();
    catalogTasks.forEach((task, idx) => {
        if (task && typeof task.id === "string") {
            byId.set(task.id, Object.assign(Object.assign({}, task), { __order: idx + 1 }));
        }
    });
    return failedExerciseIds.map((exerciseId) => {
        const task = byId.get(exerciseId);
        const regroupingColumns = regroupingColumnsByExercise[exerciseId] || [];
        if (!task) {
            // No catalog entry — describe only what the telemetry itself establishes.
            return {
                exercise_template_id: exerciseId,
                session_number: sessionNumber,
                order_index: 0,
                learning_path: learningPath,
                path_type: "compulsory",
                operation: "addition",
                operand_a: null,
                operand_b: null,
                expected_result: null,
                required_regroupings: regroupingColumns.length,
                regrouping_columns: regroupingColumns,
                label: exerciseId,
            };
        }
        const isSubtraction = task.isSubtraction === true;
        const operation = task.type === "missing_element" || task.type === "inquiry"
            ? "inquiry"
            : task.type === "representation"
                ? "representation"
                : isSubtraction
                    ? "subtraction"
                    : "addition";
        return {
            exercise_template_id: exerciseId,
            session_number: sessionNumber,
            order_index: typeof task.__order === "number" ? task.__order : 0,
            learning_path: learningPath,
            path_type: task.isOptionalChoiceTask === true ? "consolidation" : "compulsory",
            operation,
            operand_a: typeof task.numberA === "number" ? task.numberA : null,
            operand_b: typeof task.numberB === "number" ? task.numberB : null,
            expected_result: typeof task.correctAnswer === "number" || typeof task.correctAnswer === "string"
                ? task.correctAnswer
                : null,
            required_regroupings: regroupingColumns.length,
            regrouping_columns: regroupingColumns,
            label: typeof task.titleHe === "string" ? task.titleHe : exerciseId,
        };
    });
}
/**
 * Reduces raw telemetry documents to the whitelisted event shape the engine
 * receives. Same reasoning as buildFailedExercises: an explicit projection, not
 * a scrub of arbitrary content.
 */
function buildTelemetrySummary(telemetryDocs, limit = 120) {
    return telemetryDocs.slice(0, limit).map((doc) => {
        const raw = (doc && typeof doc.details === "object" && doc.details) || {};
        const details = {};
        // Only the numeric/boolean measurements the analysis reasons about.
        for (const key of [
            "is_correct",
            "digit_value",
            "deleted_digit_value",
            "block_value",
            "hesitation_seconds",
            "regrouping_type",
            "error_category",
            "duration_ms",
        ]) {
            if (raw[key] !== undefined && raw[key] !== null)
                details[key] = raw[key];
        }
        return {
            event_type: String((doc === null || doc === void 0 ? void 0 : doc.event_type) || "UNKNOWN"),
            exercise_id: String((doc === null || doc === void 0 ? void 0 : doc.exercise_id) || ""),
            column_index: typeof (doc === null || doc === void 0 ? void 0 : doc.column_index) === "number" ? doc.column_index : null,
            details,
        };
    });
}
function buildSystemInstruction(tier) {
    return `אתה מנתח פדגוגי של מערכת MathematiCore, המנתח נתוני ביצוע של תלמיד כיתה ג' בחשבון (ערך מיקום, הקבצה, פריטה וחישוב במאונך).

מסגרת ההמלצה כבר נקבעה בשרת לפי כלל אחוזים דטרמיניסטי, והיא סופית:
"${TIER_FRAMEWORK_HE[tier]}"

חוקים מחייבים:
1. חל עליך איסור מוחלט לשנות, לסתור, או להמליץ בניגוד למסגרת שלמעלה. אל תציע סוג קבוצת עבודה אחר ואל תציע עזרי המחשה פיזיים הסותרים אותה. ההמלצות שלך פועלות בתוך המסגרת הזאת בלבד.
2. אל תציין ציון, אחוז או דירוג כלשהו. שכבת הכללים כבר מציגה אותם.
3. אל תפנה לתלמיד ואל תנקוב בשם. התלמיד אנונימי ומזוהה במספר בלבד.
4. בסס כל טענה על הראיות שבנתונים — טורים, מספרים ואירועים קונקרטיים. אל תמציא נתונים שאינם בקלט.
5. כתוב בעברית תקנית, ענייני ותמציתי. כל פריט משפט אחד עד שניים.
6. החזר JSON תקין בלבד, לפי הסכימה:
{
  "knowledge_gaps": ["string", ...],
  "teaching_recommendations": ["string", ...]
}
2 עד 4 פריטים בכל מערך. אם אין די ראיות לפער כלשהו, החזר מערכים ריקים.

מונחי הטורים: ${COLUMN_NAMES_HE.map((n, i) => `${i}=${n}`).join(", ")}.`;
}
/**
 * Runs layer 2. Returns null on ANY failure — missing credential, malformed
 * response, timeout — so the caller falls back to layer 1 plus the fixed
 * sentence. This function never throws.
 */
async function generateReportAnalysis(req) {
    // Nothing to analyse: the learner made no recorded errors, so there is no
    // gap to describe and inventing one would contradict rule 4.
    if (req.failed_exercises.length === 0 && req.telemetry_summary.length === 0) {
        return null;
    }
    try {
        const ai = (0, geminiConfig_1.getGeminiClient)();
        const model = ai.getGenerativeModel({
            model: geminiConfig_1.GEMINI_MODEL_ID,
            generationConfig: {
                temperature: 0.3,
                responseMimeType: "application/json",
            },
            systemInstruction: buildSystemInstruction(req.recommendation_tier),
        });
        const userPrompt = `נתוני הלומד לניתוח:

מזהה אנונימי: ${req.student_id}
מפגש: ${req.session_number}

תרגילים שבהם נרשמו שגיאות (תבניות מלאות):
${JSON.stringify(req.failed_exercises, null, 2)}

רצף אירועי הטלמטריה במפגש:
${JSON.stringify(req.telemetry_summary)}

נסח את פערי הידע הספציפיים שאותרו ואת המלצות ההוראה להמשך העבודה בכיתה הפיזית, בתוך המסגרת שנקבעה.`;
        const timeout = new Promise((resolve) => setTimeout(() => resolve(null), exports.AI_ANALYSIS_TIMEOUT_MS));
        const call = model
            .generateContent(userPrompt)
            .then((r) => r.response.text());
        const text = await Promise.race([call, timeout]);
        if (text === null) {
            logger.warn("[reportAnalysis] Gemini analysis timed out; report ships with layer 1 only.", {
                session_id: req.session_id,
                timeout_ms: exports.AI_ANALYSIS_TIMEOUT_MS,
            });
            return null;
        }
        return parseAnalysisResponse(text, req.session_id);
    }
    catch (err) {
        logger.warn("[reportAnalysis] Gemini analysis unavailable; report ships with layer 1 only.", {
            session_id: req.session_id,
            error: String(err),
        });
        return null;
    }
}
/**
 * A response missing either array, or carrying anything but non-empty strings,
 * is malformed — treated exactly like a failed call rather than rendered
 * half-populated.
 */
function parseAnalysisResponse(text, sessionId = "") {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (_a) {
        logger.warn("[reportAnalysis] Gemini returned non-JSON; treating as unavailable.", {
            session_id: sessionId,
        });
        return null;
    }
    const clean = (value) => {
        if (!Array.isArray(value))
            return null;
        const items = value
            .filter((item) => typeof item === "string")
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
        return items.length === value.length ? items : items;
    };
    const gaps = clean(parsed === null || parsed === void 0 ? void 0 : parsed.knowledge_gaps);
    const recommendations = clean(parsed === null || parsed === void 0 ? void 0 : parsed.teaching_recommendations);
    if (gaps === null || recommendations === null) {
        logger.warn("[reportAnalysis] Gemini response missing required arrays; treating as unavailable.", {
            session_id: sessionId,
        });
        return null;
    }
    if (gaps.length === 0 && recommendations.length === 0)
        return null;
    return { knowledge_gaps: gaps, teaching_recommendations: recommendations };
}
//# sourceMappingURL=reportAnalysis.js.map