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

export type PedagogicalGroupRecommendation = 
  | 'HOMOGENEOUS_PHYSICAL_TENS'
  | 'HETEROGENEOUS_GROUPING'
  | 'INDEPENDENT_CHALLENGE';

export interface StudentReportData {
  studentId: string; // Anonymous ID: e.g. "student_1", "1", "student_12"
  displayId: number; // 1-12
  sessionNumber: number;
  finalScore: number; // 0 - 100
  persistenceIndex: number; // 0 - 100
  undoCount: number;
  errorCount: number;
  guessCount: number;
  routeType: 'GREEN' | 'YELLOW_GAP_REDUCTION';
  groupRecommendation: PedagogicalGroupRecommendation;
  recommendationLabelHebrew: string;
  recommendationDetailsHebrew: string;
  completedMilestones: string[];
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
    routeType?: 'GREEN' | 'YELLOW_GAP_REDUCTION';
    completedMilestones?: string[];
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

    const report: StudentReportData = {
      studentId: `student_${clampedDisplayId}`,
      displayId: clampedDisplayId,
      sessionNumber: params.sessionNumber || 8,
      finalScore: score,
      persistenceIndex,
      undoCount: U,
      errorCount: E,
      guessCount: G,
      routeType: params.routeType || (score >= 70 ? 'GREEN' : 'YELLOW_GAP_REDUCTION'),
      groupRecommendation: recommendation,
      recommendationLabelHebrew: labelHebrew,
      recommendationDetailsHebrew: detailsHebrew,
      completedMilestones: params.completedMilestones || [
        'זיהוי המבנה העשרוני בתחום ה-10,000',
        'ביצוע המרות כפל בעשרות שלמות',
        'הפעלת בקרה עצמית ושימוש ב-Undo',
      ],
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
