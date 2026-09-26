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
 * learner numbers (Zero PII), and escaping keeps a stray "<" in an AI
 * sentence from becoming markup.
 */
import * as fs from "fs";
import { fontPath } from "./htmlPdf";
import type { ClassAggregates, ClassLearnerRow, ExerciseOutcome } from "./classReport";
import {
  CHOICE_PATH_LABEL_HE,
  exercisePathType,
  flexibilityHe,
  mediationHe,
  persistenceHe,
  SANDBOX_MEETING_PURPOSE_HE,
  TOOL_LABEL_HE,
  TOOLS,
  type ToolMastery,
} from "./meetingMetrics";
import type { RecommendationTier } from "./reportAnalysis";

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
  below_50: "קבוצה הומוגנית קטנה, תבניות עשר פיזיות (ציון מתחת ל-50%)",
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

/** A Latin identifier (exercise id, trigger name) isolated so it never flips the Hebrew around it. */
const ltr = (value: unknown) => `<bdi dir="ltr">${esc(value)}</bdi>`;

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
  h3 { margin: 8px 0 4px; font-size: 11pt; font-weight: 700; color: #92400e; break-after: avoid; }
  p { margin: 0 0 6px; }
  ul { margin: 0 0 6px; padding-inline-start: 18px; }
  li { margin: 0 0 4px; break-inside: avoid; }
  .green-text { color: #14532d; }
  .amber-text { color: #78350f; }
  .muted { color: #64748b; font-size: 9.5pt; }
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

/** Research measures 3–4 of one learner (PRD 7.3, Module 23 §ב). Absent on reports generated before they existed. */
function researchMeasuresCard(m: Record<string, any> | null | undefined): string {
  if (!m) return "";
  return `<h2>4. מדדי המחקר</h2>
    <p><b>התמדה וויסות עצמי במפגש זה:</b> ${esc(persistenceHe(m.persistence ?? null))}</p>
    <p><b>גמישות ייצוגית במפגש זה:</b> ${esc(flexibilityHe(m.flexibility ?? null))} | <b>מצטבר (מפגשים 3 ו-7):</b> ${esc(flexibilityHe(m.flexibility_cumulative ?? null))}</p>
    <p><b>אפקטיביות התיווך במפגש זה:</b> ${esc(mediationHe(m.mediation ?? null))} | <b>מצטבר (כל המפגשים):</b> ${esc(mediationHe(m.mediation_cumulative ?? null))}</p>`;
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
    const title = titles?.[id];
    return `<tr><td class="label">${title ? esc(title) : ltr(id)}</td><td class="outcome-${outcome}">${esc(OUTCOME_HE[outcome])}</td></tr>`;
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
    <p class="subtitle">הערכה פדגוגית חסויה | מדיניות אפס מידע מזהה (Zero PII)</p>

    <div class="card">
      <div><b>לומד:</b> ${esc(report.anonymous_student_label)}</div>
      <div><b>מפגש:</b> 1 — היכרות וריענון</div>
      <div class="wide"><b>כלים שעוד לא הופעלו:</b> ${notUsed.length > 0 ? esc(notUsed.join(", ")) : "אין — כל הכלים הופעלו"}</div>
    </div>
    <p class="muted">${esc(SANDBOX_MEETING_PURPOSE_HE)}</p>

    <h2 class="green">1. שליטה בכלי המערכת</h2>
    ${toolMasteryTable(report.tool_mastery)}

    <h2>2. תרגילי הריענון</h2>
    ${refreshOutcomesList(report.exercise_outcomes, report.exercise_titles)}

    <h2>3. סיפור התרגילים הכרונולוגי (Exercise Narratives)</h2>
    ${narratives.length > 0 ? bulletList(narratives, "") : ""}

    <h2 class="amber">4. לקראת האבחון</h2>
    ${insights}
    ${researchMeasuresCard(report.research_measures)}
  `;
  return layout(title, body);
}

export function pedagogicalReportHtml(report: Record<string, any>): string {
  if (report.meeting_kind === "sandbox_refresh") return sandboxReportHtml(report);
  const title = report.title_he || "MathematiCore - דוח פדגוגי מסכם";
  const pathLabel = report.matrix_recommended_path === "green_path"
    ? "מסלול העמקה (ירוק)"
    : "מסלול ביסוס ומענה מותאם (צהוב)";
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
    <p class="subtitle">הערכה פדגוגית חסויה | מדיניות אפס מידע מזהה (Zero PII)</p>

    <div class="card">
      <div><b>לומד:</b> ${esc(report.anonymous_student_label)}</div>
      <div><b>מפגש:</b> ${esc(report.session_number)}</div>
      <div><b>ציון שליטה:</b> ${esc(report.score_percent)}%</div>
      <div class="wide"><b>מסלול מומלץ:</b> ${esc(pathLabel)}</div>
    </div>

    <h2 class="green">1. המלצת ניתוב פדגוגי</h2>
    <div class="routing">
      <p class="green-text"><b>קבוצת למידה:</b> ${esc(report.routing_label_he || report.routing_group)}</p>
      <p><b>פירוט פדגוגי:</b> ${esc(report.recommendation_details_he || report.routing_label_he)}</p>
    </div>

    <h2>2. סיפור התרגילים הכרונולוגי (Exercise Narratives)</h2>
    ${narratives.length > 0 ? bulletList(narratives, "") : ""}
    ${choiceNarratives.length > 0 ? `<h3>${esc(CHOICE_EXERCISES_HEADING_HE)}</h3>${bulletList(choiceNarratives, "")}` : ""}

    <h2 class="amber">3. תובנות קוגניטיביות פדגוגיות</h2>
    ${insights}
    ${researchMeasuresCard(report.research_measures)}
  `;
  return layout(title, body);
}

// ---------------------------------------------------------------------------
// Class report (one meeting, all learners).
// ---------------------------------------------------------------------------

const studentList = (ids: number[]) => (ids.length > 0 ? ids.map((id) => `תלמיד ${id}`).join(", ") : "אין");

/** "key: value" pairs of Latin trigger/category names, each pair kept together as one left-to-right unit. */
function keyValueList(map: Record<string, number>): string {
  return Object.entries(map).map(([k, v]) => ltr(`${k}: ${v}`)).join(", ");
}

/** A percentage that may not have been measured. Never printed as a bare "%". */
const pctHe = (value: number | null | undefined): string => (typeof value === "number" ? `${value}%` : "לא נמדד");

function learnersTable(rows: ClassLearnerRow[], scored = true): string {
  const head = [
    "לומד", ...(scored ? ["ציון", "נכון בניסיון ראשון"] : []), "תרגילים שנפתחו", "תרגילים שהושלמו", "ספרות שגויות",
    "שגויות: אחדות", "שגויות: עשרות", "שגויות: מאות", "שגויות: אלפים",
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

function outcomesTable(rows: ClassLearnerRow[], exerciseIds: string[]): string {
  if (exerciseIds.length === 0) return "";
  const head = `<tr><th>לומד</th>${exerciseIds.map((id) => `<th>${ltr(id)}${exercisePathType(id) === "compulsory" ? "" : "<br>(תרגיל בחירה)"}</th>`).join("")}</tr>`;
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
  const head = ["לומד", "התמדה וויסות עצמי", "גמישות ייצוגית", "גמישות, מצטבר (מפגשים 3 ו-7)", "אפקטיביות התיווך", "אפקטיביות התיווך, מצטבר"];
  const body = rows.map((r) => `
    <tr>
      <td class="label">תלמיד ${esc(r.student_id)}</td>
      <td>${esc(persistenceHe(r.persistence ?? null))}</td>
      <td>${esc(flexibilityHe(r.flexibility))}</td>
      <td>${esc(flexibilityHe(r.flexibility_cumulative))}</td>
      <td>${esc(mediationHe(r.mediation))}</td>
      <td>${esc(mediationHe(r.mediation_cumulative))}</td>
    </tr>`).join("");
  return `<h2>4ב. מדדי המחקר: התמדה, גמישות ייצוגית ואפקטיביות התיווך</h2>
    ${without}
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

  const triggers = keyValueList(a.socratic_triggers);
  const categories = keyValueList(a.error_categories);

  // מסמך 03: the choice exercises marked as such, apart from the compulsory ones.
  const compulsoryExercises = a.exercises.filter((ex) => pathTypeOf(ex) === "compulsory");
  const choiceExercises = a.exercises.filter((ex) => pathTypeOf(ex) !== "compulsory");
  const exerciseTable = (list: ClassAggregates["exercises"], choice: boolean) => `<table>
        <thead><tr><th>תרגיל</th>${choice ? "<th>נתיב</th>" : ""}<th>פתחו</th><th>סיימו</th><th>בניסיון ראשון</th><th>אחוז בניסיון ראשון</th><th>ספרות שגויות</th><th>כרטיסים</th><th>היסוסים</th></tr></thead>
        <tbody>${list.map((ex) => `
          <tr>
            <td class="label">${ltr(ex.exercise_id)}</td>
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
    <p class="subtitle">דוח כיתתי חסוי | מדיניות אפס מידע מזהה (Zero PII) | לומדים מזוהים במספר בלבד</p>

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
      (אחדות ${esc(a.wrong_digits_by_column.units)}, עשרות ${esc(a.wrong_digits_by_column.tens)}, מאות ${esc(a.wrong_digits_by_column.hundreds)}, אלפים ${esc(a.wrong_digits_by_column.thousands)})</p>
    <p>מחיקות: ${esc(a.deletions_total)} | ביטולים: ${esc(a.undos_total)} | היסוסים: ${esc(a.hesitations_total)} (${esc(a.hesitation_seconds_total)} שניות) | המרות (הקבצה/פריטה): ${esc(a.regroupings_total)}</p>
    <p>כרטיסי חניכה: ${esc(a.socratic_cards_total)}${triggers ? ` (${triggers})` : ""} | סיווגי שגיאה: ${categories || "אין"}</p>

    <h2>3. תרגילי הריענון: כמה לומדים פתרו בניסיון ראשון</h2>
    ${exercises}

    <h2>4. טבלת הלומדים</h2>
    ${learnersTable(rows, false)}
    ${outcomesTable(rows, exerciseIds)}

    ${researchMeasuresSection(rows, a)}

    <h2 class="amber">5. ניתוח הבינה: לקראת האבחון</h2>
    ${analysis}
  `;
    return layout(title, sandboxBody);
  }

  const body = `
    <h1>${esc(title)}</h1>
    <p class="subtitle">דוח כיתתי חסוי | מדיניות אפס מידע מזהה (Zero PII) | לומדים מזוהים במספר בלבד</p>

    <div class="card">
      <div><b>מפגש:</b> ${esc(report.session_number)}</div>
      <div><b>לומדים עם נתונים:</b> ${esc(a.learners_with_data)} מתוך 12</div>
      <div><b>ציון ממוצע:</b> ${esc(pctHe(a.score_mean))}</div>
      <div><b>חציון:</b> ${esc(pctHe(a.score_median))}</div>
      <div><b>טווח:</b> ${a.score_min === null ? "לא נמדד" : `${esc(a.score_min)}%–${esc(a.score_max)}%`}</div>
      <div><b>מסלול ירוק:</b> ${esc(a.paths.green_path)} | <b>מסלול ביסוס:</b> ${esc(a.paths.remediation_path)}</div>
    </div>

    <h2 class="green">1. קבוצות עבודה לפי כלל האחוזים (שכבה 1, דטרמיניסטית)</h2>
    <ul>${tiers}</ul>
    ${withoutData}
    ${withoutScore}

    <h2>2. תמונת מצב כיתתית</h2>
    <p>פעולות מתועדות: ${esc(a.events_total)} | ספרות שהוזנו: ${esc(a.digits_entered_total)} | ספרות שגויות: ${esc(a.wrong_digits_total)}
      (אחדות ${esc(a.wrong_digits_by_column.units)}, עשרות ${esc(a.wrong_digits_by_column.tens)}, מאות ${esc(a.wrong_digits_by_column.hundreds)}, אלפים ${esc(a.wrong_digits_by_column.thousands)})</p>
    <p>מחיקות: ${esc(a.deletions_total)} | ביטולים: ${esc(a.undos_total)} | היסוסים: ${esc(a.hesitations_total)} (${esc(a.hesitation_seconds_total)} שניות) | המרות (הקבצה/פריטה): ${esc(a.regroupings_total)}</p>
    <p>כרטיסי חניכה: ${esc(a.socratic_cards_total)}${triggers ? ` (${triggers})` : ""} | סיווגי שגיאה: ${categories || "אין"}</p>
    <p>זמן פעילות ממוצע: ${esc(a.active_minutes_mean)} דקות | דקות הקלטה: ${esc(a.recording_minutes_total)} | רפלקציות: ${esc(a.reflections_submitted)} מתוך ${esc(a.learners_with_data)}</p>

    <h2>3. תרגילים: כמה לומדים פתרו בניסיון ראשון</h2>
    ${exercises}

    <h2>4. טבלת הלומדים (כל מה שנמדד ליחיד)</h2>
    ${learnersTable(rows)}
    ${outcomesTable(rows, exerciseIds)}

    ${researchMeasuresSection(rows, a)}

    <h2 class="amber">5. ניתוח הבינה: דפוסים כיתתיים והמלצות הוראה</h2>
    ${analysis}
  `;
  return layout(title, body);
}
