/**
 * Owner decision, 11.10.2026: once a week (Sunday 08:00, Israel time) the
 * server summarises the coaching cards the validator rejected in the past
 * seven days and writes a Hebrew PDF report to the Drive folder "4 מנהל",
 * beside the admin report (driveNames.ts, PRD Module 23 "תיקיות הדרייב").
 *
 * The records come from ai_rejections (aiMonitoring.ts, written by the proxy
 * at every rejection, the first try included). The report holds counts by
 * kind of rejection, by validator wording and by meeting, and up to five
 * examples: exercise id, meeting, reason, and the rejected card shortened.
 * No learner identity anywhere: the rows are read field by field from a fixed
 * list, so a learner id or a session id on a stored row can never reach the
 * report. The card text is the model's output, never learner text, and is
 * scrubbed again here.
 *
 * A week with no rejection still gets a short report saying so, so the owner
 * can tell the job ran.
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import { AI_REJECTIONS_COLLECTION } from "./aiMonitoring";
import { scrubPII } from "./geminiProxy";
import { DRIVE_FOLDERS, aiRejectionsReportFileName, israelDate } from "./driveNames";
import { meetingShortLabelHe } from "./stationNames";
import { esc, layout } from "./reportHtml";
import { exerciseLabelHe } from "./meetingMetrics";
import { CHROMIUM_PDF_RUNTIME, renderHtmlToPdf, renderWithFallback } from "./htmlPdf";
import { rtlText } from "./hebrewPdf";

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_EXAMPLES = 5;
const MAX_VALIDATOR_REASONS = 10;
const EXCERPT_MAX = 200;
const READ_LIMIT = 5000;

/** The schedule: Sunday 08:00, Israel time. */
export const AI_REJECTIONS_REPORT_OPTIONS = {
  schedule: "0 8 * * 0",
  timeZone: "Asia/Jerusalem",
  region: "us-central1",
  ...CHROMIUM_PDF_RUNTIME,
};

/** One stored rejection, as the report reads it. Unknown fields are ignored. */
export interface AiRejectionRow {
  exercise_id?: unknown;
  meeting?: unknown;
  reason?: unknown;
  outcome?: unknown;
  demo?: unknown;
  card_text?: unknown;
  created_at_ms?: unknown;
  [other: string]: unknown;
}

export const REJECTION_KIND_LABEL_HE: Readonly<Record<string, string>> = {
  answer_leak: "חשיפת התשובה או ספרה מוסתרת",
  forbidden_term: "מונח אסור",
  language_reject: "ניסוח, סגנון או התאמה למסך",
  frame_reject: "חריגה ממסגרת הכרטיס",
  not_json: "הפלט אינו בפורמט הנדרש",
  schema_reject: "מבנה כרטיס שגוי",
  client_reject: "נדחה בבדיקה במחשב של הלומד",
  static_reject: "כרטיס קבוע שנדחה בבדיקה במחשב של הלומד",
};

/**
 * The validator's reason in Hebrew (owner decision, 11.10.2026, item 13-10:
 * no English in the report). The stored reason is the validator's own English
 * sentence (socraticContract.validateSocraticResponse) or the client's rule
 * (SocraticEngine); each is matched by its opening words, the most specific
 * first. An unknown reason reads "סיבה אחרת".
 */
const REASON_LABELS_HE: ReadonlyArray<[RegExp, string]> = [
  [/^response is not (JSON|an object)/i, "הפלט אינו בפורמט הנדרש"],
  [/^error_category/i, "חסר סוג הטעות"],
  [/^guiding_question/i, "השאלה המנחה חסרה, ארוכה מדי או לא בעברית"],
  [/^options must be exactly 3/i, "בכרטיס אין שלוש אפשרויות"],
  [/^option_text/i, "נוסח של אפשרות חסר, ארוך מדי או לא בעברית"],
  [/^feedback_text/i, "משוב ארוך מדי או לא בעברית"],
  [/^exactly one option must be correct/i, "בכרטיס אין בדיוק תשובה נכונה אחת"],
  [/^forbidden terminology/i, "מונח אסור"],
  [/^final answer leaked as block counts/i, "התוצאה נחשפה כמספר לבנים"],
  [/^final answer leaked: the card states the result digit/i, "נחשפה ספרה של התוצאה"],
  [/^(final answer leaked|hidden number leaked)/i, "התוצאה או מספר שהלומד מחפש נחשפו"],
  [/^hidden digits leaked/i, "ספרה מוסתרת נחשפה"],
  [/^secret number leaked as block counts/i, "המספר שהלומד מחפש נחשף כמספר לבנים"],
  [/^secret number leaked: s1_target_347/i, "נחשף מה שהלומד צריך לגלות בתרגיל 347"],
  [/^secret number leaked/i, "המספר שהלומד מחפש נחשף"],
  [/^names an aid that is not on the screen/i, "הכרטיס מזכיר עזר שאינו על המסך"],
  [/^start_given/i, "הכרטיס אומר שהלומד בנה את הלבנים שהתרגיל נתן"],
  [/^frame: this is a level-1 card/i, "כרטיס כללי שמזכיר את הטור שבו הקושי"],
  [/^frame: the 10 or more blocks are the break/i, "הכרטיס מבקש לקבץ לבנים שהפריטה דורשת"],
  [/^(frame: )?marks the instruction'?s representation wrong/i, "הכרטיס פוסל את הלבנים שההוראה מבקשת"],
  [/^frame/i, "חריגה ממסגרת הכרטיס"],
  [/^counts: meeting 1/i, "מפגש 1: השאלה מזכירה את הטור שבו הקושי"],
  [/^counts: the card states how many blocks|^states a column'?s block count/i, "הכרטיס אומר כמה לבנים יש בטור"],
  [/^screen: meeting 1/i, "מפגש 1: הכרטיס מזכיר טור או כפתור שאין על המסך"],
  [/^screen: this task has no memory circles/i, "הכרטיס מזכיר עיגול זיכרון בתרגיל שאין בו"],
  [/^form: the guiding question must be a direct question/i, "השאלה המנחה אינה שאלה ישירה"],
  [/^form: the only opening/i, "פתיחה שאינה «נסו לחשוב:»"],
  [/^form: the correct option's feedback must open/i, "משוב התשובה הנכונה אינו נפתח ב«נכון מאוד!»"],
  [/^form: the correct option's feedback must not contain a hint/i, "רמז בתוך משוב התשובה הנכונה"],
  [/^form: a wrong option's feedback must open/i, "רמז שאינו נפתח ב«רמז:»"],
  [/^form: a wrong option's feedback must be ONE question/, "רמז עם יותר משאלה אחת"],
  [/^form: a wrong option's feedback must be one guiding question/i, "רמז שאינו שאלה"],
  [/^wrong-option hint is not a guiding question/i, "רמז שאינו שאלה מנחה"],
  [/^language: (first_person|first_person_plural)/i, "לשון: גוף ראשון רבים"],
  [/^language: second_person_singular/i, "לשון: פנייה ביחיד"],
  [/^language: (break_into_column|parsing_verb|subtraction_verb|not_a_form_kabetz)/i, "לשון: פועל של פריטה, הקבצה או חיסור"],
  [/^language: (name_not_on_screen|result_box_name|action_not_on_screen_mark)/i, "לשון: שם או פעולה שאינם על המסך"],
  [/^language/i, "לשון: כלל כתיבה"],
  [/^style: (length_question|length_option|length_hint|length_feedback)/i, "סגנון: ארוך מדי"],
  [/^style: instruction_quoted/i, "סגנון: העתקה של ההוראה"],
  [/^style: title_repeated/i, "סגנון: כותרת המשימה בכרטיס"],
  [/^style: comma_after_fronted_clause/i, "סגנון: חסר פסיק"],
  [/^style: misleading_phrase/i, "סגנון: ניסוח מטעה"],
  [/^style/i, "סגנון: כלל כתיבה"],
  [/^fields|^options$|^json$|^empty$/i, "מבנה כרטיס שגוי"],
];
export const OTHER_REASON_HE = "סיבה אחרת";
export function validatorReasonLabelHe(reason: string): string {
  const r = reason.trim();
  for (const [re, label] of REASON_LABELS_HE) if (re.test(r)) return label;
  return OTHER_REASON_HE;
}
const OTHER_KIND_LABEL_HE = "אחר";
const OTHER_KIND_CODE = "other";
const UNKNOWN_MEETING_HE = "מפגש לא ידוע";

export const AI_REJECTIONS_TITLE_HE = "כרטיסי חניכה שנדחו בבדיקה – דוח שבועי";
export const AI_REJECTIONS_HEADINGS_HE = {
  byKind: "לפי סוג הדחייה",
  byValidator: "לפי סיבת הדחייה",
  byMeeting: "לפי מפגש",
  examples: "דוגמאות (עד 5)",
} as const;
export const AI_REJECTIONS_NOTE_HE =
  "נספרת כאן כל תשובה של מנוע הבינה המלאכותית שבודק השרת דחה, גם ניסיון ראשון שתוקן בניסיון השני. " +
  "נספר גם כל כרטיס שנדחה בבדיקה במחשב של הלומד, בין שכתב אותו המנוע ובין שהוא כרטיס קבוע. " +
  "במקום כרטיס שנדחה הלומד קיבל כרטיס מתוקן, את הכרטיס הקבוע או כרטיס כללי של התרגיל. " +
  "אין בדוח פרט מזהה של לומד, ואין בו טקסט שהלומדים כתבו.";
export const AI_REJECTIONS_EMPTY_HE = "השבוע לא נדחה אף כרטיס חניכה.";

export interface AiRejectionsReport {
  title_he: string;
  period_he: string;
  from_ms: number;
  to_ms: number;
  total: number;
  demo_count: number;
  by_kind: Array<{ code: string; label_he: string; count: number }>;
  by_validator_reason: Array<{ reason: string; count: number }>;
  by_meeting: Array<{ meeting: number | null; label_he: string; count: number }>;
  examples: Array<{ exercise_id: string; exercise_label_he: string; meeting_label_he: string; kind_label_he: string; code: string; reason: string; card_excerpt: string }>;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function meetingOf(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 8 ? v : null;
}

function kindLabel(code: string): string {
  return REJECTION_KIND_LABEL_HE[code] ?? OTHER_KIND_LABEL_HE;
}

function shorten(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** The rejected card's question and options, shortened; the raw text when it is not a card. */
export function cardExcerpt(cardText: unknown): string {
  const raw = typeof cardText === "string" ? cardText : "";
  let text = raw;
  try {
    const parsed = JSON.parse(raw);
    const body = parsed && typeof parsed === "object" && parsed.final_intervention && typeof parsed.final_intervention === "object" ? parsed.final_intervention : parsed;
    if (body && typeof body === "object") {
      const parts: string[] = [];
      if (typeof body.guiding_question === "string") parts.push(body.guiding_question);
      if (Array.isArray(body.options)) {
        for (const o of body.options) {
          const t = typeof o === "string" ? o : o && typeof o.option_text === "string" ? o.option_text : "";
          if (t) parts.push(t);
        }
      }
      if (parts.length > 0) text = parts.join(" | ");
    }
  } catch {
    /* not JSON: the raw text, shortened */
  }
  return shorten(scrubPII(text), EXCERPT_MAX);
}

function countBy<K>(items: K[], key: (k: K) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return m;
}

/**
 * The report, from the stored rows and the period. Pure: no Firebase, no clock.
 * Only the listed fields are read from a row.
 */
export function buildAiRejectionsReport(
  rows: AiRejectionRow[],
  period: { from_ms: number; to_ms: number },
  /** The catalog's Hebrew titles by exercise id: the examples name an exercise as the teacher's screens do, never by its id. */
  titles: Record<string, string> | null = null
): AiRejectionsReport {
  const clean = rows.map((r) => ({
    exercise_id: str(r.exercise_id, 64),
    meeting: meetingOf(r.meeting),
    reason: scrubPII(str(r.reason, 300)),
    code: str(r.outcome, 40) || "other",
    demo: r.demo === true,
    card_text: typeof r.card_text === "string" ? r.card_text : "",
    at: typeof r.created_at_ms === "number" ? r.created_at_ms : 0,
  }));

  // By the Hebrew label: two unknown codes both read "אחר" and are one row, not two rows of the same name.
  const byKind = [...countBy(clean, (r) => (REJECTION_KIND_LABEL_HE[r.code] ? r.code : OTHER_KIND_CODE))]
    .map(([code, count]) => ({ code, label_he: kindLabel(code), count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  const byValidator = [...countBy(clean, (r) => validatorReasonLabelHe(r.reason))]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, MAX_VALIDATOR_REASONS);

  const byMeeting = [...countBy(clean, (r) => String(r.meeting ?? ""))]
    .map(([k, count]) => {
      const meeting = k === "" ? null : Number(k);
      return { meeting, label_he: meeting === null ? UNKNOWN_MEETING_HE : meetingShortLabelHe(meeting), count };
    })
    .sort((a, b) => (a.meeting ?? 99) - (b.meeting ?? 99));

  // Up to five examples, newest first, one of each kind before a second of any.
  const newest = [...clean].sort((a, b) => b.at - a.at);
  const picked: typeof clean = [];
  const seenKinds = new Set<string>();
  for (const r of newest) {
    if (picked.length >= MAX_EXAMPLES) break;
    if (!seenKinds.has(r.code)) {
      seenKinds.add(r.code);
      picked.push(r);
    }
  }
  for (const r of newest) {
    if (picked.length >= MAX_EXAMPLES) break;
    if (!picked.includes(r)) picked.push(r);
  }

  return {
    title_he: AI_REJECTIONS_TITLE_HE,
    period_he: `התקופה: ${israelDate(period.from_ms)}–${israelDate(period.to_ms)} (שבעה ימים, שעון ישראל)`,
    from_ms: period.from_ms,
    to_ms: period.to_ms,
    total: clean.length,
    demo_count: clean.filter((r) => r.demo).length,
    by_kind: byKind,
    by_validator_reason: byValidator,
    by_meeting: byMeeting,
    examples: picked.map((r) => ({
      exercise_id: r.exercise_id || "—",
      exercise_label_he: r.exercise_id ? exerciseLabelHe(titles, r.exercise_id) : "—",
      meeting_label_he: r.meeting === null ? UNKNOWN_MEETING_HE : meetingShortLabelHe(r.meeting),
      kind_label_he: kindLabel(r.code),
      code: r.code,
      reason: validatorReasonLabelHe(r.reason),
      card_excerpt: cardExcerpt(r.card_text) || "—",
    })),
  };
}

/** The report as plain lines (the pdfkit fallback, and the log). */
export function aiRejectionsReportLines(report: AiRejectionsReport): string[] {
  const lines = [report.title_he, report.period_he, AI_REJECTIONS_NOTE_HE, ""];
  if (report.total === 0) return [...lines, AI_REJECTIONS_EMPTY_HE];
  lines.push(`סך הכול דחיות: ${report.total}`);
  if (report.demo_count > 0) lines.push(`מתוכן בכרטיס ההדגמה של המורה: ${report.demo_count}`);
  lines.push("", AI_REJECTIONS_HEADINGS_HE.byKind);
  for (const k of report.by_kind) lines.push(`• ${k.label_he}: ${k.count}`);
  lines.push("", AI_REJECTIONS_HEADINGS_HE.byValidator);
  for (const v of report.by_validator_reason) lines.push(`• ${v.reason}: ${v.count}`);
  lines.push("", AI_REJECTIONS_HEADINGS_HE.byMeeting);
  for (const m of report.by_meeting) lines.push(`• ${m.label_he}: ${m.count}`);
  lines.push("", AI_REJECTIONS_HEADINGS_HE.examples);
  report.examples.forEach((e, i) => {
    lines.push(`${i + 1}. ${e.exercise_label_he} · ${e.meeting_label_he} · ${e.kind_label_he}`);
    lines.push(`   סיבת הדחייה: ${e.reason}`);
    lines.push(`   הכרטיס שנדחה: ${e.card_excerpt}`);
  });
  return lines;
}

/** The report as a complete HTML document (printed by Chromium). */
export function aiRejectionsReportHtml(report: AiRejectionsReport): string {
  const parts: string[] = [
    `<h1>${esc(report.title_he)}</h1>`,
    `<p class="subtitle">${esc(report.period_he)}</p>`,
    `<p class="muted">${esc(AI_REJECTIONS_NOTE_HE)}</p>`,
  ];
  if (report.total === 0) {
    parts.push(`<p><b>${esc(AI_REJECTIONS_EMPTY_HE)}</b></p>`);
    return layout(report.title_he, parts.join("\n"));
  }
  parts.push(
    `<p><b>סך הכול דחיות: ${report.total}</b>${report.demo_count > 0 ? ` · מתוכן בכרטיס ההדגמה של המורה: ${report.demo_count}` : ""}</p>`,
    `<h2>${esc(AI_REJECTIONS_HEADINGS_HE.byKind)}</h2>`,
    `<table><thead><tr><th>סוג הדחייה</th><th>מספר</th></tr></thead><tbody>`,
    ...report.by_kind.map((k) => `<tr><td class="label">${esc(k.label_he)}</td><td>${k.count}</td></tr>`),
    `</tbody></table>`,
    `<h2>${esc(AI_REJECTIONS_HEADINGS_HE.byValidator)}</h2>`,
    `<table><thead><tr><th>סיבת הדחייה</th><th>מספר</th></tr></thead><tbody>`,
    ...report.by_validator_reason.map((v) => `<tr><td class="label">${esc(v.reason)}</td><td>${v.count}</td></tr>`),
    `</tbody></table>`,
    `<h2>${esc(AI_REJECTIONS_HEADINGS_HE.byMeeting)}</h2>`,
    `<table><thead><tr><th>מפגש</th><th>מספר</th></tr></thead><tbody>`,
    ...report.by_meeting.map((m) => `<tr><td class="label">${esc(m.label_he)}</td><td>${m.count}</td></tr>`),
    `</tbody></table>`,
    `<h2>${esc(AI_REJECTIONS_HEADINGS_HE.examples)}</h2>`,
    `<table><thead><tr><th>תרגיל</th><th>מפגש</th><th>סוג הדחייה</th><th>סיבת הדחייה</th><th>הכרטיס שנדחה (מקוצר)</th></tr></thead><tbody>`,
    ...report.examples.map((e) =>
      `<tr><td>${esc(e.exercise_label_he)}</td><td>${esc(e.meeting_label_he)}</td><td>${esc(e.kind_label_he)}</td><td>${esc(e.reason)}</td><td style="text-align:start">${esc(e.card_excerpt)}</td></tr>`
    ),
    `</tbody></table>`,
  );
  return layout(report.title_he, parts.join("\n"));
}

function aiRejectionsPdfWithPdfkit(report: AiRejectionsReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const PDFDocument = require("pdfkit");
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: any) => reject(err));
      for (const f of [path.join(__dirname, "../fonts/Arial.ttf"), path.join(__dirname, "fonts/Arial.ttf"), path.join(process.cwd(), "fonts/Arial.ttf")]) {
        if (fs.existsSync(f)) {
          doc.font(f);
          break;
        }
      }
      doc.fontSize(11).fillColor("#0f172a");
      for (const line of aiRejectionsReportLines(report)) {
        if (line === "") doc.moveDown(0.5);
        else rtlText(doc, line);
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export function createAiRejectionsPdf(report: AiRejectionsReport): Promise<Buffer> {
  return renderWithFallback(
    "aiRejectionsReport",
    () => renderHtmlToPdf(aiRejectionsReportHtml(report)),
    () => aiRejectionsPdfWithPdfkit(report)
  );
}

export const weeklyAiRejectionsReport = onSchedule(AI_REJECTIONS_REPORT_OPTIONS, async () => {
  const toMs = Date.now();
  const fromMs = toMs - WEEK_MS;
  const db = admin.firestore();
  const snap = await db
    .collection(AI_REJECTIONS_COLLECTION)
    .where("created_at", ">=", admin.firestore.Timestamp.fromMillis(fromMs))
    .where("created_at", "<", admin.firestore.Timestamp.fromMillis(toMs))
    .limit(READ_LIMIT)
    .get();
  const rows: AiRejectionRow[] = snap.docs.map((d) => {
    const data = d.data();
    const at = data.created_at;
    return { ...data, created_at_ms: at && typeof at.toMillis === "function" ? at.toMillis() : undefined };
  });
  if (rows.length >= READ_LIMIT) logger.warn(`weeklyAiRejectionsReport: read capped at ${READ_LIMIT} rows`);

  // The exercises by their catalog titles (best effort: without them each reads "תרגיל במפגש N").
  const titles: Record<string, string> = {};
  try {
    const catalog = await db.collection("curriculum_catalog").get();
    for (const doc of catalog.docs) {
      const tasks = (doc.data() || {}).tasks;
      if (!Array.isArray(tasks)) continue;
      for (const t of tasks) if (t && typeof t.id === "string" && typeof t.titleHe === "string" && t.titleHe.trim()) titles[t.id] = t.titleHe;
    }
  } catch (err) {
    logger.warn(`weeklyAiRejectionsReport: catalog titles unavailable (${String(err)})`);
  }
  const report = buildAiRejectionsReport(rows, { from_ms: fromMs, to_ms: toMs }, titles);
  const pdf = await createAiRejectionsPdf(report);
  // Loaded here: exportDriveReport pulls in the whole reset module.
  const { uploadBufferToDrive } = await import("./exportDriveReport");
  const fileName = aiRejectionsReportFileName(fromMs, toMs);
  const upload = await uploadBufferToDrive(pdf, fileName, "application/pdf", DRIVE_FOLDERS.admin);
  if (upload.success) {
    logger.info(`weeklyAiRejectionsReport: ${report.total} rejections, written to "${DRIVE_FOLDERS.admin}/${fileName}".`);
  } else {
    logger.error(`weeklyAiRejectionsReport: the Drive upload failed (${upload.error}); parked at ${upload.fallbackStoragePath ?? "nowhere"}.`);
  }
});
