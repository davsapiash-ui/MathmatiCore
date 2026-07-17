import { ref, push, set, get, remove, serverTimestamp, update } from "firebase/database";
import { database, functions, authReady } from "@/infrastructure/firebase";
import { httpsCallable } from "firebase/functions";
import type { SessionTask } from "@/data/sessionTasks";
import type { QMatrixResults } from "@/core/QMatrix";
import { AuditLogger } from "@/infrastructure/services/AuditLogger";

async function ready(): Promise<void> {
  await authReady;
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
        tasks: []
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

