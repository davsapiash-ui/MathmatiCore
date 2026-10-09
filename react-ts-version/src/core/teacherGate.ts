/**
 * PRD Module 20 §ב — Teacher Approval Gate ("שלב החלוקה למסלולים").
 *
 * SessionDocument.teacher_gate_approved on the learner's session-2 document is
 * the SOLE source of truth. "עם אישור המורה, השרת כותב את האישור למסמך המפגש
 * ומשקף אותו באותה פעולה לרשומת הלומד" — so the approval is one call to the
 * server (functions/src/teacherGate.ts, approveTeacherGate), which checks that
 * the caller is the teacher of the learner's class and writes, with the Admin
 * SDK, both the session document (teacher_gate_approved, teacher_selected_path,
 * gate_approved_at, gate_approved_by) and the staff-only mirror on the learner
 * record (routeStatus, teacher_gate_approved, pedagogicalPath, …) that the
 * learner's route guard listens to.
 *
 * Every approval surface in the dashboard must go through `approveTeacherGate`
 * so no path can invent its own student-level approval flag. The client writes
 * neither side itself.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '@/infrastructure/firebase';
import type { PedagogicalPath } from '@/types';
import { meetingShortLabelHe } from '@/core/stationNames';

export type GateApprovalResult =
  | { ok: true }
  | { ok: false; reason: 'missing_session_doc' | 'not_completed' | 'write_failed'; message: string };

/** Canonical session-2 SessionDocument id for a learner (1-12). */
export function session2DocId(studentId: string): string {
  const num = String(studentId).replace(/\D/g, '') || '1';
  return `session_02_student_${num}`;
}

/** The callable's name (functions/src/index.ts). */
export const APPROVE_TEACHER_GATE_FN = 'approveTeacherGate';

/**
 * The approval. `_teacherId` is kept for the callers' signature only: the
 * server records the signed-in caller (request.auth.uid), never an id the
 * client names.
 */
export async function approveTeacherGate(
  studentId: string,
  path: PedagogicalPath,
  _teacherId?: string | null
): Promise<GateApprovalResult> {
  const num = String(studentId).replace(/\D/g, '') || '1';
  try {
    const call = httpsCallable<{ studentId: string; path: PedagogicalPath }, { ok: boolean }>(functions, APPROVE_TEACHER_GATE_FN);
    await call({ studentId: String(studentId), path });
    return { ok: true };
  } catch (err) {
    console.error('[teacherGate] approval failed:', err);
    const e = err as { code?: string; message?: string; details?: { reason?: string } } | null;
    const reason = e?.details?.reason;
    // Zero fake approvals: the server never synthesises a SessionDocument to approve against.
    if (reason === 'missing_session_doc') {
      return {
        ok: false,
        reason: 'missing_session_doc',
        message: `לא נמצא מסמך אבחון (${meetingShortLabelHe(2)}) עבור תלמיד ${num}. לא ניתן לאשר מעבר טרם סיום המפגש בפועל.`,
      };
    }
    if (reason === 'not_completed') {
      return {
        ok: false,
        reason: 'not_completed',
        message: `תלמיד ${num} טרם השלים את כל משימות החובה ב${meetingShortLabelHe(2)}. לא ניתן לאשר מעבר.`,
      };
    }
    // The approval was saved but the learner's screen was not released, or the
    // caller is refused: the server's own sentence says which.
    const serverSays = reason === 'mirror_failed' || e?.code === 'functions/permission-denied' || e?.code === 'functions/invalid-argument';
    return {
      ok: false,
      reason: 'write_failed',
      message: serverSays && e?.message ? e.message : 'שגיאה בכתיבת האישור לשרת.',
    };
  }
}
