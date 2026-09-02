/**
 * PRD v7.1 Module 20 — Teacher Approval Gate.
 *
 * SessionDocument.teacher_gate_approved on the learner's session-2 document is
 * the SOLE source of truth. Approval writes exactly four fields atomically:
 * teacher_gate_approved, teacher_selected_path, gate_approved_at, gate_approved_by.
 *
 * Every approval surface in the dashboard must go through `approveTeacherGate`
 * so no path can invent its own student-level approval flag.
 */

import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, update } from 'firebase/database';
import { firestore, database } from '@/infrastructure/firebase';
import type { SessionDocument, PedagogicalPath } from '@/types';

export type GateApprovalResult =
  | { ok: true }
  | { ok: false; reason: 'missing_session_doc' | 'not_completed' | 'write_failed'; message: string };

/** Canonical session-2 SessionDocument id for a learner (1-12). */
export function session2DocId(studentId: string): string {
  const num = String(studentId).replace(/\D/g, '') || '1';
  return `session_02_student_${num}`;
}

export async function approveTeacherGate(
  studentId: string,
  path: PedagogicalPath,
  teacherId: string | null
): Promise<GateApprovalResult> {
  const num = String(studentId).replace(/\D/g, '') || '1';
  const sessionDocRef = doc(firestore, 'sessions', session2DocId(studentId));

  let snap;
  try {
    snap = await getDoc(sessionDocRef);
  } catch (err) {
    console.error('[teacherGate] failed reading SessionDocument:', err);
    return { ok: false, reason: 'write_failed', message: 'שגיאה בקריאת מסמך המפגש מהשרת.' };
  }

  // Zero fake approvals: never synthesize a SessionDocument to approve against.
  if (!snap.exists()) {
    return {
      ok: false,
      reason: 'missing_session_doc',
      message: `לא נמצא מסמך אבחון (מפגש 2) עבור תלמיד ${num}. לא ניתן לאשר מעבר טרם סיום המפגש בפועל.`,
    };
  }
  if ((snap.data() as SessionDocument).is_completed === false) {
    return {
      ok: false,
      reason: 'not_completed',
      message: `תלמיד ${num} טרם השלים את כל משימות החובה במפגש 2. לא ניתן לאשר מעבר.`,
    };
  }

  const now = Date.now();
  try {
    // Authoritative write — exactly the four approval fields (Module 20 §ב).
    await updateDoc(sessionDocRef, {
      teacher_gate_approved: true,
      teacher_selected_path: path,
      gate_approved_at: now,
      gate_approved_by: teacherId || 'teacher',
    });
  } catch (err) {
    console.error('[teacherGate] failed writing approval:', err);
    return { ok: false, reason: 'write_failed', message: 'שגיאה בכתיבת האישור לשרת.' };
  }

  // Mirror to RTDB purely so the student's live listener unlocks within P95 ≤ 1000ms.
  // This mirror is a transport, never a second source of truth.
  //
  // pedagogicalPath is the field the live task engine actually consults:
  // getActiveTasks() in useWorkspaceStore selects the sessions 3-7 bank from
  // student.pedagogicalPath, and every RTDB→store hydration path (useStore,
  // StudentWorkspacePage, FirebaseSyncService) forwards only that name. The
  // PRD-canonical teacher_selected_path was mirrored here but read by nothing
  // on the client, so a remediation_path approval never reached the engine
  // and the learner was always handed the green_path (10,000-range) bank —
  // exactly what Module 26 forbids ("חל איסור מוחלט על טעינת תרגילים ממאגר
  // שאינו תואם למסלול המאושר"). Carrying the decision under the engine's own
  // key makes the gate the initial path assignment; Module 19's later
  // silent-adaptation override writes the same field at a task boundary,
  // which is the intended precedence.
  const mirror = {
    teacher_gate_approved: true,
    teacher_selected_path: path,
    pedagogicalPath: path,
    gate_approved_at: now,
    gate_approved_by: teacherId || 'teacher',
    routeStatus: 'APPROVED',
  };
  await Promise.all(
    [`student_user${num}`, `student_${num}`, num].map((alias) =>
      update(ref(database, `users/students/${alias}`), mirror).catch(() => {})
    )
  );

  return { ok: true };
}
