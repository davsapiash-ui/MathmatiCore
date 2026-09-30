import type { PedagogicalPath, SessionDocument } from '@/types';
import type { StudentData } from '@/application/useStore';
import { recommendedPathOf } from '@/core/recommendedPath';
import { diagnosticTaskLabelHe, getFailedDiagnosticTasks } from '@/core/QMatrix';

/**
 * What the teacher sees about one learner at "שלב החלוקה למסלולים" (PRD Module 20):
 * the matrix recommendation, the meeting-2 score and the diagnostic tasks that
 * need support. The approvals table, the approval drawer and the learner
 * journey's badge all read it from here, so they can never disagree.
 */
export interface GateStudentItem {
  studentId: string;
  anonymousLabel: string;
  session2Doc?: Partial<SessionDocument>;
  /**
   * The diagnostic's recommendation (core/recommendedPath.ts), or null when the
   * diagnostic has not produced one yet. Never a default colour: the screen
   * then says "טרם נקבעה" and the teacher picks the path herself.
   */
  recommendedPath: PedagogicalPath | null;
  /** session_score_percent of meeting 2, or null when it has not been computed yet. */
  scorePercent: number | null;
  isCompleted: boolean;
  isApproved: boolean;
  scoreSummary?: string;
  /** Hebrew labels of the diagnostic tasks that need support; undefined when there are none. */
  errorNodes?: string[];
}

export const NO_RECOMMENDATION_HE = 'טרם נקבעה';

/** The anonymous learner number (1–12) in any of the id forms ('student_user3', 'student_3', '3'); null otherwise. */
export function gateLearnerNumber(studentId: string | null | undefined): number | null {
  const digits = String(studentId ?? '').replace(/\D/g, '');
  const n = digits ? Number(digits) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * The gate evidence for learner number `n` (1–12). The Firestore session-2
 * document is read first; the learner's own RTDB record (where the learner's
 * client writes the same two fields) is the fallback.
 */
export function buildGateStudentItem(
  n: number,
  students: Record<string, StudentData | undefined>,
  session2Docs: Record<string, Partial<SessionDocument> | undefined>,
): GateStudentItem {
  const sId = `student_${n}`;
  // students[] is keyed by normalizeStudentId (student_user{N}); student_{N}
  // and bare {N} are only populated when something separately wrote those
  // RTDB alias paths too, so the canonical key must be checked first.
  const studentData = students[`student_user${n}`] || students[sId] || students[String(n)];
  const session2Doc = session2Docs[sId] || session2Docs[String(n)];
  const record = (studentData ?? {}) as unknown as Record<string, unknown>;

  const isCompleted = Boolean(
    session2Doc?.is_completed ||
    studentData?.completedMeeting2 ||
    studentData?.session_2_completed ||
    (studentData?.highestCompletedMeeting && studentData.highestCompletedMeeting >= 2) ||
    studentData?.routeStatus === 'PENDING_TEACHER_APPROVAL'
  );

  const isApproved = Boolean(
    session2Doc?.teacher_gate_approved ||
    studentData?.teacher_gate_approved ||
    studentData?.routeStatus === 'APPROVED'
  );

  // No synthetic default: a score that was never computed stays null.
  const scorePercent = finiteNumber(session2Doc?.session_score_percent) ?? finiteNumber(record.session_score_percent);

  // PRD Module 20 §ב (≥ 50 → green_path, else remediation_path), read through the
  // one helper every teacher screen uses. Null when there is nothing to read.
  const recommendedPath = recommendedPathOf(session2Doc) ?? recommendedPathOf(record);

  // Real failed diagnostic tasks from the learner's own Q-Matrix results.
  // getFailedDiagnosticTasks is the one shared reading of that value.
  const failed = getFailedDiagnosticTasks(
    studentData?.qMatrixResults as Record<string, unknown> | undefined
  ).map(diagnosticTaskLabelHe);

  return {
    studentId: sId,
    anonymousLabel: `תלמיד ${n}`,
    session2Doc,
    recommendedPath,
    scorePercent,
    isCompleted,
    isApproved,
    scoreSummary: scorePercent !== null
      ? `ציון האבחון: ${Math.round(scorePercent)}% (7 משימות חובה)`
      : 'סיום ראשוני — ממתין לחישוב מדדים',
    errorNodes: failed.length > 0 ? failed : undefined,
  };
}

/** Every learner 1–12 who finished meeting 2 — the rows of the approvals table. */
export function buildGateStudentItems(
  students: Record<string, StudentData | undefined>,
  session2Docs: Record<string, Partial<SessionDocument> | undefined>,
): GateStudentItem[] {
  const items: GateStudentItem[] = [];
  for (let i = 1; i <= 12; i++) {
    const item = buildGateStudentItem(i, students, session2Docs);
    if (item.isCompleted) items.push(item);
  }
  return items;
}
