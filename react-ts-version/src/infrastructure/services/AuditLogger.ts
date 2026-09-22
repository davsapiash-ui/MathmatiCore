import { ref, push, serverTimestamp } from "firebase/database";
import { database, authReady } from "@/infrastructure/firebase";
import { sanitizePII } from "@/core/security/PiiFilter";
import { isTeacherOrAdminId } from "@/core/staffIdentity";

export type ErrorCategory = 'FACTUAL_ERROR' | 'PROCEDURAL_ERROR' | 'STRATEGIC_ERROR';
export type AuditAction = ErrorCategory | 'TASK_ERROR' | string;

export interface AuditLogEvent {
  id?: string;
  action: AuditAction;
  user_id: string;
  details?: string;
  timestamp?: number | any;
}

export function maskPII(text?: string | null): string | null {
  if (!text) return null;
  return sanitizePII(text);
}

class AuditLoggerService {
  /**
   * Log an event to the `audit_logs` Firebase node, AND to the student's personal `radar_history`
   * so it appears on the teacher dashboard synced with the video replay.
   */
  async log(action: AuditAction, userId: string, details?: string) {
    if (!userId) {
      console.warn("AuditLogger.log called without userId", { action, details });
      return;
    }

    try {
      if (authReady && typeof (authReady as any).then === 'function') {
        await authReady;
      }
      const timestamp = Date.now();
      const sanitizedDetails = maskPII(details);

      const cleanId = (userId || '').trim().toLowerCase();
      // Same rule as the chat (core/staffIdentity). The local guess used here
      // — "not admin, not teacher, no @" — took a teacher’s Firebase auth uid
      // for a learner, so her login, logout and role switch were pushed into
      // users/students/<uid>/radar_history and radar_alerts, and never into
      // audit_logs where the admin console looks for them.
      const isStudentEvent = cleanId !== 'unknown_uid' && !isTeacherOrAdminId(cleanId);

      // The global audit log is what the admin console shows under "יומן
      // אירועי אבטחה וביקורת". Every learner event — each wrong answer with
      // its task id, each help request, each hesitation — was pushed into it,
      // and in a live lesson those arrive far faster than admin actions, so
      // the last-30 window was all children. Module 24 §ב blocks the system
      // administrator from individual learner telemetry. Learner events go to
      // the teacher's radar (below) and nowhere else.
      if (!isStudentEvent) {
        const logsRef = ref(database, 'audit_logs');
        await push(logsRef, {
          action,
          user_id: userId,
          details: sanitizedDetails || null,
          timestamp: serverTimestamp(),
        });
      }

      if (isStudentEvent) {
        // Student personal radar history (for Teacher Dashboard timeline)
        let type = action;
        let errorCategory = null;
        if (['FACTUAL_ERROR', 'PROCEDURAL_ERROR', 'STRATEGIC_ERROR'].includes(action)) {
          type = 'TASK_ERROR';
          errorCategory = action;
        }

        const normId = cleanId.startsWith('student_') ? cleanId : `student_${cleanId}`;

        const radarRef = ref(database, `users/students/${normId}/radar_history`);
        await push(radarRef, {
          type,
          errorCategory,
          timestamp,
          details: sanitizedDetails || null,
        });

        // Global radar alerts for the live Teacher Dashboard sidebar
        const alertsRef = ref(database, 'radar_alerts');
        await push(alertsRef, {
          type,
          studentId: normId,
          rawStudentId: normId,
          timestamp,
          details: sanitizedDetails || null,
        });
      }

    } catch (e) {
      console.error("Failed to write audit log or radar history:", e);
    }
  }
}

export const AuditLogger = new AuditLoggerService();
