import { ref, push, set, get, remove, serverTimestamp } from "firebase/database";
import { database, authReady } from "@/infrastructure/firebase";
import type { SessionTask } from "@/data/sessionTasks";
import type { QMatrixResults } from "@/core/QMatrix";

/**
 * All engine I/O waits for an authenticated session first — the locked rules
 * reject anything sent before sign-in completes (a startup race that silently
 * dropped writes and made reads return permission-denied).
 */
async function ready(): Promise<void> {
  await authReady;
}

export interface PendingAIApproval {
  id: string; // The generated approval ID
  studentId: string;
  studentName: string;
  timestamp: number;
  tasks: SessionTask[];
  clinicalDiagnosisHe: string; // Detailed pedagogical analysis
  actionPlanHe: string; // Recommended action for the teacher
}

/**
 * The Socratic Engine generates personalized tasks based on the student's Q-Matrix diagnostic results.
 * It is a deterministic rule-based engine that acts as a placeholder for a future LLM integration.
 */
export class SocraticEngine {
  
  /**
   * Generates tasks based on QMatrix errors and queues them for teacher approval.
   */
  static async generateAndQueueTasks(studentId: string, studentName: string, teacherId: string, qMatrix: QMatrixResults): Promise<void> {
    await ready();
    const tasks: SessionTask[] = [];
    
    const diagnosisParts: string[] = [];
    const actionParts: string[] = [];
    let isYellowPath = false;

    if (qMatrix.task1_zero_placeholder === 'zero_placeholder_hundreds_error') {
      diagnosisParts.push("ניכר קושי נקודתי בהבנת המבנה העשרוני והאפס כשומר מקום. נראה כי התלמיד מבין את הרעיון הכללי אך זקוק לחידוד במעברים גדולים.");
      actionParts.push("חיזוק הבנת המבנה העשרוני של המספרים עד 1000.");
      isYellowPath = true;
    } else if (qMatrix.task1_zero_placeholder === 'zero_placeholder_global_error') {
      diagnosisParts.push("ייתכן פער משמעותי בהבנת תפקיד האפס כ'שומר מקום' במבנה העשרוני, מה שעשוי להעיד על חסר בהפנמת הערך המקומי בסיס 10.");
      actionParts.push("עבודה על המבנה העשרוני והבנת האפס באופן הדרגתי.");
      isYellowPath = true;
    }

    if (qMatrix.task4_basic_addition_fluency === 'procedural_error') {
      diagnosisParts.push("התלמיד שלט בעובדות היסוד במשימת העזר, ולכן השגיאה נובעת מקושי בהבנת המהות של פעולות חיבור במאונך בתחום ה-100 וה-1000.");
      actionParts.push("תרגול מובנה של חיבור במאונך, ללא חשש לשליטה בסיסית.");
      isYellowPath = true;
    } else if (qMatrix.task4_basic_addition_fluency === 'basic_facts_deficit') {
      diagnosisParts.push("נראה כי קיימת חולשה משמעותית בשליטה בעובדות יסוד בסיסיות של חיבור וחיסור, שהיא בסיס הכרחי לפני פעולות במאונך.");
      actionParts.push("יש לעצור ולבסס עובדות יסוד של חיבור במאמץ קוגניטיבי נמוך לפני מעבר לחישובים מורכבים במאונך.");
      isYellowPath = true;
    }

    if (qMatrix.task3_flexible_regrouping === 'canonical_fixation') {
      diagnosisParts.push("התלמיד נוטה ל'קיבעון קנוני', ומתקשה למצוא חלופות לייצוג המספר, על אף שהוא מכיר את המערכת. ייתכן קושי בגמישות מחשבתית.");
      actionParts.push("משחקי פריטה והמרה שמעודדים חשיבה פתוחה ומרובת תשובות.");
      isYellowPath = true;
    }

    if (qMatrix.task2_estimation_error_margin === 'estimation_range_error') {
      diagnosisParts.push("התלמיד מתקשה להעריך גדלים בתוך טווח סביר — אומדנים חורגים מהמציאות. ייתכן קושי בתחושת המספר (number sense) ובאינטואיציה לסדרי גודל.");
      actionParts.push("פעילויות אמידה עם חפצים מוחשיים ומחויות גוף — כמות צעדים, גובה, אורך — לפני אמידה מספרית.");
      isYellowPath = true;
    } else if (qMatrix.task2_estimation_error_margin === 'estimation_precision_fixation') {
      diagnosisParts.push("התלמיד מנסה לדייק יתר על המידה באמידה ואינו מסתפק בטווח. עשוי להעיד על חשיבה פרפקציוניסטית שמקשה על גמישות מחשבתית.");
      actionParts.push("תרגול מכוון על 'טווח סביר' ולא תשובה מדויקת — להדגיש שכמה תשובות יכולות להיות נכונות.");
      isYellowPath = true;
    }

    if (qMatrix.task5_small_change === 'small_change_confusion') {
      diagnosisParts.push("התלמיד מתבלבל בין פעולות כאשר השינוי קטן (כמו +1 או -1) ועלול לפעול בכיוון ההפוך. דפוס זה עשוי להעיד על חוסר ביסוס המושג 'עוד אחד / פחות אחד' ברמה העשרונית.");
      actionParts.push("תרגול על ציר מספרים עם קפיצות של 1: מה לפני? מה אחרי? תוך שימוש בדימויי גוף ותנועה.");
      isYellowPath = true;
    } else if (qMatrix.task5_small_change === 'directional_error') {
      diagnosisParts.push("התלמיד מבצע פעולה בכיוון שגוי בעקביות (חיבור במקום חיסור ולהיפך). ייתכן בלבול בסימנים או בהבנת מה הפעולה דורשת.");
      actionParts.push("הדגשת כוון הפעולה באמצעות חיצים ויזואליים על ציר המספרים — שמאלה = חיסור, ימינה = חיבור.");
      isYellowPath = true;
    }

    if (qMatrix.task6_subtraction_regrouping === 'regrouping_anxiety') {
      diagnosisParts.push("התלמיד הפגין שליטה בחיסור בסיסי, אך נרתע או קפא כאשר נדרש לפרוט עשרת. דפוס זה עשוי להעיד על 'חרדת המרה'.");
      actionParts.push("יש לעבוד על פריטה מחוץ לתרגיל חיסור, באופן מוחשי, כדי להוריד את מפלס החרדה.");
      isYellowPath = true;
    } else if (qMatrix.task6_subtraction_regrouping === 'subtraction_operation_deficit') {
      diagnosisParts.push("התלמיד התקשה גם בתרגיל החיסור ללא הפריטה. דבר זה מחייב תשומת לב, שכן נראה שמשמעות פעולת החיסור עצמה טרם בוססה.");
      actionParts.push("חזרה לפעולת החיסור ברמה התפיסתית (לקחת, להפריד) באמצעות מניפולטיבים.");
      isYellowPath = true;
    }

    if (qMatrix.task7_missing_subtrahend === 'algebraic_concept_deficit') {
      diagnosisParts.push("חולשה מהותית בתפיסה האלגברית ובהבנת משוואות כמאזניים (חסר הבנה של 'מציאת המחסר').");
      actionParts.push("שימוש במאזניים מוחשיים ותרגול מציאת נעלם פשוט בתחום ה-10.");
      isYellowPath = true;
    } else if (qMatrix.task7_missing_subtrahend === 'computational_fluency_deficit') {
      diagnosisParts.push("התלמיד מבין את קונספט המשוואה במעוף הדבורה, אך השגיאה בתרגיל הראשוני נובעת מקשיי פריטה או שטף חישובי.");
      actionParts.push("תרגול משוואות במספרים שאינם דורשים פריטה, בשילוב תרגול חיסור עם פריטה בנפרד.");
      isYellowPath = true;
    }

    if (qMatrix.task8_missing_addend === 'missing_addend_deficit') {
      diagnosisParts.push("התלמיד מתקשה במציאת נעלם בחיבור (□ + 5 = 12). ייתכן שהוא טרם הפנים את הרעיון שחיבור וחיסור הם פעולות הפוכות המשלימות זו את זו.");
      actionParts.push("עבודה על אסטרטגיות 'ספור קדימה' ו'ספור אחורה' לפתרון חיבורים עם נעלם, תוך שימוש בציר המספרים.");
      isYellowPath = true;
    } else if (qMatrix.task8_missing_addend === 'inverse_operation_gap') {
      diagnosisParts.push("התלמיד אינו מזהה שניתן להשתמש בחיסור כדי למצוא נעלם בחיבור — חסר קישור בין הפעולות.");
      actionParts.push("הדגמת 'משפחות עובדות' (fact families): 3+5=8, 5+3=8, 8-3=5, 8-5=3 — לבניית הקישור הפנימי.");
      isYellowPath = true;
    }

    let clinicalDiagnosisHe = "טרם נאספו מספיק אינדיקציות קליניות.";
    let actionPlanHe = "מומלץ להמשיך בתהליך הלימודים כסדרו.";

    if (isYellowPath && diagnosisParts.length > 0) {
      clinicalDiagnosisHe = "על בסיס המבדק, עולים הדפוסים הבאים: " + diagnosisParts.join(" ");
      actionPlanHe = "תוכנית פעולה מוצעת: " + actionParts.join(" | ");
      tasks.push(
        { id: 'gen_t1', type: 'vertical_addition', titleHe: 'תרגול תומך 1', instructionHe: 'חיבור במאונך עם עזרים.', numberA: 25, numberB: 17, correctAnswer: 42 },
        { id: 'gen_t2', type: 'vertical_addition', titleHe: 'תרגול תומך 2', instructionHe: 'נסו לפתור במאונך.', numberA: 36, numberB: 28, correctAnswer: 64 }
      );
    } else {
      clinicalDiagnosisHe = "התלמיד הפגין ביצועים תקינים וללא שגיאות קריטיות לאורך משימות הליבה. לא ניכרו כשלים בולטים בעובדות יסוד או בגמישות המחשבתית.";
      actionPlanHe = "מעבר ישיר למסלול 'הירוק' - התקדמות לחקר מתקדם ולאתגרים.";
      tasks.push(
        { id: 'gen_c1', type: 'vertical_addition', titleHe: 'אתגר 1', instructionHe: 'נסו לפתור תרגיל מאתגר יותר:', numberA: 125, numberB: 134, correctAnswer: 259 },
        { id: 'gen_c2', type: 'vertical_addition', titleHe: 'אתגר 2', instructionHe: 'נסו לפתור תרגיל מאתגר יותר:', numberA: 245, numberB: 136, correctAnswer: 381 }
      );
    }

    const pendingRef = ref(database, `ai_pending_approvals/${teacherId}`);
    const newApprovalRef = push(pendingRef);
    await set(newApprovalRef, {
      studentId,
      studentName,
      timestamp: serverTimestamp(),
      tasks,
      clinicalDiagnosisHe,
      actionPlanHe
    });
  }

  /**
   * Fetches pending tasks for a teacher.
   */
  static async getPendingApprovals(teacherId: string): Promise<PendingAIApproval[]> {
    await ready();
    const pendingRef = ref(database, `ai_pending_approvals/${teacherId}`);
    const snapshot = await get(pendingRef);
    if (!snapshot.exists()) return [];

    const data = snapshot.val();
    return Object.keys(data).map(key => ({
      id: key,
      ...data[key]
    }));
  }

  /**
   * Approves a pending task sequence and assigns it to the student.
   */
  static async approveTasks(teacherId: string, approvalId: string, studentId: string, tasks: SessionTask[]): Promise<void> {
    await ready();
    // 1. Move to approved_tasks
    const approvedRef = ref(database, `approved_tasks/${studentId}`);
    await set(approvedRef, tasks);

    // 2. Remove from pending queue
    const pendingRef = ref(database, `ai_pending_approvals/${teacherId}/${approvalId}`);
    await remove(pendingRef);

    // 3. Update student routeStatus to APPROVED
    const statusRef = ref(database, `users/students/${studentId}/routeStatus`);
    await set(statusRef, "APPROVED");
  }
  
  /**
   * Deletes a pending approval (rejection).
   */
  static async rejectTasks(teacherId: string, approvalId: string): Promise<void> {
    await ready();
    const pendingRef = ref(database, `ai_pending_approvals/${teacherId}/${approvalId}`);
    await remove(pendingRef);
  }

  /**
   * Fetches approved tasks for a student. Returns null if none found.
   */
  static async getApprovedTasks(studentId: string): Promise<SessionTask[] | null> {
    await ready();
    const approvedRef = ref(database, `approved_tasks/${studentId}`);
    const snapshot = await get(approvedRef);
    if (!snapshot.exists()) return null;
    return snapshot.val() as SessionTask[];
  }
}
