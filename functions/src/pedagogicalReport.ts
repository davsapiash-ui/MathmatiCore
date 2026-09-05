import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";
import { DRIVE_FOLDERS, resolveDriveFolder, uploadBufferToDrive } from "./exportDriveReport";
import { GEMINI_SECRETS } from "./geminiConfig";
import {
  buildFailedExercises,
  buildTelemetrySummary,
  generateReportAnalysis,
  resolveRecommendationTier,
} from "./reportAnalysis";
const PDFDocument = require("pdfkit");
const bidiFactory = require("bidi-js");
const bidi = bidiFactory();

/**
 * Standard Unicode Bidirectional Algorithm (UAX #9) with line-wrapping
 * for rendering clean, natural Hebrew in PDFKit without character reversal or word transposition.
 */
export function wrapAndBidi(text: string, maxChars = 75): string {
  if (!text) return "";
  const resultLines: string[] = [];
  const rawLines = text.split("\n");
  for (const rawLine of rawLines) {
    const words = rawLine.split(" ");
    let currentLine = "";
    for (const word of words) {
      if ((currentLine + " " + word).trim().length > maxChars) {
        if (currentLine) {
          try {
            const levels = bidi.getEmbeddingLevels(currentLine, "rtl");
            resultLines.push(bidi.getReorderedString(currentLine, levels));
          } catch {
            resultLines.push(currentLine);
          }
        }
        currentLine = word;
      } else {
        currentLine = currentLine ? currentLine + " " + word : word;
      }
    }
    if (currentLine) {
      try {
        const levels = bidi.getEmbeddingLevels(currentLine, "rtl");
        resultLines.push(bidi.getReorderedString(currentLine, levels));
      } catch {
        resultLines.push(currentLine);
      }
    }
  }
  return resultLines.join("\n");
}

export function shapeRtl(text: string): string {
  return wrapAndBidi(text, 120);
}

export const EXACT_AI_FALLBACK_TEXT = "הניתוח הפדגוגי המפורט אינו זמין כעת. ההמלצות שלהלן מבוססות על מדדי הביצוע.";

const COLUMN_NAMES_HE = ["אחדות", "עשרות", "מאות", "אלפים"];

/**
 * Module 23 — the opening chapter of the report: the Exercise Narrative.
 *
 * Written server-side from the telemetry sequence using fixed phrasing
 * templates, never by the AI engine, and it precedes the engine's analysis so
 * the teacher reads it as context for that analysis.
 *
 * The spec is explicit that each paragraph names concrete numbers and columns
 * and NOT aggregate measures alone, and that it weaves in, in the order they
 * actually occurred: the canvas representation, regrouping or decomposition,
 * digits entered in the memory circles and the result row, deletions, undos,
 * prolonged hesitations, and the appearance of a Socratic card. An earlier
 * revision emitted one fixed sentence per exercise with counters plugged into
 * it ("performed 12 drags, entered 4 digits, used 2 undos"), which is exactly
 * the aggregate-only form the spec rules out, and it dropped deletions,
 * hesitations and Socratic cards entirely.
 */
function generateExerciseNarrativeFromEvents(telemetryDocs: Record<string, any>[]): string[] {
  const narratives: string[] = [];
  const exerciseMap: Record<string, any[]> = {};

  // Group events chronologically by exercise_id
  telemetryDocs.sort((a, b) => (a.client_timestamp || 0) - (b.client_timestamp || 0));
  for (const doc of telemetryDocs) {
    const exId = doc.exercise_id || "ex_1";
    if (!exerciseMap[exId]) exerciseMap[exId] = [];
    exerciseMap[exId].push(doc);
  }

  const ORDINALS_HE = [
    "הראשון", "השני", "השלישי", "הרביעי", "החמישי", "השישי", "השביעי",
    "השמיני", "התשיעי", "העשירי",
  ];
  const colName = (idx: number | null | undefined) =>
    typeof idx === "number" && COLUMN_NAMES_HE[idx] ? COLUMN_NAMES_HE[idx] : null;

  let exerciseIdx = 1;
  for (const [exId, events] of Object.entries(exerciseMap)) {
    // Each clause is emitted only if that thing actually happened, in the order
    // it happened, so the paragraph reads as this learner's actual run rather
    // than a fixed sentence with counters plugged into it.
    const clauses: string[] = [];
    let representedColumns: number[] = [];
    let pendingDigits: { col: number | null; wrong: number }[] = [];
    let firstAttemptCorrect = true;
    let completed = false;

    const flushDigits = () => {
      if (pendingDigits.length === 0) return;
      const wrong = pendingDigits.filter((d) => d.wrong > 0);
      const cols = Array.from(
        new Set(pendingDigits.map((d) => colName(d.col)).filter(Boolean))
      ) as string[];
      const where = cols.length > 0 ? ` בטור ה${cols.join(" ובטור ה")}` : "";
      if (wrong.length > 0) {
        clauses.push(`הזין ספרות שגויות${where} (${wrong.length} פעמים)`);
      } else {
        clauses.push(`הזין את הספרות${where}`);
      }
      pendingDigits = [];
    };

    for (const ev of events) {
      const col = typeof ev.column_index === "number" ? ev.column_index : null;
      switch (ev.event_type) {
        case "BLOCK_DRAG_COMPLETE": {
          const value = ev.details?.block_value;
          if (typeof value === "number") representedColumns.push(value);
          break;
        }
        case "REGROUPING_SUCCESS": {
          flushDigits();
          const type = ev.details?.regrouping_type;
          const verb = type === "decomposition" ? "ביצע פריטה" : "ביצע הקבצה";
          const where = colName(col);
          clauses.push(where ? `${verb} מטור ה${where}` : verb);
          break;
        }
        case "DIGIT_ENTERED": {
          const isCorrect = ev.details?.is_correct;
          if (isCorrect === false) firstAttemptCorrect = false;
          pendingDigits.push({ col, wrong: isCorrect === false ? 1 : 0 });
          break;
        }
        case "DIGIT_DELETED": {
          flushDigits();
          const where = colName(col);
          clauses.push(where ? `מחק את הספרה בטור ה${where}` : "מחק ספרה");
          break;
        }
        case "UNDO_EXECUTED": {
          flushDigits();
          clauses.push("ביטל את הפעולה האחרונה");
          break;
        }
        case "HESITATION_DETECTED": {
          flushDigits();
          const seconds = ev.details?.hesitation_seconds;
          clauses.push(
            typeof seconds === "number" ? `השתהה ${Math.round(seconds)} שניות` : "השתהה זמן ממושך"
          );
          break;
        }
        case "SOCRATIC_CARD_SHOWN": {
          flushDigits();
          clauses.push("קיבל כרטיס חניכה");
          break;
        }
        case "PROBLEM_COMPLETE": {
          flushDigits();
          completed = true;
          break;
        }
        default:
          break;
      }
    }
    flushDigits();

    // The canvas representation opens the paragraph, naming the actual block
    // values dragged rather than a drag tally.
    if (representedColumns.length > 0) {
      const distinct = Array.from(new Set(representedColumns)).sort((a, b) => b - a);
      clauses.unshift(`ייצג את המספרים בקנבס באמצעות בלוקים של ${distinct.join(", ")}`);
    }

    const ordinal = ORDINALS_HE[exerciseIdx - 1] || `ה-${exerciseIdx}`;
    const ending = completed
      ? firstAttemptCorrect
        ? "והשלים את התרגיל בניסיון הראשון"
        : "והשלים את התרגיל לאחר תיקון"
      : "ולא השלים את התרגיל";

    const body = clauses.length > 0 ? clauses.join(", ") + ", " : "";
    narratives.push(`בתרגיל ${ordinal} (${exId}) הלומד ${body}${ending}.`);
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
export function createPedagogicalReportPdfBuffer(report: Record<string, any>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: any) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: any) => reject(err));

      const fontCandidates = [
        path.join(__dirname, "../fonts/Arial.ttf"),
        path.join(__dirname, "fonts/Arial.ttf"),
        path.join(process.cwd(), "fonts/Arial.ttf"),
        "C:\\Windows\\Fonts\\arial.ttf",
      ];
      for (const f of fontCandidates) {
        if (fs.existsSync(f)) {
          doc.font(f);
          break;
        }
      }

      // Header
      doc.fontSize(22).fillColor("#1e1b4b").text(shapeRtl(report.title_he || "MathematiCore - דוח פדגוגי מסכם"), { align: "center" });
      doc.moveDown(0.4);
      doc.fontSize(11).fillColor("#475569").text(shapeRtl("הערכה פדגוגית חסויה | מדיניות אפס מידע מזהה (Zero PII)"), { align: "center" });
      doc.moveDown(1);

      // Metadata summary card
      doc.rect(40, doc.y, 515, 60).fillAndStroke("#f8fafc", "#cbd5e1");
      doc.fillColor("#0f172a").fontSize(11);
      const cardY = doc.y + 12;
      doc.text(shapeRtl(`לומד: ${report.anonymous_student_label}`), 390, cardY, { width: 150, align: "right" });
      doc.text(shapeRtl(`מפגש: ${report.session_number}`), 260, cardY, { width: 110, align: "right" });
      doc.text(shapeRtl(`ציון שליטה: ${report.score_percent}%`), 70, cardY, { width: 170, align: "right" });
      doc.text(shapeRtl(`מסלול מומלץ: ${report.matrix_recommended_path === 'green_path' ? 'מסלול העמקה (ירוק)' : 'מסלול ביסוס ומענה מותאם (צהוב)'}`), 55, cardY + 25, { width: 490, align: "right" });
      doc.y = cardY + 60;
      doc.moveDown(1);

      // Grouping Recommendation
      doc.fontSize(14).fillColor("#166534").text(shapeRtl("1. המלצת ניתוב פדגוגי"), { align: "right" });
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor("#14532d").text(shapeRtl(`קבוצת למידה: ${report.routing_label_he || report.routing_group}`), { align: "right" });
      doc.fontSize(10).fillColor("#334155").text(shapeRtl(`פירוט פדגוגי: ${report.recommendation_details_he || report.routing_label_he}`), { align: "right", lineGap: 3 });
      doc.moveDown(1);

      // Chronological Exercise Narratives
      doc.fontSize(14).fillColor("#1e293b").text(shapeRtl("2. סיפור התרגילים הכרונולוגי (Exercise Narratives)"), { align: "right" });
      doc.moveDown(0.4);
      if (report.exercise_narratives && Array.isArray(report.exercise_narratives)) {
        for (const narrative of report.exercise_narratives) {
          doc.fontSize(10).fillColor("#334155").text(wrapAndBidi(`* ${narrative}`, 75), { align: "right", lineGap: 3 });
          doc.moveDown(0.3);
        }
      }
      doc.moveDown(1);

      // AI Insights (Module 23 layer 2) / Exact Fallback
      doc.fontSize(14).fillColor("#92400e").text(shapeRtl("3. תובנות קוגניטיביות פדגוגיות"), { align: "right" });
      doc.moveDown(0.3);
      const gaps: string[] = Array.isArray(report.knowledge_gaps) ? report.knowledge_gaps : [];
      const teaching: string[] = Array.isArray(report.teaching_recommendations)
        ? report.teaching_recommendations
        : [];

      if (gaps.length > 0 || teaching.length > 0) {
        if (gaps.length > 0) {
          doc.fontSize(11).fillColor("#92400e").text(shapeRtl("פערי ידע שאותרו:"), { align: "right" });
          doc.moveDown(0.2);
          for (const gap of gaps) {
            doc.fontSize(10).fillColor("#78350f").text(wrapAndBidi(`* ${gap}`, 75), { align: "right", lineGap: 3 });
            doc.moveDown(0.2);
          }
          doc.moveDown(0.4);
        }
        if (teaching.length > 0) {
          doc.fontSize(11).fillColor("#92400e").text(shapeRtl("המלצות הוראה להמשך העבודה בכיתה:"), { align: "right" });
          doc.moveDown(0.2);
          for (const rec of teaching) {
            doc.fontSize(10).fillColor("#78350f").text(wrapAndBidi(`* ${rec}`, 75), { align: "right", lineGap: 3 });
            doc.moveDown(0.2);
          }
        }
      } else {
        // The PRD fixes this sentence verbatim for the engine-unavailable case.
        doc.fontSize(10).fillColor("#78350f").text(wrapAndBidi(report.ai_fallback_text || EXACT_AI_FALLBACK_TEXT, 75), { align: "right", lineGap: 3 });
      }
      doc.moveDown(1.5);

      // Footer
      const genTime = report.generated_at ? new Date(report.generated_at) : new Date();
      const footerText = `נוצר אוטומטית בתאריך ${genTime.toLocaleDateString("he-IL")} | מנוע MathematiCore v7.0`;
      doc.fontSize(8).fillColor("#94a3b8").text(shapeRtl(footerText), 40, 780, { align: "center", width: 515 });

      doc.end();
    } catch (renderErr) {
      reject(renderErr);
    }
  });
}

/** "session_3_student_user4" / "session_03_student_4" → 3; anything else → null. */
export function sessionNumberFromId(sessionId: string): number | null {
  const m = /^session_0?(\d)(?:_|$)/.exec(String(sessionId || ""));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 8 ? n : null;
}

const TELEMETRY_PAGE = 500;
const TELEMETRY_MAX_PAGES = 200; // 100,000 events — far beyond one learner's meeting.

/**
 * Every telemetry event of one meeting, in the order the learner produced
 * them. A meeting is a few hundred events; the old single page of 100 cut the
 * narrative and the analysis off after the first exercise or two.
 */
async function readAllTelemetryForSession(
  db: admin.firestore.Firestore,
  sessionId: string
): Promise<Record<string, any>[]> {
  const docs: Record<string, any>[] = [];
  const base = db.collection("telemetry_logs")
    .where("session_id", "==", sessionId)
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(TELEMETRY_PAGE);
  let last: admin.firestore.QueryDocumentSnapshot | null = null;
  for (let page = 0; page < TELEMETRY_MAX_PAGES; page++) {
    const pageQuery: admin.firestore.Query = last ? base.startAfter(last) : base;
    const snap: admin.firestore.QuerySnapshot = await pageQuery.get();
    if (snap.empty) break;
    for (const d of snap.docs) docs.push(d.data());
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < TELEMETRY_PAGE) break;
  }
  docs.sort((a, b) => (a.client_timestamp || 0) - (b.client_timestamp || 0));
  return docs;
}

/**
 * PRD Module 23 §ב, applied to one meeting's telemetry:
 * "נפתר נכון בניסיון ראשון" = a PROBLEM_COMPLETE for the exercise with no
 * earlier DIGIT_ENTERED whose is_correct === false in the same exercise_id;
 * is_correct === null is ignored entirely. Score = correct ÷ compulsory × 100.
 *
 * `compulsoryTotal` is the meeting's number of compulsory exercises (7 for the
 * diagnostic meeting, the bank's count otherwise). When it is unknown, the
 * exercises the learner actually opened are the denominator.
 */
export function computeFirstAttemptScore(
  telemetryDocs: Record<string, any>[],
  compulsoryTotal: number | null
): { scorePercent: number; correctFirstAttempt: number; attempted: number; denominator: number } {
  const wrongBeforeComplete = new Set<string>();
  const completedFirstTry = new Set<string>();
  const attempted = new Set<string>();
  for (const ev of telemetryDocs) {
    const exId = String(ev?.exercise_id || "");
    if (!exId) continue;
    attempted.add(exId);
    if (ev.event_type === "DIGIT_ENTERED" && ev.details?.is_correct === false) {
      wrongBeforeComplete.add(exId);
    } else if (ev.event_type === "PROBLEM_COMPLETE" && !wrongBeforeComplete.has(exId)) {
      completedFirstTry.add(exId);
    }
  }
  const denominator = compulsoryTotal && compulsoryTotal > 0 ? compulsoryTotal : Math.max(1, attempted.size);
  const correct = Math.min(completedFirstTry.size, denominator);
  return {
    scorePercent: Math.round((correct / denominator) * 100),
    correctFirstAttempt: correct,
    attempted: attempted.size,
    denominator,
  };
}

const DIAGNOSTIC_COMPULSORY_COUNT = 7;

/**
 * generatePedagogicalReportPDF (Module 23: Pedagogical Reporting Engine)
 * Computes metrics, builds deterministic Exercise Narratives, renders an authoritative
 * binary PDF, stores it in Cloud Storage, and returns signed download link + structured data.
 *
 * Owner decision (2026-09-04, register item 7): the teacher may request this
 * report for ANY meeting (1–8) of a learner from "דו"חות אבחון אישיים", not
 * only after meetings 2 and 8. The caller passes the meeting's telemetry
 * session_id, the meeting number and the learner number explicitly; the
 * score comes from the meeting's SessionDocument when one exists and is
 * otherwise computed from the meeting's own telemetry by the PRD rule.
 */
export const generatePedagogicalReportPDF = onCall(GEMINI_SECRETS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { sessionId, classId = "class_1", sessionNumber, studentId: explicitStudentId } = request.data || {};
  if (!sessionId || typeof sessionId !== "string") {
    throw new HttpsError("invalid-argument", "Missing sessionId.");
  }

  const db = admin.firestore();
  const sessionDoc = await db.collection("sessions").doc(sessionId).get();
  const studentDigits = String(explicitStudentId ?? sessionId.split("_").pop() ?? "").replace(/\D/g, "");
  if (!studentDigits) {
    throw new HttpsError("invalid-argument", "Missing studentId (1-12).");
  }
  const studentId = studentDigits;
  const clampedStudentNum = Math.min(12, Math.max(1, parseInt(studentDigits, 10)));

  const resolvedSessionNumber =
    Number(sessionNumber) ||
    Number(sessionDoc.exists ? sessionDoc.data()?.session_number : 0) ||
    sessionNumberFromId(sessionId) ||
    2;

  // Every telemetry event of this meeting, for the narrative, the score and the analysis.
  const telemetryDocs = await readAllTelemetryForSession(db, sessionId);
  const exerciseNarratives = generateExerciseNarrativeFromEvents(telemetryDocs);

  // The learner's live record: the approved path and gate state live there
  // for every meeting, whether or not a SessionDocument was written.
  const rtdb = admin.database();
  const aliasSnaps = await Promise.all(
    [`student_user${clampedStudentNum}`, `student_${clampedStudentNum}`, `${clampedStudentNum}`].map((alias) =>
      rtdb.ref(`users/students/${alias}`).get()
    )
  );
  const studentVal = aliasSnaps.find((snap) => snap.exists())?.val() || {};

  let sessionData: Record<string, any>;
  let scoreSource: "session_document" | "telemetry_first_attempt" | "q_matrix";
  if (sessionDoc.exists && sessionDoc.data()?.session_score_percent !== undefined && sessionDoc.data()?.session_score_percent !== null) {
    sessionData = sessionDoc.data() || {};
    scoreSource = "session_document";
  } else if (telemetryDocs.length > 0) {
    // No SessionDocument (meetings other than 2 never get one): the PRD score
    // rule applied to this meeting's own telemetry.
    let compulsoryTotal: number | null = resolvedSessionNumber === 2 ? DIAGNOSTIC_COMPULSORY_COUNT : null;
    if (compulsoryTotal === null) {
      try {
        const path = studentVal.teacher_selected_path === "remediation_path" || studentVal.pedagogicalPath === "remediation_path"
          ? "remediation_path" : "green_path";
        const bankIds = resolvedSessionNumber >= 3 && resolvedSessionNumber <= 8
          ? [`session_${resolvedSessionNumber}_${path}`, `session_${resolvedSessionNumber}`]
          : [`session_${resolvedSessionNumber}`];
        for (const bankId of bankIds) {
          const bankDoc = await db.collection("curriculum_catalog").doc(bankId).get();
          const tasks = bankDoc.exists ? (bankDoc.data() || {}).tasks : null;
          if (Array.isArray(tasks) && tasks.length > 0) {
            compulsoryTotal = tasks.filter((t: any) => t && t.isOptionalChoiceTask !== true).length || tasks.length;
            break;
          }
        }
      } catch (err) {
        logger.warn("[Module23] Curriculum catalog unavailable for compulsory count.", { session_id: sessionId, error: String(err) });
      }
    }
    const first = computeFirstAttemptScore(telemetryDocs, compulsoryTotal);
    sessionData = {
      session_number: resolvedSessionNumber,
      is_completed: telemetryDocs.some((d) => d.event_type === "SESSION_END" || d.event_type === "PROBLEM_COMPLETE"),
      session_score_percent: first.scorePercent,
      matrix_recommended_path: first.scorePercent >= 50 ? "green_path" : "remediation_path",
      teacher_selected_path: studentVal.teacher_selected_path || null,
      teacher_gate_approved: Boolean(studentVal.teacher_gate_approved),
      first_attempt: first,
    };
    scoreSource = "telemetry_first_attempt";
  } else if (resolvedSessionNumber === 2 && studentVal.qMatrixResults) {
    // Diagnostic meeting with no telemetry reachable: the per-task Q-matrix
    // results synced to RTDB carry the same first-attempt verdicts.
    const qResults = studentVal.qMatrixResults || {};
    const compulsoryKeys = [
      "task1_read_write_zero", "task2_digit_value", "task3_subtraction_regrouping",
      "task4_decompose_number", "task5_units_to_tens", "task6_vertical_addition",
      "task7_subtraction_zero_tens",
    ];
    const correctCount = compulsoryKeys.filter((k) => qResults[k] === "success").length;
    const computedScore = Math.round((correctCount / compulsoryKeys.length) * 100);
    sessionData = {
      session_number: 2,
      is_completed: true,
      session_score_percent: computedScore,
      matrix_recommended_path: computedScore >= 50 ? "green_path" : "remediation_path",
      teacher_selected_path: studentVal.teacher_selected_path || null,
      teacher_gate_approved: Boolean(studentVal.teacher_gate_approved),
    };
    scoreSource = "q_matrix";
  } else {
    throw new HttpsError("not-found", `אין פעולות מתועדות למפגש ${resolvedSessionNumber} של תלמיד ${clampedStudentNum}; אין מה לנתח.`);
  }

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
  } else if (score <= 75) {
    routingGroup = 'Heterogeneous peer discourse, abacus';
    routingLabelHe = 'שיח עמיתים הטרוגני, חשבונייה';
    recommendationDetailsHe = 'המלצה ללמידה שיתופית ושיח עמיתים הטרוגני בשילוב חשבונייה לחיזוק הגמישות בהמרות וחקר משותף.';
  }

  // ---- Module 23 layer 2: the AI-authored verbal analysis. ----
  // Layer 1 (routingGroup / routingLabelHe / recommendationDetailsHe above) is
  // already decided and is never revisited here; the tier is passed to the
  // engine only as a constraint it may not contradict. A null result — engine
  // unavailable, timed out, or malformed — leaves ai_analysis absent and the
  // renderer falls back to the exact sentence the PRD fixes. Report generation
  // never fails because of the engine.
  const recommendationTier = resolveRecommendationTier(score);

  // Exercises the learner actually erred on, and the columns those errors fell
  // in, taken from the telemetry rather than assumed from the score.
  const failedExerciseIds: string[] = [];
  const regroupingColumnsByExercise: Record<string, number[]> = {};
  for (const doc of telemetryDocs) {
    const exId = String((doc as any).exercise_id || "");
    if (!exId) continue;
    const isWrongDigit =
      (doc as any).event_type === "DIGIT_ENTERED" &&
      (doc as any).details?.is_correct === false;
    if (isWrongDigit && !failedExerciseIds.includes(exId)) failedExerciseIds.push(exId);
    if (
      (doc as any).event_type === "REGROUPING_SUCCESS" ||
      (doc as any).event_type === "REGROUPING_TRIGGERED"
    ) {
      const col = (doc as any).column_index;
      if (typeof col === "number") {
        const cols = regroupingColumnsByExercise[exId] || [];
        if (!cols.includes(col)) cols.push(col);
        regroupingColumnsByExercise[exId] = cols;
      }
    }
  }

  // Module 26 keeps the canonical task banks in Firestore; read the bank that
  // matches this learner's approved path so the failed exercises carry their
  // real operands and labels. Absent bank is not an error — buildFailedExercises
  // then describes only what the telemetry proves.
  const analysisPath: "green_path" | "remediation_path" | null =
    sessionData.teacher_selected_path === "green_path" ||
    sessionData.teacher_selected_path === "remediation_path"
      ? sessionData.teacher_selected_path
      : sessionData.matrix_recommended_path === "remediation_path"
      ? "remediation_path"
      : null;

  let catalogTasks: Record<string, any>[] = [];
  try {
    const bankId =
      resolvedSessionNumber >= 3 && resolvedSessionNumber <= 7 && analysisPath
        ? `session_${resolvedSessionNumber}_${analysisPath}`
        : `session_${resolvedSessionNumber}`;
    const bankDoc = await db.collection("curriculum_catalog").doc(bankId).get();
    if (bankDoc.exists) {
      const tasks = (bankDoc.data() || {}).tasks;
      if (Array.isArray(tasks)) catalogTasks = tasks;
    }
  } catch (err) {
    logger.warn("[Module23] Curriculum catalog unavailable for report analysis.", {
      session_id: sessionId,
      error: String(err),
    });
  }

  const aiAnalysis = await generateReportAnalysis({
    student_id: clampedStudentNum,
    session_id: sessionId,
    session_number: resolvedSessionNumber,
    session_score_percent: score,
    recommendation_tier: recommendationTier,
    failed_exercises: buildFailedExercises(
      failedExerciseIds,
      regroupingColumnsByExercise,
      catalogTasks,
      resolvedSessionNumber,
      analysisPath
    ),
    telemetry_summary: buildTelemetrySummary(telemetryDocs),
  });

  // Assemble pedagogical report data payload
  const report = {
    report_id: `rep_${sessionId}`,
    session_id: sessionId,
    generated_at: Date.now(),
    title_he: `MathematiCore - דוח פדגוגי למפגש ${resolvedSessionNumber}`,
    anonymous_student_label: `תלמיד ${clampedStudentNum}`,
    student_id: clampedStudentNum,
    session_number: resolvedSessionNumber,
    is_completed: Boolean(sessionData.is_completed),
    score_percent: score,
    score_source: scoreSource,
    first_attempt: sessionData.first_attempt || null,
    telemetry_event_count: telemetryDocs.length,
    matrix_recommended_path: sessionData.matrix_recommended_path || (score >= 50 ? "green_path" : "remediation_path"),
    teacher_selected_path: sessionData.teacher_selected_path || null,
    teacher_gate_approved: Boolean(sessionData.teacher_gate_approved),
    routing_group: routingGroup,
    routing_label_he: routingLabelHe,
    recommendation_details_he: recommendationDetailsHe,
    support_profile_id: studentData?.support_profile_id || "default",
    support_profile_version: studentData?.support_profile_version || 1,
    exercise_narratives: exerciseNarratives,
    recommendation_tier: recommendationTier,
    knowledge_gaps: aiAnalysis?.knowledge_gaps || [],
    teaching_recommendations: aiAnalysis?.teaching_recommendations || [],
    ai_analysis_available: Boolean(aiAnalysis),
    ai_fallback_text: EXACT_AI_FALLBACK_TEXT,
    summary_text_he: `דוח פדגוגי למפגש ${resolvedSessionNumber}. ציון שליטה: ${score}%. מסלול מומלץ: ${score >= 50 ? 'העמקה (ירוק)' : 'ביסוס ומענה מותאם (צהוב - remediation_path)'}.`
  };

  // Render authoritative server-side PDF binary & Upload to Cloud Storage
  let pdfUrl = "";
  const storageFilePath = `reports/${classId}/session_${resolvedSessionNumber}/student_${clampedStudentNum}_${Date.now()}.pdf`;
  let storageSuccess = false;
  let storageErrorMessage = "";
  let driveMirrorUrl: string | null = null;

  try {
    const pdfBuffer = await createPedagogicalReportPdfBuffer(report);
    const bucket = admin.storage().bucket();
    const file = bucket.file(storageFilePath);

    const downloadToken = require("crypto").randomUUID();
    await file.save(pdfBuffer, {
      contentType: "application/pdf",
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
          student_id: String(clampedStudentNum),
          session_id: sessionId,
          class_id: classId,
          session_number: String(resolvedSessionNumber),
          read_only: "true",
        },
      },
    });

    pdfUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storageFilePath)}?alt=media&token=${downloadToken}`;

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
      score_source: scoreSource,
      routing_group: routingGroup,
      routing_label_he: routingLabelHe,
      recommendation_details_he: recommendationDetailsHe,
      exercise_narratives: exerciseNarratives,
      knowledge_gaps: report.knowledge_gaps,
      teaching_recommendations: report.teaching_recommendations,
      ai_analysis_available: report.ai_analysis_available,
      telemetry_event_count: telemetryDocs.length,
      generated_at: report.generated_at,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      is_read_only: true,
    });

    storageSuccess = true;
    logger.info(`Authoritative pedagogical PDF generated and stored at ${storageFilePath}`);

    // Module 23 Drive mirror: archive a copy of the same PDF in the shared Drive folder.
    // Best-effort only — a Drive failure must never fail or degrade report generation.
    try {
      const driveFileName = `דוח_תלמיד${clampedStudentNum}_מפגש${resolvedSessionNumber}_${new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-")}.pdf`;
      const driveFolderId = await resolveDriveFolder([DRIVE_FOLDERS.learnerReports, `מפגש ${resolvedSessionNumber}`]);
      const driveResult = await uploadBufferToDrive(pdfBuffer, driveFileName, "application/pdf", driveFolderId);
      if (driveResult.success) {
        driveMirrorUrl = driveResult.webViewLink;
        await db.collection("reports").doc(`rep_${sessionId}`).set({
          drive_file_id: driveResult.fileId,
          drive_file_url: driveResult.webViewLink,
        }, { merge: true });
        logger.info(`Pedagogical PDF mirrored to shared Drive folder: ${driveResult.fileId}`);
      } else {
        logger.warn(`Drive mirror skipped (non-fatal): ${driveResult.error}`);
      }
    } catch (driveErr: any) {
      logger.warn(`Drive mirror failed (non-fatal): ${driveErr?.message || driveErr}`);
    }
  } catch (storageErr: any) {
    storageErrorMessage = storageErr?.message || "Storage write error";
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
export const getPedagogicalReportDownloadUrl = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { sessionId } = request.data || {};
  if (!sessionId) {
    throw new HttpsError("invalid-argument", "Missing sessionId.");
  }

  const db = admin.firestore();
  const reportDoc = await db.collection("reports").doc(`rep_${sessionId}`).get();

  if (!reportDoc.exists) {
    throw new HttpsError("not-found", `Report rep_${sessionId} not found.`);
  }

  const data = reportDoc.data() || {};
  const storagePath = data.storage_path;
  if (!storagePath) {
    throw new HttpsError("not-found", "Storage path not found on report document.");
  }

  // Teacher authorization check against class_id
  const callerRoles = request.auth.token.roles || (request.auth.token.role ? [request.auth.token.role] : []);
  const isTeacher = callerRoles.includes("TEACHER") || request.auth.token.role === "teacher" || request.auth.token.teacher === true;
  const isAdmin = callerRoles.includes("ADMIN") || request.auth.token.role === "admin" || request.auth.token.admin === true;
  const callerClassId = request.auth.token.class_id;

  if (!isTeacher && !isAdmin) {
    throw new HttpsError("permission-denied", "Unauthorized access.");
  }

  if (isTeacher && !isAdmin && callerClassId && callerClassId !== data.class_id) {
    throw new HttpsError("permission-denied", "Access denied: teacher not assigned to this class.");
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


