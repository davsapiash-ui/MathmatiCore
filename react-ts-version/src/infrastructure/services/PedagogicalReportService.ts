/**
 * מודול 23: מחולל דוחות פדגוגיים ומסמכי סיכום (Pedagogical Reporting Engine)
 * מייצר דוחות פדגוגיים (PDF / Printable HTML) בסיום מפגש 8 ולפי דרישת מורה/מנהל.
 * 
 * לוגיקת שיבוץ והמלצות פדגוגיות (Grouping Recommendations):
 * - ציון < 50%: 'Homogeneous Grouping / Physical Tens' (קבוצה הומוגנית ותמיכת עשרות פיזיות)
 * - ציון 50%-75%: 'Heterogeneous Grouping' (קבוצה הטרוגנית עם עמיתים)
 * - ציון > 75%: 'Independent / Challenge' (למידה עצמאית ומשימות אתגר והרחבה)
 * 
 * הקפדה מוחלטת על אנונימיות: מזהים 1-12 בלבד, אפס שמות או PII.
 */

import { normalizeStudentId } from '@/application/useChatStore';
import { containsPII } from '@/core/security/PiiFilter';
import type { SessionDocument } from '@/types';

export type PedagogicalGroupRecommendation = 
  | 'HOMOGENEOUS_PHYSICAL_TENS'
  | 'HETEROGENEOUS_GROUPING'
  | 'INDEPENDENT_CHALLENGE';

export type CanonicalRoutingGroup = 
  | 'Small homogeneous group, physical ten frames'
  | 'Heterogeneous peer discourse, abacus'
  | 'Independent challenge track, whiteboard';

export const EXACT_AI_FALLBACK_TEXT = "הניתוח הפדגוגי המפורט אינו זמין כעת. ההמלצות שלהלן מבוססות על מדדי הביצוע.";

const COLUMN_NAMES_HE = ["אחדות", "עשרות", "מאות", "אלפים"];

/**
 * Generates deterministic, chronological Exercise Narratives for compulsory exercises (Module 23).
 * Constructed from telemetry events without invoking the AI engine.
 */
export function generateExerciseNarrativeFromEvents(telemetryDocs: Record<string, any>[] = []): string[] {
  const narratives: string[] = [];
  const exerciseMap: Record<string, any[]> = {};

  // 1. Order events chronologically by client_timestamp
  const sorted = [...telemetryDocs].sort((a, b) => (a.client_timestamp || 0) - (b.client_timestamp || 0));
  for (const doc of sorted) {
    const exId = doc.exercise_id || "ex_1";
    if (!exerciseMap[exId]) exerciseMap[exId] = [];
    exerciseMap[exId].push(doc);
  }

  let exerciseIdx = 1;
  for (const [exId, events] of Object.entries(exerciseMap)) {
    let regroupCount = 0;
    let regroupCols: number[] = [];
    let dragCount = 0;
    let digitsEntered = 0;
    let undoCount = 0;
    let firstAttemptCorrect = true;

    for (const ev of events) {
      if (ev.event_type === 'BLOCK_DRAG_COMPLETE') dragCount++;
      if (ev.event_type === 'REGROUPING_SUCCESS') {
        regroupCount++;
        if (ev.column_index !== undefined && ev.column_index !== null) {
          regroupCols.push(ev.column_index);
        }
      }
      if (ev.event_type === 'DIGIT_ENTERED') {
        digitsEntered++;
        if (ev.details?.is_correct === false) {
          firstAttemptCorrect = false;
        }
      }
      if (ev.event_type === 'UNDO_EXECUTED') undoCount++;
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

export interface PedagogicalReportPDFResult {
  studentDisplayName: string; // "תלמיד {ID}" (1-12)
  studentId: number;
  score: number; // Strictly from sessionDoc.session_score_percent
  routingGroup: CanonicalRoutingGroup;
  routingLabelHe: string;
  recommendationDetailsHe: string;
  exerciseNarratives: string[];
  pdfHtml: string;
}

/**
 * מחולל דוח פדגוגי מסכם (PDF / Printable HTML) לפי מודול 23 ב-Master PRD v6.5.
 * כלל 1: קורא אך ורק session_score_percent מתוך SessionDocument (אינו מחשב אותו מחדש).
 * כלל 2: ניתוב מתמטי מחמיר:
 *   - ציון < 50%: Small homogeneous group, physical ten frames.
 *   - ציון 50%-75%: Heterogeneous peer discourse, abacus.
 *   - ציון > 75%: Independent challenge track, whiteboard.
 * כלל 3: אנונימיות מוחלטת: "תלמיד {ID}" (1-12) בלבד, ללא שמות או אימיילים.
 */
export function generatePedagogicalReportPDF(
  sessionDoc: SessionDocument,
  telemetryOrNarratives?: Record<string, any>[] | string[]
): PedagogicalReportPDFResult {
  if (sessionDoc.session_score_percent === null || sessionDoc.session_score_percent === undefined) {
    throw new Error('[PedagogicalReportService] session_score_percent is required in SessionDocument');
  }

  // Rule 3: Strict Anonymity - display "תלמיד {ID}" (1-12)
  const match = sessionDoc.session_id.match(/\d+$/);
  const studentNum = match ? parseInt(match[0], 10) : 1;
  const clampedStudentNum = Math.min(12, Math.max(1, studentNum));
  const studentDisplayName = `תלמיד ${clampedStudentNum}`;

  // Rule 1: Read session_score_percent strictly without calculating
  const score = sessionDoc.session_score_percent;

  // Rule 2: Strict routing mapping
  let routingGroup: CanonicalRoutingGroup;
  let routingLabelHe: string;
  let recommendationDetailsHe: string;

  if (score < 50) {
    routingGroup = 'Small homogeneous group, physical ten frames';
    routingLabelHe = 'קבוצה הומוגנית קטנה, מסגרות עשר פיזיות';
    recommendationDetailsHe = 'המלצה לעבודה בקבוצה קטנה הומוגנית עם תיווך צמוד ושימוש במסגרות עשר פיזיות לביסוס המבנה העשרוני.';
  } else if (score <= 75) {
    routingGroup = 'Heterogeneous peer discourse, abacus';
    routingLabelHe = 'שיח עמיתים הטרוגני, חשבונייה';
    recommendationDetailsHe = 'המלצה ללמידה שיתופית ושיח עמיתים הטרוגני בשילוב חשבונייה לחיזוק הגמישות בהמרות וחקר משותף.';
  } else {
    routingGroup = 'Independent challenge track, whiteboard';
    routingLabelHe = 'מסלול אתגר עצמאי, לוח מחיק';
    recommendationDetailsHe = 'המלצה למסלול אתגר וחקר עצמאי תוך שימוש בלוח מחיק ומשימות הרחבה והעמקה.';
  }

  // Resolve dynamic Exercise Narratives
  let exerciseNarratives: string[];
  if (Array.isArray(telemetryOrNarratives) && typeof telemetryOrNarratives[0] === 'string') {
    exerciseNarratives = telemetryOrNarratives as string[];
  } else if (Array.isArray(telemetryOrNarratives)) {
    exerciseNarratives = generateExerciseNarrativeFromEvents(telemetryOrNarratives as Record<string, any>[]);
  } else {
    exerciseNarratives = generateExerciseNarrativeFromEvents([]);
  }

  const exerciseNarrativeSection = `
  <div class="card" style="margin-bottom: 20px;">
    <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">📖 סיפור התרגילים הכרונולוגי (Exercise Narrative)</div>
    ${exerciseNarratives.map(n => `<p style="margin: 0 0 8px 0; color: #334155; font-size: 13px; line-height: 1.6;">${n}</p>`).join('')}
  </div>

  <div class="card" style="margin-bottom: 20px; background: #fffbeb; border-color: #fde68a;">
    <div style="font-size: 14px; font-weight: 800; color: #92400e; margin-bottom: 6px;">🤖 ניתוח פדגוגי מעמיק (AI Insights)</div>
    <p style="margin: 0; color: #78350f; font-size: 13px;">${EXACT_AI_FALLBACK_TEXT}</p>
  </div>`;

  const pdfHtml = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>דוח פדגוגי מסכם - ${studentDisplayName}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; color: #0f172a; background: #ffffff; line-height: 1.6; }
    .header { border-bottom: 3px solid #4f46e5; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .badge { display: inline-block; padding: 6px 16px; border-radius: 9999px; font-weight: 800; font-size: 15px; background: #e0e7ff; color: #3730a3; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 20px; }
    .rec-box { background: #f0fdf4; border: 2px solid #86efac; border-radius: 16px; padding: 20px; margin-bottom: 20px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 style="margin: 0; font-size: 24px; font-weight: 800;">מתמטיקאור &copy; — דוח פדגוגי מסכם</h1>
      <div style="color: #64748b; font-size: 14px;">סיום אבחון מסלול למידה</div>
    </div>
    <div class="badge">${studentDisplayName}</div>
  </div>

  <div class="card">
    <div style="font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase;">ציון סשן אבחוני (Session Score)</div>
    <div style="font-size: 32px; font-weight: 900; color: #0f172a;">${score}%</div>
  </div>

  <div class="rec-box">
    <div style="font-size: 18px; font-weight: 800; color: #166534; margin-bottom: 8px;">🎯 שיבוץ פדגוגי מומלץ: ${routingLabelHe}</div>
    <div style="font-size: 13px; font-weight: 700; color: #15803d; margin-bottom: 6px;">Routing Group: ${routingGroup}</div>
    <p style="margin: 0; color: #14532d; font-size: 15px;">${recommendationDetailsHe}</p>
  </div>

  ${exerciseNarrativeSection}

  <div class="footer">
    מסמך זה הופק אוטומטית | שמירה מוחלטת על אנונימיות ופרטיות (Zero PII Policy)
  </div>
</body>
</html>`;

  // PII Guard
  if (containsPII(pdfHtml)) {
    throw new Error('[PedagogicalReportService] PII detected in generated PDF report!');
  }

  return {
    studentDisplayName,
    studentId: clampedStudentNum,
    score,
    routingGroup,
    routingLabelHe,
    recommendationDetailsHe,
    exerciseNarratives,
    pdfHtml,
  };
}

export interface StudentReportData {
  studentId: string; // Anonymous ID: e.g. "student_1", "1", "student_12"
  displayId: number; // 1-12
  sessionNumber: number;
  finalScore: number; // 0 - 100
  persistenceIndex: number; // 0 - 100
  undoCount: number;
  errorCount: number;
  guessCount: number;
  routeType: 'GREEN' | 'YELLOW_REMEDIATION_PATH';
  groupRecommendation: PedagogicalGroupRecommendation;
  recommendationLabelHebrew: string;
  recommendationDetailsHebrew: string;
  completedMilestones: string[];
  exerciseNarratives?: string[];
  timestamp: number;
}

export class PedagogicalReportService {
  private static instance: PedagogicalReportService;

  private constructor() {}

  public static getInstance(): PedagogicalReportService {
    if (!PedagogicalReportService.instance) {
      PedagogicalReportService.instance = new PedagogicalReportService();
    }
    return PedagogicalReportService.instance;
  }

  /**
   * מחשב את ההמלצה הפדגוגית לשיבוץ על פי ציון מפגש 8 והתקדמות
   */
  public calculateGroupingRecommendation(score: number): {
    recommendation: PedagogicalGroupRecommendation;
    labelHebrew: string;
    detailsHebrew: string;
  } {
    const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));

    if (normalizedScore < 50) {
      return {
        recommendation: 'HOMOGENEOUS_PHYSICAL_TENS',
        labelHebrew: 'קבוצה הומוגנית ותמיכת עשרות פיזיות',
        detailsHebrew: 'המלצה לעבודה בקבוצה קטנה עם תיווך צמוד ושימוש מוחשי בלבני דינס ועשרות שלמות לביסוס המבנה העשרוני.',
      };
    } else if (normalizedScore <= 75) {
      return {
        recommendation: 'HETEROGENEOUS_GROUPING',
        labelHebrew: 'קבוצה הטרוגנית עם עמיתים',
        detailsHebrew: 'המלצה ללמידה שיתופית בקבוצה הטרוגנית המשלבת עמיתים לחיזוק הגמישות בהמרות וחקר משותף.',
      };
    } else {
      return {
        recommendation: 'INDEPENDENT_CHALLENGE',
        labelHebrew: 'למידה עצמאית ומשימות אתגר (רבה)',
        detailsHebrew: 'המלצה למסלול חקר עצמאי ומשימות אתגר והעמקה (מסלול רבה) בחזקות וחישובים מרובי שלבים.',
      };
    }
  }

  /**
   * יצירת מבנה נתונים מאומת ומאובטח לדוח פדגוגי
   */
  public generateReportData(params: {
    studentId: string;
    sessionNumber?: number;
    score: number;
    undoCount?: number;
    errorCount?: number;
    guessCount?: number;
    routeType?: 'GREEN' | 'YELLOW_REMEDIATION_PATH';
    completedMilestones?: string[];
    exerciseNarratives?: string[];
    telemetryEvents?: Record<string, any>[];
  }): StudentReportData {
    const rawId = params.studentId;
    const norm = normalizeStudentId(rawId);
    const numericMatch = norm.match(/\d+/);
    const displayId = numericMatch ? parseInt(numericMatch[0], 10) : 1;
    const clampedDisplayId = Math.min(12, Math.max(1, displayId));

    const score = Math.max(0, Math.min(100, Math.round(params.score)));
    const U = Math.max(0, params.undoCount || 0);
    const E = Math.max(0, params.errorCount || 0);
    const G = Math.max(0, params.guessCount || 0);
    const denom = U + E + G;
    const persistenceIndex = denom === 0 ? 100 : Math.min(100, Math.max(0, Math.round((U / denom) * 100)));

    const { recommendation, labelHebrew, detailsHebrew } = this.calculateGroupingRecommendation(score);

    const narratives = params.exerciseNarratives || generateExerciseNarrativeFromEvents(params.telemetryEvents || []);

    const report: StudentReportData = {
      studentId: `student_${clampedDisplayId}`,
      displayId: clampedDisplayId,
      sessionNumber: params.sessionNumber || 8,
      finalScore: score,
      persistenceIndex,
      undoCount: U,
      errorCount: E,
      guessCount: G,
      routeType: params.routeType || (score >= 50 ? 'GREEN' : 'YELLOW_REMEDIATION_PATH'),
      groupRecommendation: recommendation,
      recommendationLabelHebrew: labelHebrew,
      recommendationDetailsHebrew: detailsHebrew,
      completedMilestones: params.completedMilestones || [
        'זיהוי המבנה העשרוני בתחום ה-10,000',
        'ביצוע המרות כפל בעשרות שלמות',
        'הפעלת בקרה עצמית ושימוש ב-Undo',
      ],
      exerciseNarratives: narratives,
      timestamp: Date.now(),
    };

    // Strict PII Verification
    const serialized = JSON.stringify(report);
    if (containsPII(serialized)) {
      throw new Error('[PedagogicalReportService] PII detected in report generation payload!');
    }

    return report;
  }

  /**
   * יצירת מסמך HTML/PDF מותאם להדפסה ושמירה
   */
  public generatePrintableHtml(report: StudentReportData): string {
    const narratives = report.exerciseNarratives && report.exerciseNarratives.length > 0
      ? report.exerciseNarratives
      : ["לא נרשמו אירועי טלמטריה עבור משימות החובה במפגש זה."];

    return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>דוח פדגוגי מסכם - תלמיד ${report.displayId}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; color: #1e293b; background: #fff; line-height: 1.6; }
    .header { border-bottom: 3px solid #4f46e5; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
    .title { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }
    .subtitle { font-size: 14px; color: #64748b; margin-top: 5px; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 9999px; font-weight: 700; font-size: 14px; background: #e0e7ff; color: #3730a3; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; }
    .card-title { font-size: 13px; font-weight: 700; color: #64748b; margin-bottom: 8px; text-transform: uppercase; }
    .card-value { font-size: 28px; font-weight: 900; color: #0f172a; }
    .rec-box { background: #f0fdf4; border: 2px solid #86efac; border-radius: 16px; padding: 24px; margin-bottom: 30px; }
    .rec-title { font-size: 18px; font-weight: 800; color: #166534; margin-bottom: 10px; }
    .milestones { list-style: none; padding: 0; margin: 0; }
    .milestones li { padding: 10px 0; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 10px; }
    .milestones li:before { content: '✔'; color: #10b981; font-weight: bold; }
    .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">מתמטיקאור &copy; — דוח פדגוגי מסכם</h1>
      <div class="subtitle">סיום מפגש מסכם 8 | מרחב חקר אישי</div>
    </div>
    <div class="badge">תלמיד/ה ${report.displayId} (אנונימי)</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">ציון הישג מסכם</div>
      <div class="card-value">${report.finalScore}%</div>
    </div>
    <div class="card">
      <div class="card-title">מדד התמדה וויסות עצמי (SRL Index)</div>
      <div class="card-value">${report.persistenceIndex}%</div>
    </div>
  </div>

  <div class="rec-box">
    <div class="rec-title">🎯 המלצה פדגוגית לשיבוץ והמשך למידה: ${report.recommendationLabelHebrew}</div>
    <p style="margin: 0; color: #14532d; font-size: 15px;">${report.recommendationDetailsHebrew}</p>
  </div>

  <!-- Exercise Narrative (placed BEFORE AI section) -->
  <div class="card" style="margin-bottom: 30px;">
    <div class="card-title">📖 סיפור התרגילים הכרונולוגי (Exercise Narrative)</div>
    ${narratives.map(n => `<p style="margin: 0 0 8px 0; color: #334155; font-size: 13px; line-height: 1.6;">${n}</p>`).join('')}
  </div>

  <div class="card" style="margin-bottom: 30px;">
    <div class="card-title">אבני דרך קוגניטיביות שהושגו (VRA Milestones)</div>
    <ul class="milestones">
      ${report.completedMilestones.map(m => `<li>${m}</li>`).join('')}
    </ul>
  </div>

  <div class="footer">
    מסמך זה הופק אוטומטית על פי עקרונות Master PRD v5.0 | שמירה מוחלטת על פרטיות (Zero PII Policy)
  </div>
</body>
</html>`;
  }
}

export const pedagogicalReportService = PedagogicalReportService.getInstance();
