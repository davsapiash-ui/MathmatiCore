import { ref, push, set, get, remove, serverTimestamp, update } from "firebase/database";
import { database, authReady } from "@/infrastructure/firebase";
import type { SessionTask } from "@/data/sessionTasks";
import type { QMatrixResults } from "@/core/QMatrix";
import { AuditLogger } from "@/infrastructure/services/AuditLogger";

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
  macroBlueprintHe: string; // Bird's eye view for sessions 3-7
  microBlueprintHe: string; // Ant's work for the immediate next session
  targetSession: string; // The session this gate unlocks (e.g., '3', '4')
}

/**
 * The Socratic Engine generates personalized tasks based on the student's Q-Matrix diagnostic results.
 * It is a deterministic rule-based engine that acts as a placeholder for a future LLM integration.
 */
export class SocraticEngine {
  
  /**
   * Generates tasks based on QMatrix errors and queues them for teacher approval.
   */
  static async generateAndQueueTasks(
    studentId: string,
    studentName: string,
    teacherId: string,
    qMatrix: QMatrixResults,
    conceptMastery: Record<string, number>,
    traceData?: { hesitation_events: number; undo_clicks: number },
    effort?: number | null,
    strategy?: string | null
  ): Promise<void> {
    await ready();
    const tasks: SessionTask[] = [];
    
    const diagnosisParts: string[] = [];
    const actionParts: string[] = [];
    let isYellowPath = false;

    if (conceptMastery.decimal_structure < 0.8) {
      diagnosisParts.push("ניכר קושי בהבנת המבנה העשרוני והאפס כשומר מקום.");
      actionParts.push("חיזוק המבנה העשרוני של המספרים עד 1000.");
      isYellowPath = true;
    }

    if (conceptMastery.number_magnitude < 0.8) {
      diagnosisParts.push("התלמיד מתקשה להעריך גדלים בתוך טווח סביר, ייתכן קושי בתחושת גודל (number sense).");
      actionParts.push("פעילויות אמידה עם ייצוגים על ישר המספרים.");
      isYellowPath = true;
    }

    if (conceptMastery.regrouping_fluency < 0.8) {
      diagnosisParts.push("התלמיד מתקשה מהותית בפעולת ההמרה והפריטה.");
      actionParts.push("תרגול בסיסי של המרות (10 יחידות לעשרת אחת ולהפך) עם בדידים מוחשיים.");
      isYellowPath = true;
    }

    if (conceptMastery.procedural_fluency < 0.8) {
      diagnosisParts.push("חולשה בשליטה בעובדות היסוד או בפעולות חיבור וחיסור במאונך.");
      actionParts.push("ביסוס עובדות יסוד לפני מעבר לחישובים מורכבים במאונך.");
      isYellowPath = true;
    }

    if (conceptMastery.relational_thinking < 0.8) {
      diagnosisParts.push("קושי בהבנת הקשר בין פעולות שונות (חיבור לחיסור).");
      actionParts.push("עבודה על קישור הפעולות באמצעות מודלים של שלמים וחלקים.");
      isYellowPath = true;
    }

    if (conceptMastery.algebraic_reasoning < 0.8) {
      diagnosisParts.push("חולשה בתפיסה האלגברית ובהבנת מציאת נעלם.");
      actionParts.push("שימוש במאזניים ותרגול משוואות כאיזון.");
      isYellowPath = true;
    }

    // Trace Data Analysis
    if (traceData && (traceData.hesitation_events >= 3 || traceData.undo_clicks >= 5)) {
      diagnosisParts.push("רדאר המערכת מזהה רמה גבוהה של היסוסים או מחיקות, עדות אפשרית לחוסר ביטחון, עומס קוגניטיבי או 'חרדת מתמטיקה'.");
      actionParts.push("הפעלת פיגומים ויזואליים (UDL) לשלב הבא באופן מוגבר כדי להפחית חרדה ולספק משענת.");
      isYellowPath = true;
    }

    let macroBlueprintHe = "תחזית למפגשים 3-7: טרם נאספו מספיק אינדיקציות קליניות ברורות.";
    let microBlueprintHe = "עבודת נמלה לשיעור הקרוב: מומלץ להמשיך בתהליך הלימודים כסדרו.";
    const targetSession = "3"; // By default, mapping happens before session 3

    if (isYellowPath && diagnosisParts.length > 0) {
      macroBlueprintHe = "מאקרו (מעוף הציפור למפגשים 3-7): על בסיס המבדק, התלמיד יצטרך פיגומים בנושאים הבאים - " + diagnosisParts.join(" ");
      microBlueprintHe = "מיקרו (ה-Blueprint לשיעור הקרוב): " + actionParts.join(" | ");

      // Generate supportive tasks for Stage 3 based on specific weaknesses
      if (conceptMastery.number_magnitude < 0.8) {
        tasks.push({
          id: 'gen_t_est',
          type: 'number_line',
          titleHe: 'תרגול תומך באומדן',
          instructionHe: 'מקמו את המספר 5,500 על הישר.',
          numberA: 5500,
          range: [0, 10000],
          correctAnswer: 5500
        });
      }
      if (conceptMastery.relational_thinking < 0.8) {
        tasks.push({
          id: 'gen_t_sc',
          type: 'small_change',
          titleHe: 'תרגול חשיבה יחסית',
          instructionHe: 'אם 4,500 + 1,000 = 5,500, כמה הם 4,500 + 999?',
          givenHe: '4,500 + 1,000 = 5,500',
          questionHe: 'כמה הם 4,500 + 999?',
          choices: [
            { id: 'A', textHe: '5,499 — קטן ב-1' },
            { id: 'B', textHe: '5,501 — גדול ב-1' }
          ],
          correctAnswer: 'A'
        });
      }
      if (conceptMastery.algebraic_reasoning < 0.8) {
        tasks.push({
          id: 'gen_t_ma',
          type: 'missing_element',
          titleHe: 'תרגול למציאת נעלם',
          instructionHe: 'השלימו את המספר החסר במשוואה: □ + 800 = 1,000',
          numberA: 800,
          correctAnswer: 200,
          numberB: 1000,
          isSubtraction: false
        });
      }

      // If no specific tasks were added from the above, add general support
      if (tasks.length === 0) {
        tasks.push(
          { id: 'gen_t1', type: 'vertical_addition', titleHe: 'תרגול תומך 1', instructionHe: 'חיבור במאונך בלוח המעבדה.', numberA: 2500, numberB: 1700, correctAnswer: 4200 },
          { id: 'gen_t2', type: 'vertical_addition', titleHe: 'תרגול תומך 2', instructionHe: 'נסו לפתור במאונך.', numberA: 3600, numberB: 2800, correctAnswer: 6400 }
        );
      }
      
      // If trace data showed anxiety, force scaffolding on generated tasks
      if (traceData && (traceData.hesitation_events >= 3 || traceData.undo_clicks >= 5)) {
        tasks.forEach(t => { t.scaffoldLevel = 2; });
      }

    } else {
      macroBlueprintHe = "מאקרו (מעוף הציפור למפגשים 3-7): התלמיד הפגין שליטה מלאה (מעל 80%) בכל המיומנויות הקוגניטיביות. צפויה התקדמות מהירה במסלול הירוק.";
      microBlueprintHe = "מיקרו (ה-Blueprint לשיעור הקרוב): מעבר ישיר לחקר מתקדם ואתגרים (ללא פיגומים).";
      tasks.push(
        { id: 'gen_c1', type: 'vertical_addition', titleHe: 'אתגר 1', instructionHe: 'נסו לפתור תרגיל מאתגר יותר:', numberA: 4500, numberB: 3700, correctAnswer: 8200 },
        { id: 'gen_c2', type: 'vertical_addition', titleHe: 'אתגר 2', instructionHe: 'נסו לפתור תרגיל מאתגר יותר:', numberA: 6250, numberB: 1850, correctAnswer: 8100 }
      );
    }

    const pendingRef = ref(database, `ai_pending_approvals/${teacherId}`);
    const newApprovalRef = push(pendingRef);
    await set(newApprovalRef, {
      studentId,
      studentName,
      timestamp: serverTimestamp(),
      tasks,
      macroBlueprintHe,
      microBlueprintHe,
      targetSession
    });

    const reportRef = ref(database, `users/students/${studentId}/diagnosticReport`);
    await set(reportRef, {
      studentId,
      studentName,
      timestamp: Date.now(),
      macroBlueprintHe,
      microBlueprintHe,
      targetSession,
      tasks,
      qMatrixResults: qMatrix,
      conceptMastery,
      traceData: traceData || { hesitation_events: 0, undo_clicks: 0 },
      effort: effort !== undefined ? effort : null,
      strategy: strategy !== undefined ? strategy : null
    });

    // Also update the root student node to match the expected schema for the clustering dashboard
    await update(ref(database, `users/students/${studentId}`), {
      qMatrixResults: qMatrix,
      conceptMastery,
      traceData: traceData || { hesitation_events: 0, undo_clicks: 0 },
      routeStatus: 'PENDING',
      completedMeeting2: true
    });

    await AuditLogger.log(
      "COMPLETED_MAPPING_PHASE", 
      studentId, 
      `Student completed meeting 2 diagnostic mapping phase. Route: ${isYellowPath ? 'YELLOW' : 'GREEN'}.`
    );
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
