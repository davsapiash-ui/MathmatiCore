import { ref, push, serverTimestamp } from "firebase/database";
import { database } from "@/infrastructure/firebase";

export interface AuditLogEvent {
  id?: string;
  action: string;
  user_id: string;
  details?: string;
  timestamp?: number | any;
}

class AuditLoggerService {
  /**
   * Log an event to the `audit_logs` Firebase node.
   */
  async log(action: string, userId: string, details?: string) {
    try {
      // All authenticated roles can write to audit_logs.
      // (Previous admin-only guard silently dropped all teacher/student events.)

      const logsRef = ref(database, 'audit_logs');
      await push(logsRef, {
        action,
        user_id: userId,
        details: details || null,
        timestamp: serverTimestamp(),
      });
    } catch (e) {
      console.error("Failed to write audit log:", e);
    }
  }
}

export const AuditLogger = new AuditLoggerService();
