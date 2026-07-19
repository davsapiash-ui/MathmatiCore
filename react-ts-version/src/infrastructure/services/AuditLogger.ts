import { ref, push, serverTimestamp } from "firebase/database";
import { database } from "@/infrastructure/firebase";

export type ErrorCategory = 'FACTUAL_ERROR' | 'PROCEDURAL_ERROR' | 'STRATEGIC_ERROR';
export type AuditAction = ErrorCategory | 'TASK_ERROR' | string;

export interface AuditLogEvent {
  id?: string;
  action: AuditAction;
  user_id: string;
  details?: string;
  timestamp?: number | any;
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
      
      // Global audit log
      const logsRef = ref(database, 'audit_logs');
      await push(logsRef, {
        action,
        user_id: userId,
        details: details || null,
        timestamp: serverTimestamp(),
      });

      // Student personal radar history (for Teacher Dashboard timeline)
      // Map actions to radar types: 'TASK_ERROR', 'PASSIVE_DRIFTING', 'HESITATION', etc.
      let type = action;
      let errorCategory = null;
      if (['FACTUAL_ERROR', 'PROCEDURAL_ERROR', 'STRATEGIC_ERROR'].includes(action)) {
        type = 'TASK_ERROR';
        errorCategory = action;
      }

      const radarRef = ref(database, `users/students/${userId}/radar_history`);
      await push(radarRef, {
        type,
        errorCategory,
        timestamp, // use client timestamp to match rrweb video timeline
        details: details || null,
      });

      // Global radar alerts for the live Teacher Dashboard sidebar
      const alertsRef = ref(database, 'radar_alerts');
      await push(alertsRef, {
        type,
        studentId: userId,
        timestamp,
        details: details || null,
      });

    } catch (e) {
      console.error("Failed to write audit log or radar history:", e);
    }
  }
}

export const AuditLogger = new AuditLoggerService();
