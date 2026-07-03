import { ref, push, set, get, remove, serverTimestamp } from "firebase/database";
import { database } from "@/infrastructure/firebase";
import type { SessionTask } from "@/data/sessionTasks";
import type { QMatrixResults } from "@/core/QMatrix";

export interface PendingAIApproval {
  id: string; // The generated approval ID
  studentId: string;
  studentName: string;
  timestamp: number;
  tasks: SessionTask[];
  teacherRationaleHe: string; // Explanation for the teacher
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
    const tasks: SessionTask[] = [];
    let rationale = "על בסיס האבחון, התלמיד הראה שליטה טובה ברוב התחומים.";

    // Logic based on Q-Matrix
    if (qMatrix.task4_basic_addition_fluency === false) {
      rationale = "התלמיד מתקשה בעובדות יסוד של חיבור. נמליץ על סדרת תרגילי חיבור פשוטים בטווח ה-20 לביסוס העובדות.";
      tasks.push(
        { id: 'gen_t3', type: 'addition_simple', titleHe: 'חיזוק עובדות חיבור 1', instructionHe: 'פתרו את תרגיל החיבור הבא:', numberA: 7, numberB: 5, correctAnswer: 12 },
        { id: 'gen_t4', type: 'addition_simple', titleHe: 'חיזוק עובדות חיבור 2', instructionHe: 'פתרו את תרגיל החיבור הבא:', numberA: 8, numberB: 6, correctAnswer: 14 },
        { id: 'gen_t5', type: 'addition_simple', titleHe: 'חיזוק עובדות חיבור 3', instructionHe: 'פתרו את תרגיל החיבור הבא:', numberA: 9, numberB: 4, correctAnswer: 13 },
        { id: 'gen_t6', type: 'vertical_addition', titleHe: 'חיבור במאונך 1', instructionHe: 'חברו את המספרים במאונך:', numberA: 15, numberB: 7, correctAnswer: 22 },
        { id: 'gen_t7', type: 'vertical_addition', titleHe: 'חיבור במאונך 2', instructionHe: 'חברו את המספרים במאונך:', numberA: 18, numberB: 9, correctAnswer: 27 }
      );
    } else if (qMatrix.task3_flexible_regrouping === false) {
      rationale = "התלמיד מראה קושי בהמרה (קיבוץ ופריטה). המשימות מתמקדות בחיבור במאונך שדורש המרה קלאסית של עשרות.";
      tasks.push(
        { id: 'gen_t3', type: 'vertical_addition', titleHe: 'תרגול המרה 1', instructionHe: 'פתרו את התרגיל הבא - שימו לב להמרה.', numberA: 25, numberB: 17, correctAnswer: 42 },
        { id: 'gen_t4', type: 'vertical_addition', titleHe: 'תרגול המרה 2', instructionHe: 'פתרו את התרגיל הבא - שימו לב להמרה.', numberA: 36, numberB: 28, correctAnswer: 64 },
        { id: 'gen_t5', type: 'vertical_addition', titleHe: 'תרגול המרה 3', instructionHe: 'פתרו את התרגיל הבא - שימו לב להמרה.', numberA: 47, numberB: 15, correctAnswer: 62 },
        { id: 'gen_t6', type: 'vertical_addition', titleHe: 'תרגול המרה מתקדם', instructionHe: 'פתרו את התרגיל הבא - שימו לב להמרה.', numberA: 59, numberB: 33, correctAnswer: 92 },
        { id: 'gen_t7', type: 'vertical_addition', titleHe: 'תרגול מסכם', instructionHe: 'פתרו את התרגיל המסכם:', numberA: 68, numberB: 24, correctAnswer: 92 }
      );
    } else {
      // Default challenge tasks
      rationale = "התלמיד שולט היטב בחומר. מומלץ לאתגר אותו עם תרגילי חיבור תלת-ספרתיים קלים.";
      tasks.push(
        { id: 'gen_t3', type: 'vertical_addition', titleHe: 'אתגר 1', instructionHe: 'נסו לפתור תרגיל מאתגר יותר:', numberA: 125, numberB: 134, correctAnswer: 259 },
        { id: 'gen_t4', type: 'vertical_addition', titleHe: 'אתגר 2', instructionHe: 'נסו לפתור תרגיל מאתגר יותר:', numberA: 245, numberB: 136, correctAnswer: 381 },
        { id: 'gen_t5', type: 'vertical_addition', titleHe: 'אתגר 3', instructionHe: 'נסו לפתור תרגיל מאתגר יותר:', numberA: 158, numberB: 23, correctAnswer: 181 },
        { id: 'gen_t6', type: 'vertical_addition', titleHe: 'אתגר 4', instructionHe: 'נסו לפתור תרגיל מאתגר יותר:', numberA: 312, numberB: 189, correctAnswer: 501 },
        { id: 'gen_t7', type: 'vertical_addition', titleHe: 'אתגר סופי', instructionHe: 'כל הכבוד! נסו לפתור תרגיל זה:', numberA: 450, numberB: 260, correctAnswer: 710 }
      );
    }

    const pendingRef = ref(database, `ai_pending_approvals/${teacherId}`);
    const newApprovalRef = push(pendingRef);
    await set(newApprovalRef, {
      studentId,
      studentName,
      timestamp: serverTimestamp(),
      tasks,
      teacherRationaleHe: rationale
    });
  }

  /**
   * Fetches pending tasks for a teacher.
   */
  static async getPendingApprovals(teacherId: string): Promise<PendingAIApproval[]> {
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
    // 1. Move to approved_tasks
    const approvedRef = ref(database, `approved_tasks/${studentId}`);
    await set(approvedRef, tasks);

    // 2. Remove from pending queue
    const pendingRef = ref(database, `ai_pending_approvals/${teacherId}/${approvalId}`);
    await remove(pendingRef);
  }
  
  /**
   * Deletes a pending approval (rejection).
   */
  static async rejectTasks(teacherId: string, approvalId: string): Promise<void> {
    const pendingRef = ref(database, `ai_pending_approvals/${teacherId}/${approvalId}`);
    await remove(pendingRef);
  }

  /**
   * Fetches approved tasks for a student. Returns null if none found.
   */
  static async getApprovedTasks(studentId: string): Promise<SessionTask[] | null> {
    const approvedRef = ref(database, `approved_tasks/${studentId}`);
    const snapshot = await get(approvedRef);
    if (!snapshot.exists()) return null;
    return snapshot.val() as SessionTask[];
  }
}
