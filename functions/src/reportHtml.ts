/**
 * HTML templates for the Module 23 PDF reports, printed by Chromium (htmlPdf.ts).
 *
 * Both templates carry exactly the content of the pdfkit renderers they
 * replace (same sections, same labels, same fallback sentence), laid out as a
 * real right-to-left document: embedded Heebo, real tables instead of
 * pipe-separated lines, and the Unicode bidi algorithm handling numbers,
 * percentages and Latin exercise ids inside Hebrew.
 *
 * Every dynamic value passes through esc(); the reports carry only anonymous
 * learner numbers, and escaping keeps a stray "<" in an AI
 * sentence from becoming markup.
 */
import * as fs from "fs";
import { fontPath } from "./htmlPdf";
import { COLUMN_NAMES_HE, ROUTE_NAME_HE, errorCategoryCountsHe, triggerCountsHe } from "./teacherLabels";
import type { ClassAggregates, ClassLearnerRow, ExerciseOutcome } from "./classReport";
import {
  CHOICE_PATH_LABEL_HE,
  exerciseLabelHe,
  exercisePathType,
  FADING_GUESS_SECONDS,
  flexibilityHe,
  mediationHe,
  persistenceHe,
  RESEARCH_MEASURES_HE,
  SANDBOX_MEETING_PURPOSE_HE,
  selfCorrectionHe,
  type PersistenceIndex,
  TOOL_LABEL_HE,
  TOOLS,
  type ToolMastery,
} from "./meetingMetrics";
import type { RecommendationTier } from "./reportAnalysis";
import { classPreResetNotes, PRE_RESET_HEADING_HE, PRE_RESET_NOTE_HE } from "./preResetRecord";
import { CATCHUP_REASON_HE, CATCHUP_REASON_KEYS, catchUpReasonHe, type CatchUpReasonKey, type ClassCatchUpSummary } from "./catchUp";

export const EXACT_AI_FALLBACK_TEXT_HE =
  "הניתוח הפדגוגי המפורט אינו זמין כעת. ההמלצות שלהלן מבוססות על מדדי הביצוע.";

/**
 * מסמך 03: the choice exercises appear in the teacher's reports "מסומנים
 * כתרגילי בחירה, בנפרד משבעת תרגילי החובה", and the conceptual-independence
 * score counts the compulsory exercises only.
 */
export const CHOICE_EXERCISES_HEADING_HE =
  "תרגילי בחירה (אחרי תרגילי החובה) — בנפרד מתרגילי החובה, ואינם נכללים בציון השליטה";

export const TIER_LABEL_HE: Record<RecommendationTier, string> = {
  below_50: "קבוצה הומוגנית קטנה, תבניות עשר פיזיות ומקלות מנייה (ציון מתחת ל-50%)",
  between_50_75: "קבוצה הטרוגנית, שיח עמיתים וחשבונייה (ציון 50%–75%)",
  above_75: "עבודה עצמאית, לוח מחיק וכרטיסיות מספרים (ציון מעל 75%)",
};

export const OUTCOME_HE: Record<ExerciseOutcome, string> = {
  first_try: "ניסיון ראשון",
  after_correction: "אחרי תיקון",
  incomplete: "לא הושלם",
};

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let fontCss: string | null = null;
/** Heebo (variable weight) embedded as a data URI, so printing never depends on the network. */
function embeddedFontCss(): string {
  if (fontCss !== null) return fontCss;
  const candidates = [fontPath("Heebo.ttf"), fontPath("Arial.ttf")];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      const b64 = fs.readFileSync(file).toString("base64");
      fontCss = `@font-face { font-family: "ReportFont"; src: url(data:font/ttf;base64,${b64}) format("truetype"); font-weight: 100 900; font-display: block; }`;
      return fontCss;
    }
  }
  fontCss = "";
  return fontCss;
}

const BASE_CSS = `
  * { box-sizing: border-box; }
  html { direction: rtl; }
  body {
    margin: 0; color: #0f172a; background: #ffffff;
    font-family: "ReportFont", "Heebo", "Assistant", "Arial", sans-serif;
    font-size: 10.5pt; line-height: 1.55;
  }
  h1 { margin: 0; font-size: 20pt; font-weight: 800; color: #1e1b4b; text-align: center; }
  .subtitle { margin: 4px 0 14px; font-size: 10pt; color: #475569; text-align: center; }
  .card {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 14px;
    padding: 10px 14px; margin: 0 0 14px;
    background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 10.5pt;
  }
  .card .wide { grid-column: 1 / -1; }
  .card b { color: #334155; font-weight: 600; }
  h2 { margin: 16px 0 6px; font-size: 13pt; font-weight: 700; color: #1e293b; break-after: avoid; }
  h2.green { color: #166534; }
  h2.amber { color: #92400e; }
  h2.pre-reset { color: #7c2d12; }
  h3 { margin: 8px 0 4px; font-size: 11pt; font-weight: 700; color: #92400e; break-after: avoid; }
  p { margin: 0 0 6px; }
  ul { margin: 0 0 6px; padding-inline-start: 18px; }
  li { margin: 0 0 4px; break-inside: avoid; }
  .green-text { color: #14532d; }
  .amber-text { color: #78350f; }
  .muted { color: #64748b; font-size: 9.5pt; }
  .card .catch-up { color: #0c4a6e; font-weight: 600; }
  .routing { padding: 8px 12px; border-inline-start: 4px solid #16a34a; background: #f0fdf4; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; font-size: 8.5pt; break-inside: auto; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th, td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: center; vertical-align: middle; }
  th { background: #f1f5f9; color: #334155; font-weight: 600; }
  td.label { text-align: start; white-space: nowrap; font-weight: 600; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  table.dense { font-size: 8pt; }
  table.dense th, table.dense td { padding: 2px 3px; }
  table.dense th { font-size: 7.5pt; }
  table.dense td { white-space: nowrap; }
  .outcome-first_try { color: #166534; }
  .outcome-after_correction { color: #92400e; }
  .outcome-incomplete { color: #991b1b; }
  .outcome-not_attempted { color: #94a3b8; }
`;

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>${embeddedFontCss()}${BASE_CSS}</style>
</head>
<body>${body}</body>
</html>`;
}

/** Chromium footer: generation date, engine, and page X of Y. Inline styles only (Chromium ignores page CSS here). */
export function reportFooterTemplate(generatedAt: number | string | undefined): string {
  const genTime = generatedAt ? new Date(generatedAt) : new Date();
  const dateHe = genTime.toLocaleDateString("he-IL");
  return `<div dir="rtl" style="width:100%; padding:0 14mm; font-family: Arial, sans-serif; font-size:7.5pt; color:#94a3b8; display:flex; justify-content:space-between;">
    <span>נוצר אוטומטית בתאריך ${esc(dateHe)} | מנוע MathematiCore v7.0</span>
    <span>עמוד <span class="pageNumber"></span> מתוך <span class="totalPages"></span></span>
  </div>`;
}

function bulletList(items: unknown[], className: string): string {
  return `<ul class="${className}">${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
}

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((v) => String(v ?? "")).filter((v) => v.length > 0) : [];

// ---------------------------------------------------------------------------
// Individual pedagogical report (one learner, one meeting).
// ---------------------------------------------------------------------------

const MEASURE = Object.fromEntries(RESEARCH_MEASURES_HE.map((m) => [m.key, m])) as Record<(typeof RESEARCH_MEASURES_HE)[number]["key"], (typeof RESEARCH_MEASURES_HE)[number]>;

/**
 * Measure 2א did not exist before 30.9.2026: a report stored earlier has no
 * value for it, which is not the same as "no exercise had a mistake".
 */
const persistenceCell = (p: PersistenceIndex | null | undefined): string => (p ? persistenceHe(p) : "לא נמדד בדוח זה");

/**
 * Research measures of one learner (PRD 7.3, Module 23 §ב; measure 2 in two
 * parts, owner 30.9.2026), one row each: its name, this meeting, cumulative,
 * and one sentence on what it says. Absent on reports generated before they existed.
 * `sectionNumber` follows the report's own sections: meeting 1 has one more.
 */
function researchMeasuresCard(m: Record<string, any> | null | undefined, sectionNumber: number): string {
  if (!m) return "";
  const row = (key: keyof typeof MEASURE, now: string, total: string) =>
    `<tr><td class="label">${esc(MEASURE[key].label)}</td><td>${esc(now)}</td><td>${esc(total)}</td><td style="text-align:start">${esc(MEASURE[key].explanation)}</td></tr>`;
  return `<h2>${sectionNumber}. מדדי המחקר</h2>
    <table><thead><tr><th>מדד</th><th>במפגש זה</th><th>מצטבר</th><th>מה המדד אומר</th></tr></thead><tbody>
      ${row("persistence", persistenceCell(m.persistence_without_help), "—")}
      ${row("self_correction", selfCorrectionHe(m.persistence ?? null), "—")}
      ${row("flexibility", flexibilityHe(m.flexibility ?? null), `${flexibilityHe(m.flexibility_cumulative ?? null)} (מפגשים 3 ו-7)`)}
      ${row("mediation", mediationHe(m.mediation ?? null), `${mediationHe(m.mediation_cumulative ?? null)} (כל המפגשים)`)}
    </tbody></table>`;
}

/**
 * "לפני האיפוס" (owner, 2.10.2026): where the learner went wrong before the
 * meeting's last reset. Its own section, after the narrative, never a score.
 * Absent when the meeting was not reset (and on reports stored before it existed).
 */
function preResetSection(preReset: Record<string, any> | null | undefined): string {
  const lines = asStringArray(preReset?.lines_he);
  if (lines.length === 0) return "";
  return `<h2 class="pre-reset">${esc(PRE_RESET_HEADING_HE)}</h2>
    <p class="muted">${esc(PRE_RESET_NOTE_HE)}</p>
    ${bulletList(lines, "")}`;
}

/**
 * Catch-up time (owner, 2.10.2026: "המורה יקח את אותם ילדים שלא סיימו למפגש
 * נוסף \ זמן נוסף וזה יתועד מה הסיבה לכך"): the personal report's one line —
 * the extra minutes and the reasons recorded. Absent when nothing was recorded
 * (and on reports stored before it existed).
 */
function catchUpCardLine(catchUp: Record<string, any> | null | undefined): string {
  const line = typeof catchUp?.line_he === "string" ? catchUp.line_he.trim() : "";
  return line ? `<div class="wide catch-up">${esc(line)}</div>` : "";
}

export const CATCH_UP_HEADING_HE = "זמן השלמה";
export const CATCH_UP_NOTE_HE =
  "תלמידים שלא סיימו את המפגש: הסיבה שנרשמה, וכמה דקות השלמה קיבלו. נספרות רק הדקות שבהן התלמיד עבד במערכת.";

const learnersCountHe = (n: number) => (n === 1 ? "תלמיד אחד" : `${n} תלמידים`);
const minutesCountHe = (n: number) => (n === 1 ? "דקה אחת" : `${n} דקות`);

/**
 * The class report's catch-up block: one row per learner (by number only) and
 * how many learners each reason was recorded for. Empty when no learner has a
 * record (and on class reports stored before it existed).
 */
export function classCatchUpSection(catchUp: ClassCatchUpSummary | null | undefined, heading: string): string {
  const learners = Array.isArray(catchUp?.learners) ? catchUp!.learners : [];
  if (learners.length === 0) return "";
  const counts = (catchUp!.reason_counts ?? {}) as Partial<Record<CatchUpReasonKey, number>>;
  const reasons = CATCHUP_REASON_KEYS
    .filter((k) => (counts[k] ?? 0) > 0)
    .map((k) => `<li><b>${esc(CATCHUP_REASON_HE[k])}:</b> ${esc(learnersCountHe(counts[k] ?? 0))}</li>`)
    .join("");
  const rows = learners.map((l) => {
    const reasonsHe = Array.from(new Set(Array.isArray(l.reasons) ? l.reasons : []))
      .map((r) => catchUpReasonHe(r))
      .filter(Boolean)
      .join(", ");
    return `<tr>
      <td class="label">תלמיד ${esc(l.student_number)}</td>
      <td>${esc(l.rounds)}</td>
      <td>${esc(l.minutes)}</td>
      <td style="text-align:start">${esc(reasonsHe)}</td>
      <td style="text-align:start">${l.note ? esc(l.note) : "—"}</td>
    </tr>`;
  }).join("");
  const withRounds = Number(catchUp!.learners_with_rounds) || 0;
  const total = withRounds > 0
    ? `<p><b>קיבלו זמן השלמה:</b> ${esc(learnersCountHe(withRounds))}, ${esc(minutesCountHe(Number(catchUp!.total_minutes) || 0))} בסך הכול</p>`
    : "";
  return `<h2>${esc(heading)}</h2>
    <p class="muted">${esc(CATCH_UP_NOTE_HE)}</p>
    ${total}
    ${reasons ? `<h3>סיבות שנרשמו:</h3><ul>${reasons}</ul>` : ""}
    <table><thead><tr><th>תלמיד</th><th>סבבי השלמה</th><th>דקות השלמה</th><th>סיבה</th><th>הערה</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** One learner's tools: how often each was operated, and "לא הופעל" where it never was. */
function toolMasteryTable(m: ToolMastery | null | undefined): string {
  if (!m) return "";
  const rows = TOOLS.map((tool) => {
    const n = m.used?.[tool] ?? 0;
    return `<tr><td class="label">${esc(TOOL_LABEL_HE[tool])}</td><td class="${n > 0 ? "outcome-first_try" : "outcome-incomplete"}">${n === 0 ? "לא הופעל" : n === 1 ? "הופעל פעם אחת" : `הופעל ${esc(n)} פעמים`}</td></tr>`;
  }).join("");
  return `<table><thead><tr><th>כלי</th><th>שימוש במפגש</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** Each refresh exercise of meeting 1 and how the learner finished it — no percentage. */
function refreshOutcomesList(outcomes: Record<string, ExerciseOutcome> | null | undefined, titles: Record<string, string> | null | undefined): string {
  const entries = Object.entries(outcomes ?? {});
  if (entries.length === 0) return "<p>לא נרשמו תרגילים.</p>";
  const rows = entries.map(([id, outcome]) => {
    return `<tr><td class="label">${esc(exerciseLabelHe(titles, id))}</td><td class="outcome-${outcome}">${esc(OUTCOME_HE[outcome])}</td></tr>`;
  }).join("");
  return `<table><thead><tr><th>תרגיל</th><th>איך הסתיים</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/**
 * Meeting 1 (Module 14 §ב): no score, no working group, no recommended path.
 * The report answers what meeting 1 is for — can this learner be diagnosed
 * tomorrow without the interface or rust getting in the way.
 */
function sandboxReportHtml(report: Record<string, any>): string {
  const title = report.title_he || "MathematiCore - דוח היכרות וריענון";
  const narratives = asStringArray(report.exercise_narratives);
  const gaps = asStringArray(report.knowledge_gaps);
  const teaching = asStringArray(report.teaching_recommendations);
  const notUsed: string[] = Array.isArray(report.tool_mastery?.not_used)
    ? report.tool_mastery.not_used.map((t: string) => TOOL_LABEL_HE[t as keyof typeof TOOL_LABEL_HE] ?? t)
    : [];

  let insights: string;
  if (gaps.length > 0 || teaching.length > 0) {
    insights = "";
    if (gaps.length > 0) insights += `<h3>נקודות לתשומת לב לקראת האבחון:</h3>${bulletList(gaps, "amber-text")}`;
    if (teaching.length > 0) insights += `<h3>מה אפשר לעשות לפני האבחון:</h3>${bulletList(teaching, "amber-text")}`;
  } else {
    insights = `<p class="amber-text">${esc(report.ai_fallback_text || EXACT_AI_FALLBACK_TEXT_HE)}</p>`;
  }

  const body = `
    <h1>${esc(title)}</h1>
    <p class="subtitle">הערכה פדגוגית חסויה | מדיניות אפס מידע מזהה</p>

    <div class="card">
      <div><b>לומד:</b> ${esc(report.anonymous_student_label)}</div>
      <div><b>מפגש:</b> 1 — היכרות וריענון</div>
      <div class="wide"><b>כלים שעוד לא הופעלו:</b> ${notUsed.length > 0 ? esc(notUsed.join(", ")) : "אין — כל הכלים הופעלו"}</div>
      ${catchUpCardLine(report.catch_up)}
    </div>
    <p class="muted">${esc(SANDBOX_MEETING_PURPOSE_HE)}</p>

    <h2 class="green">1. שליטה בכלי המערכת</h2>
    ${toolMasteryTable(report.tool_mastery)}

    <h2>2. תרגילי הריענון</h2>
    ${refreshOutcomesList(report.exercise_outcomes, report.exercise_titles)}

    <h2>3. סיפור התרגילים הכרונולוגי</h2>
    ${narratives.length > 0 ? bulletList(narratives, "") : ""}
    ${preResetSection(report.pre_reset)}

    <h2 class="amber">4. לקראת האבחון</h2>
    ${insights}
    ${researchMeasuresCard(report.research_measures, 5)}
  `;
  return layout(title, body);
}

export function pedagogicalReportHtml(report: Record<string, any>): string {
  if (report.meeting_kind === "sandbox_refresh") return sandboxReportHtml(report);
  const title = report.title_he || "MathematiCore - דוח פדגוגי מסכם";
  // Meeting 2 only (the diagnostic's gate recommendation); never a colour by default.
  const pathLabel = report.matrix_recommended_path === "green_path"
    ? ROUTE_NAME_HE.green_path
    : report.matrix_recommended_path === "remediation_path"
    ? ROUTE_NAME_HE.remediation_path
    : null;
  const narratives = asStringArray(report.exercise_narratives);
  const choiceNarratives = asStringArray(report.choice_exercise_narratives);
  const gaps = asStringArray(report.knowledge_gaps);
  const teaching = asStringArray(report.teaching_recommendations);

  let insights: string;
  if (gaps.length > 0 || teaching.length > 0) {
    insights = "";
    if (gaps.length > 0) insights += `<h3>פערי ידע שאותרו:</h3>${bulletList(gaps, "amber-text")}`;
    if (teaching.length > 0) insights += `<h3>המלצות הוראה להמשך העבודה בכיתה:</h3>${bulletList(teaching, "amber-text")}`;
  } else {
    // The PRD fixes this sentence verbatim for the engine-unavailable case.
    insights = `<p class="amber-text">${esc(report.ai_fallback_text || EXACT_AI_FALLBACK_TEXT_HE)}</p>`;
  }

  const body = `
    <h1>${esc(title)}</h1>
    <p class="subtitle">הערכה פדגוגית חסויה | מדיניות אפס מידע מזהה</p>

    <div class="card">
      <div><b>לומד:</b> ${esc(report.anonymous_student_label)}</div>
      <div><b>מפגש:</b> ${esc(report.session_number)}</div>
      <div><b>ציון שליטה:</b> ${esc(report.score_percent)}%</div>
      ${pathLabel ? `<div class="wide"><b>מסלול מומלץ:</b> ${esc(pathLabel)}</div>` : ""}
      ${catchUpCardLine(report.catch_up)}
    </div>

    <h2 class="green">1. המלצת ניתוב פדגוגי</h2>
    <div class="routing">
      <p class="green-text"><b>קבוצת למידה:</b> ${esc(report.routing_label_he || report.routing_group)}</p>
      <p><b>פירוט פדגוגי:</b> ${esc(report.recommendation_details_he || report.routing_label_he)}</p>
    </div>

    <h2>2. סיפור התרגילים הכרונולוגי</h2>
    ${narratives.length > 0 ? bulletList(narratives, "") : ""}
    ${choiceNarratives.length > 0 ? `<h3>${esc(CHOICE_EXERCISES_HEADING_HE)}</h3>${bulletList(choiceNarratives, "")}` : ""}
    ${preResetSection(report.pre_reset)}

    <h2 class="amber">3. תובנות קוגניטיביות פדגוגיות</h2>
    ${insights}
    ${researchMeasuresCard(report.research_measures, 4)}
  `;
  return layout(title, body);
}

// ---------------------------------------------------------------------------
// Class report (one meeting, all learners).
// ---------------------------------------------------------------------------

const studentList = (ids: number[]) => (ids.length > 0 ? ids.map((id) => `תלמיד ${id}`).join(", ") : "אין");

/**
 * An exercise by the Hebrew title the teacher's screens show. A choice
 * exercise is not in the published catalog: it gets a Hebrew label, never its
 * id (exerciseLabelHe).
 */
function exerciseName(titles: Record<string, string> | null | undefined, id: string): string {
  return esc(exerciseLabelHe(titles, id));
}

/** A percentage that may not have been measured. Never printed as a bare "%". */
const pctHe = (value: number | null | undefined): string => (typeof value === "number" ? `${value}%` : "לא נמדד");

function learnersTable(rows: ClassLearnerRow[], scored = true): string {
  const head = [
    "לומד", ...(scored ? ["ציון", "נכון בניסיון ראשון"] : []), "תרגילים שנפתחו", "תרגילים שהושלמו", "ספרות שגויות",
    ...COLUMN_NAMES_HE.map((c) => `שגויות: ${c}`),
    "מחיקות", "ביטולים", "היסוסים", "המרות", "כרטיסים", "דקות", "רפלקציה",
  ];
  const body = rows.map((r) => `
    <tr>
      <td class="label">תלמיד ${esc(r.student_id)}</td>
      ${scored ? `<td>${esc(pctHe(r.score_percent))}</td>
      <td>${r.score_percent === null ? "לא נמדד" : `${esc(r.correct_first_attempt)} מתוך ${esc(r.compulsory_total)}`}</td>` : ""}
      <td>${esc(r.exercises_attempted)}</td>
      <td>${esc(r.exercises_completed)}</td>
      <td>${esc(r.wrong_digits)}</td>
      <td>${esc(r.wrong_digits_units)}</td>
      <td>${esc(r.wrong_digits_tens)}</td>
      <td>${esc(r.wrong_digits_hundreds)}</td>
      <td>${esc(r.wrong_digits_thousands)}</td>
      <td>${esc(r.deletions)}</td>
      <td>${esc(r.undos)}</td>
      <td>${esc(r.hesitations)}</td>
      <td>${esc(r.regroupings)}</td>
      <td>${esc(r.socratic_cards)}</td>
      <td>${esc(r.active_minutes)}</td>
      <td>${r.reflection_submitted ? "כן" : "לא"}</td>
    </tr>`).join("");
  return `<table class="dense"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
}

/** A stored report from before `path_type` existed is classified by the exercise id. */
function pathTypeOf(ex: { exercise_id: string; path_type?: string }) {
  return ex.path_type === "compulsory" || ex.path_type === "consolidation" || ex.path_type === "challenge"
    ? ex.path_type
    : exercisePathType(ex.exercise_id);
}

function choiceLabelOf(ex: { exercise_id: string; path_type?: string }): string {
  const t = pathTypeOf(ex);
  return t === "compulsory" ? "" : CHOICE_PATH_LABEL_HE[t];
}

function outcomesTable(rows: ClassLearnerRow[], exerciseIds: string[], titles?: Record<string, string> | null): string {
  if (exerciseIds.length === 0) return "";
  const head = `<tr><th>לומד</th>${exerciseIds.map((id) => `<th>${exerciseName(titles, id)}${exercisePathType(id) === "compulsory" ? "" : "<br>(תרגיל בחירה)"}</th>`).join("")}</tr>`;
  const body = rows.map((r) => {
    const cells = exerciseIds.map((id) => {
      const outcome = r.exercise_outcomes[id];
      const cls = outcome ? `outcome-${outcome}` : "outcome-not_attempted";
      return `<td class="${cls}">${outcome ? esc(OUTCOME_HE[outcome]) : "לא נפתח"}</td>`;
    }).join("");
    return `<tr><td class="label">תלמיד ${esc(r.student_id)}</td>${cells}</tr>`;
  }).join("");
  return `<p class="muted">תוצאה לכל תרגיל, לכל לומד:</p><table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

/** Research measures 3–4 (PRD 7.3, Module 23 §ב): this meeting and cumulative, per learner. */
function researchMeasuresSection(rows: ClassLearnerRow[], a: ClassAggregates): string {
  if (rows.length === 0) return "";
  const without = Array.isArray(a.learners_without_mediation)
    ? `<p><b>לא נדרשו לתיווך במפגש זה:</b> ${esc(a.learners_without_mediation.length)} מתוך 12, נתונים קיימים ל-${esc(a.learners_with_data)} לומדים${a.learners_without_mediation.length > 0 ? ` (${esc(studentList(a.learners_without_mediation))})` : ""}</p>`
    : "";
  const head = ["לומד", "2א. התמדה", "2ב. תיקון עצמי", "3. גמישות ייצוגית", "3. גמישות ייצוגית – מצטבר (מפגשים 3 ו-7)", "4. אפקטיביות התיווך", "4. אפקטיביות התיווך – מצטבר (כל המפגשים)"];
  const legend = `<ul class="muted">${RESEARCH_MEASURES_HE.map((m) => `<li><b>${esc(m.label)}.</b> ${esc(m.explanation)}</li>`).join("")}</ul>`;
  const body = rows.map((r) => `
    <tr>
      <td class="label">תלמיד ${esc(r.student_id)}</td>
      <td>${esc(persistenceCell(r.persistence_without_help))}</td>
      <td>${esc(selfCorrectionHe(r.persistence ?? null))}</td>
      <td>${esc(flexibilityHe(r.flexibility))}</td>
      <td>${esc(flexibilityHe(r.flexibility_cumulative))}</td>
      <td>${esc(mediationHe(r.mediation))}</td>
      <td>${esc(mediationHe(r.mediation_cumulative))}</td>
    </tr>`).join("");
  return `<h2>4ב. מדדי המחקר</h2>
    ${legend}
    ${without}
    <table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
}

/**
 * Meeting 8 (register deviation 19): each learner's fading gap — the same
 * numbers without לבני הדינס against meetings 4–6 with them. Empty for every
 * other meeting, where no row carries a gap.
 */
function fadingGapSection(rows: ClassLearnerRow[], titles: Record<string, string> | null): string {
  const withGap = rows.filter((r) => r.fading_gap);
  if (withGap.length === 0) return "";
  const v = (x: number | null | undefined, unit: string) => (typeof x === "number" ? `${x}${unit}` : "—");
  const names = (ids: string[] | null | undefined) =>
    Array.isArray(ids) && ids.length > 0 ? ids.map((id) => exerciseLabelHe(titles, id)).join(", ") : "אין";
  const head = [
    "לומד", "זוגות שנמדדו",
    "נכון בניסיון ראשון: עם לבני הדינס", "נכון בניסיון ראשון: בלי לבני הדינס",
    "זמן ממוצע לתרגיל: עם לבני הדינס", "זמן ממוצע לתרגיל: בלי לבני הדינס",
    `מהר מדי (מתחת ל-${FADING_GUESS_SECONDS} שניות)`, "ללא זוג",
  ];
  const body = withGap.map((r) => {
    const f = r.fading_gap!;
    return `<tr>
      <td class="label">תלמיד ${esc(r.student_id)}</td>
      <td>${esc(f.pairs_measured)}</td>
      <td>${esc(v(f.accuracy_with_blocks_percent, "%"))}</td>
      <td>${esc(v(f.accuracy_without_blocks_percent, "%"))}</td>
      <td>${esc(v(f.mean_seconds_with_blocks, " שניות"))}</td>
      <td>${esc(v(f.mean_seconds_without_blocks, " שניות"))}</td>
      <td style="text-align:start">${esc(names(f.guessed_exercises))}</td>
      <td style="text-align:start">${esc(names(f.unpaired_exercises))}</td>
    </tr>`;
  }).join("");
  return `<h2 class="pre-reset">4א. פער הדעיכה: מפגש 8 בלי לבני הדינס מול מפגשים 4–6 עם לבני הדינס (אותם מספרים, אותו לומד)</h2>
    <table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Meeting 1: per tool, which learners never operated it — what to show the class before the diagnostic. */
function classToolsSection(rows: ClassLearnerRow[], a: ClassAggregates): string {
  const list = TOOLS.map((tool) => {
    const ids = a.tools_not_used?.[tool] ?? [];
    return `<li><b>${esc(TOOL_LABEL_HE[tool])}:</b> ${ids.length > 0 ? `לא הפעילו — ${esc(studentList(ids))}` : "כל הלומדים הפעילו"}</li>`;
  }).join("");
  const head = ["לומד", ...TOOLS.map((t) => TOOL_LABEL_HE[t])];
  const body = rows.map((r) => `
    <tr>
      <td class="label">תלמיד ${esc(r.student_id)}</td>
      ${TOOLS.map((t) => {
        const n = r.tool_mastery?.used?.[t] ?? 0;
        return `<td class="${n > 0 ? "outcome-first_try" : "outcome-incomplete"}">${n > 0 ? esc(n) : "—"}</td>`;
      }).join("")}
    </tr>`).join("");
  return `<ul>${list}</ul>
    <table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
}

/** The class report is table-heavy (17 columns per learner), so it prints landscape. */
export const CLASS_REPORT_PDF_OPTIONS = { landscape: true };

export function classReportHtml(report: Record<string, any>): string {
  const title = report.title_he || "MathematiCore - דוח כיתה";
  const a: ClassAggregates = report.aggregates;
  const rows: ClassLearnerRow[] = Array.isArray(report.learners) ? report.learners : [];
  const exerciseIds = a.exercises.map((ex) => ex.exercise_id);
  const patterns = asStringArray(report.class_patterns);
  const teaching = asStringArray(report.teaching_recommendations);

  const tiers = (["below_50", "between_50_75", "above_75"] as RecommendationTier[])
    .map((tier) => `<li class="green-text"><b>${esc(TIER_LABEL_HE[tier])}:</b> ${esc(studentList(a.tiers[tier]))}</li>`)
    .join("");
  const withoutData = a.learners_without_data.length > 0
    ? `<p class="muted">ללא פעולות מתועדות במפגש זה: ${esc(studentList(a.learners_without_data))}</p>`
    : "";

  // The compulsory count comes from the published curriculum catalog. When it is
  // missing there is no denominator and no score — say so, and say what to do.
  const withoutScore = a.learners_without_score.length > 0
    ? `<p class="muted"><b>ללא ציון:</b> ${esc(studentList(a.learners_without_score))}. מאגר תרגילי החובה של המפגש אינו זמין; על מנהל המערכת לפרסם את תוכנית הלימודים.</p>`
    : "";

  const titles: Record<string, string> | null = report.exercise_titles ?? null;
  // Why the cards opened and the error categories, by the names the teacher's screens use.
  const triggers = esc(triggerCountsHe(a.socratic_triggers));
  const categories = esc(errorCategoryCountsHe(a.error_categories));

  // מסמך 03: the choice exercises marked as such, apart from the compulsory ones.
  const compulsoryExercises = a.exercises.filter((ex) => pathTypeOf(ex) === "compulsory");
  const choiceExercises = a.exercises.filter((ex) => pathTypeOf(ex) !== "compulsory");
  const exerciseTable = (list: ClassAggregates["exercises"], choice: boolean) => `<table>
        <thead><tr><th>תרגיל</th>${choice ? "<th>נתיב</th>" : ""}<th>פתחו</th><th>סיימו</th><th>בניסיון ראשון</th><th>אחוז בניסיון ראשון</th><th>ספרות שגויות</th><th>כרטיסים</th><th>היסוסים</th></tr></thead>
        <tbody>${list.map((ex) => `
          <tr>
            <td class="label">${exerciseName(titles, ex.exercise_id)}</td>
            ${choice ? `<td>${esc(choiceLabelOf(ex))}</td>` : ""}
            <td>${esc(ex.attempted)}</td><td>${esc(ex.completed)}</td><td>${esc(ex.first_try)}</td>
            <td>${esc(ex.first_try_percent)}%</td><td>${esc(ex.wrong_digits)}</td>
            <td>${esc(ex.socratic_cards)}</td><td>${esc(ex.hesitations)}</td>
          </tr>`).join("")}
        </tbody></table>`;
  const exercises = a.exercises.length === 0
    ? "<p>לא נרשמו תרגילים.</p>"
    : `${compulsoryExercises.length > 0 ? exerciseTable(compulsoryExercises, false) : "<p>לא נרשמו תרגילי חובה.</p>"}
       ${choiceExercises.length > 0 ? `<h3>${esc(CHOICE_EXERCISES_HEADING_HE)}</h3>${exerciseTable(choiceExercises, true)}` : ""}`;

  // Owner, 2.10.2026: per learner whose meeting was reset, where they went wrong before it. Never scored.
  const preResetNotes = classPreResetNotes(report);
  const preReset = preResetNotes.length === 0
    ? ""
    : `<h2 class="pre-reset">4ג. ${esc(PRE_RESET_HEADING_HE)}</h2>
    <p class="muted">${esc(PRE_RESET_NOTE_HE)}</p>
    ${bulletList(preResetNotes, "")}`;

  // Owner, 2.10.2026: who did not finish the meeting, why, and the catch-up minutes they got.
  const catchUp = classCatchUpSection(report.catch_up, `4ד. ${CATCH_UP_HEADING_HE}`);

  const scored = a.scored !== false;
  let analysis: string;
  if (patterns.length > 0 || teaching.length > 0) {
    analysis = "";
    if (patterns.length > 0) analysis += `<h3>${scored ? "דפוסים כיתתיים שאותרו:" : "נקודות לתשומת לב לקראת האבחון:"}</h3>${bulletList(patterns, "amber-text")}`;
    if (teaching.length > 0) analysis += `<h3>${scored ? "המלצות הוראה לכיתה:" : "מה אפשר לעשות לפני האבחון:"}</h3>${bulletList(teaching, "amber-text")}`;
  } else {
    analysis = `<p class="amber-text">${esc(EXACT_AI_FALLBACK_TEXT_HE)}</p>`;
  }

  if (!scored) {
    // Meeting 1 (Module 14 §ב): no mean, no median, no working groups.
    const sandboxBody = `
    <h1>${esc(title)}</h1>
    <p class="subtitle">דוח כיתתי חסוי | מדיניות אפס מידע מזהה | לומדים מזוהים במספר בלבד</p>

    <div class="card">
      <div><b>מפגש:</b> 1 — היכרות וריענון</div>
      <div><b>לומדים עם נתונים:</b> ${esc(a.learners_with_data)} מתוך 12</div>
      <div class="wide"><b>זמן פעילות ממוצע:</b> ${esc(a.active_minutes_mean)} דקות</div>
    </div>
    <p class="muted">${esc(SANDBOX_MEETING_PURPOSE_HE)}</p>
    ${withoutData}

    <h2 class="green">1. שליטה בכלי המערכת לקראת האבחון</h2>
    ${classToolsSection(rows, a)}

    <h2>2. תמונת מצב כיתתית</h2>
    <p>פעולות מתועדות: ${esc(a.events_total)} | ספרות שהוזנו: ${esc(a.digits_entered_total)} | ספרות שגויות: ${esc(a.wrong_digits_total)}
      (${COLUMN_NAMES_HE[0]} ${esc(a.wrong_digits_by_column.units)}, עשרות ${esc(a.wrong_digits_by_column.tens)}, מאות ${esc(a.wrong_digits_by_column.hundreds)}, אלפים ${esc(a.wrong_digits_by_column.thousands)})</p>
    <p>מחיקות: ${esc(a.deletions_total)} | ביטולים: ${esc(a.undos_total)} | היסוסים: ${esc(a.hesitations_total)} (${esc(a.hesitation_seconds_total)} שניות) | המרות (הקבצה/פריטה): ${esc(a.regroupings_total)}</p>
    <p>כרטיסי חניכה: ${esc(a.socratic_cards_total)}${triggers ? ` (${triggers})` : ""} | סיווגי שגיאה: ${categories || "אין"}</p>

    <h2>3. תרגילי הריענון: כמה לומדים פתרו בניסיון ראשון</h2>
    ${exercises}

    <h2>4. טבלת הלומדים</h2>
    ${learnersTable(rows, false)}
    ${outcomesTable(rows, exerciseIds, titles)}

    ${researchMeasuresSection(rows, a)}
    ${preReset}
    ${catchUp}

    <h2 class="amber">5. ניתוח הבינה: לקראת האבחון</h2>
    ${analysis}
  `;
    return layout(title, sandboxBody);
  }

  const body = `
    <h1>${esc(title)}</h1>
    <p class="subtitle">דוח כיתתי חסוי | מדיניות אפס מידע מזהה | לומדים מזוהים במספר בלבד</p>

    <div class="card">
      <div><b>מפגש:</b> ${esc(report.session_number)}</div>
      <div><b>לומדים עם נתונים:</b> ${esc(a.learners_with_data)} מתוך 12</div>
      <div><b>ציון ממוצע:</b> ${esc(pctHe(a.score_mean))}</div>
      <div><b>חציון:</b> ${esc(pctHe(a.score_median))}</div>
      <div><b>טווח:</b> ${a.score_min === null ? "לא נמדד" : `${esc(a.score_min)}%–${esc(a.score_max)}%`}</div>
      <div><b>${esc(ROUTE_NAME_HE.green_path)}:</b> ${esc(a.paths.green_path)} | <b>${esc(ROUTE_NAME_HE.remediation_path)}:</b> ${esc(a.paths.remediation_path)}</div>
    </div>

    <h2 class="green">1. קבוצות עבודה לפי כלל האחוזים (שכבה 1, דטרמיניסטית)</h2>
    <ul>${tiers}</ul>
    ${withoutData}
    ${withoutScore}

    <h2>2. תמונת מצב כיתתית</h2>
    <p>פעולות מתועדות: ${esc(a.events_total)} | ספרות שהוזנו: ${esc(a.digits_entered_total)} | ספרות שגויות: ${esc(a.wrong_digits_total)}
      (${COLUMN_NAMES_HE[0]} ${esc(a.wrong_digits_by_column.units)}, עשרות ${esc(a.wrong_digits_by_column.tens)}, מאות ${esc(a.wrong_digits_by_column.hundreds)}, אלפים ${esc(a.wrong_digits_by_column.thousands)})</p>
    <p>מחיקות: ${esc(a.deletions_total)} | ביטולים: ${esc(a.undos_total)} | היסוסים: ${esc(a.hesitations_total)} (${esc(a.hesitation_seconds_total)} שניות) | המרות (הקבצה/פריטה): ${esc(a.regroupings_total)}</p>
    <p>כרטיסי חניכה: ${esc(a.socratic_cards_total)}${triggers ? ` (${triggers})` : ""} | סיווגי שגיאה: ${categories || "אין"}</p>
    <p>לוח החיבור: נפתח ${esc(a.grid_openings_total)}, הוחזר על ידי הלומד ${esc(a.grid_reopenings_total)} | הקלדה לפני המרה (מקלדת נעולה): ${esc(a.keyboard_lock_blocks_total)} | קריאות שקטות למורה: ${esc(a.help_requests_total)}${a.help_withdrawals_total ? ` (הלומדים ביטלו ${esc(a.help_withdrawals_total)} מהן)` : ""} | בקשות עזרה מהצ׳אט: ${esc(a.chat_help_requests_total ?? 0)} | פיגום בשורת התוצאה: ${esc(a.place_cue_scaffolds_total)}</p>
    <p>זמן פעילות ממוצע: ${esc(a.active_minutes_mean)} דקות | דקות הקלטה: ${esc(a.recording_minutes_total)} | רפלקציות: ${esc(a.reflections_submitted)} מתוך ${esc(a.learners_with_data)}</p>

    <h2>3. תרגילים: כמה לומדים פתרו בניסיון ראשון</h2>
    ${exercises}

    <h2>4. טבלת הלומדים (כל מה שנמדד ליחיד)</h2>
    ${learnersTable(rows)}
    ${outcomesTable(rows, exerciseIds, titles)}

    ${fadingGapSection(rows, titles)}
    ${researchMeasuresSection(rows, a)}
    ${preReset}
    ${catchUp}

    <h2 class="amber">5. ניתוח הבינה: דפוסים כיתתיים והמלצות הוראה</h2>
    ${analysis}
  `;
  return layout(title, body);
}
