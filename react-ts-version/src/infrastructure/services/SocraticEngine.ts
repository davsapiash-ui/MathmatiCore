import { ref, push, set, get, remove, serverTimestamp, update } from "firebase/database";
import { database, functions, authReady } from "@/infrastructure/firebase";
import { httpsCallable } from "firebase/functions";
import type { SessionTask } from "@/data/sessionTasks";
import type { QMatrixResults } from "@/core/QMatrix";
import { AuditLogger } from "@/infrastructure/services/AuditLogger";

async function ready(): Promise<void> {
  await authReady;
}

export interface SocraticHintResponse {
  questionHe: string;
  choices: { id: string; textHe: string }[];
}

export interface PendingAIApproval {
  id: string;
  studentId: string;
  studentName: string;
  timestamp: number;
  tasks: SessionTask[];
  macroBlueprintHe: string;
  microBlueprintHe: string;
  targetSession: string;
}

export class SocraticEngine {
  static async getSocraticHint(
    _currentTask: any,
    targetNode: string,
    _counts: { units: number; tens: number; hundreds: number; thousands: number },
    _traceData?: { hesitation_events: number; undo_clicks: number }
  ): Promise<SocraticHintResponse | null> {
    await ready();
    // Zero-Generation Policy: Fetch from hardcoded Q-Matrix based on targetNode
    const Q_MATRIX_HINTS: Record<string, SocraticHintResponse> = {
      "q_matrix_general": {
        questionHe: "שמנו לב שנסית כמה פעמים. מה הצעד הבא שתרצה לבצע?",
        choices: [
          { id: "opt_1", textHe: "לפרוט עשרת אחת ל-10 יחידות" },
          { id: "opt_2", textHe: "לקבץ 10 יחידות לעשרת אחת" },
          { id: "opt_3", textHe: "לבדוק שוב את החישוב בבית המספרים" }
        ]
      },
      "subtraction_regrouping": {
        questionHe: "חסרות לנו יחידות בלוח כדי לחסר. מה אפשר לעשות?",
        choices: [
          { id: "opt_1", textHe: "לקחת קוביית עשרת ולפרוט אותה ל-10 יחידות" },
          { id: "opt_2", textHe: "להוסיף קוביות יחידה מהמחסן" },
          { id: "opt_3", textHe: "לחסר מלמטה למעלה" }
        ]
      },
      "addition_regrouping": {
        questionHe: "יש לנו יותר מ-9 קוביות באותו טור. מה עושים?",
        choices: [
          { id: "opt_1", textHe: "מקריפים (אורזים) 10 קוביות לבלוק גדול יותר" },
          { id: "opt_2", textHe: "מוחקים את הקוביות המיותרות" },
          { id: "opt_3", textHe: "מעבירים אותן סתם לטור אחר" }
        ]
      }
    };

    return Q_MATRIX_HINTS[targetNode] || Q_MATRIX_HINTS["q_matrix_general"];
  }

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

    // Call the Gemini Cloud Function instead of local deterministic logic
    const generateSocraticMapping = httpsCallable(functions, "generateSocraticMapping");
    
    let aiResponse;
    try {
      const result = await generateSocraticMapping({
        studentId,
        studentName,
        teacherId,
        qMatrix,
        conceptMastery,
        traceData
      });
      aiResponse = result.data as any;
    } catch (error) {
      console.error("Failed to generate AI mapping, falling back to basic setup", error);
      // Fallback in case Cloud Function fails
      aiResponse = {
        macroBlueprintHe: "המערכת לא הצליחה להתחבר למנוע ה-AI. נדרשת התערבות ידנית של המורה.",
        microBlueprintHe: "אנא תכנן את שיעור 3 בעצמך.",
        isYellowPath: true,
        tasks: [{
          id: "fallback_task",
          title: "משימה ידנית מומלצת",
          type: "concept_builder",
          rationale: "מערכת ה-AI לא היתה זמינה ולכן נדרשת בחירת משימה על ידי המורה."
        }]
      };
    }

    const { macroBlueprintHe, microBlueprintHe, isYellowPath, tasks } = aiResponse;
    const targetSession = "3"; // By default, mapping happens before session 3

    const pendingRef = ref(database, `ai_pending_approvals/${teacherId}`);
    const newApprovalRef = push(pendingRef);
    await set(newApprovalRef, {
      studentId,
      studentName,
      timestamp: serverTimestamp(),
      tasks: tasks || [],
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
      tasks: tasks || [],
      qMatrixResults: qMatrix,
      conceptMastery,
      traceData: traceData || { hesitation_events: 0, undo_clicks: 0 },
      effort: effort !== undefined ? effort : null,
      strategy: strategy !== undefined ? strategy : null
    });

    // Update root student node
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
      `Student completed meeting 2 diagnostic mapping via Gemini AI. Route: ${isYellowPath ? 'YELLOW' : 'GREEN'}.`
    );
  }

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

  static async approveTasks(teacherId: string, approvalId: string, studentId: string, tasks: SessionTask[]): Promise<void> {
    await ready();
    const approvedRef = ref(database, `approved_tasks/${studentId}`);
    await set(approvedRef, tasks);
    const pendingRef = ref(database, `ai_pending_approvals/${teacherId}/${approvalId}`);
    await remove(pendingRef);
    const statusRef = ref(database, `users/students/${studentId}/routeStatus`);
    await set(statusRef, "APPROVED");
  }

  static async updatePendingTasks(teacherId: string, approvalId: string, updatedTasks: SessionTask[]): Promise<void> {
    await ready();
    const pendingRef = ref(database, `ai_pending_approvals/${teacherId}/${approvalId}/tasks`);
    await set(pendingRef, updatedTasks);
  }
  
  static async rejectTasks(teacherId: string, approvalId: string): Promise<void> {
    await ready();
    const pendingRef = ref(database, `ai_pending_approvals/${teacherId}/${approvalId}`);
    await remove(pendingRef);
  }

  static async getApprovedTasks(studentId: string): Promise<SessionTask[] | null> {
    await ready();
    const approvedRef = ref(database, `approved_tasks/${studentId}`);
    const snapshot = await get(approvedRef);
    if (!snapshot.exists()) return null;
    return snapshot.val() as SessionTask[];
  }
}

