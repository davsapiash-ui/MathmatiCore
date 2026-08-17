import { ref, push, serverTimestamp } from "firebase/database";
import { database } from "@/infrastructure/firebase";
import { sanitizePII } from "@/core/security/PiiFilter";

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
      const timestamp = Date.now();
      const sanitizedDetails = maskPII(details);
      
      // Global audit log
      const logsRef = ref(database, 'audit_logs');
      await push(logsRef, {
        action,
        user_id: userId,
        details: sanitizedDetails || null,
        timestamp: serverTimestamp(),
      });

      const cleanId = (userId || '').trim().toLowerCase();
      const isStudentEvent = cleanId.startsWith('student_') || (!['admin', 'teacher', 'unknown_uid'].includes(cleanId) && !cleanId.includes('@'));

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
