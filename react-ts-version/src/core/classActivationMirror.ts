/**
 * The Firestore mirror a meeting activation writes (PRD Module 14 §ב0): the
 * class document and the twelve learner documents. Pure, so what it writes
 * can be tested without a database.
 *
 * Two fields belong to whoever created the document, and the activation used
 * to overwrite them every time a meeting was opened:
 *  - class_type (Module 25: a non-nullable field the admin sets in the setup
 *    wizard) was reset to "כיתת ביקורת", whatever the admin had chosen;
 *  - students/*.created_at (Appendix A §1) was moved to the latest activation.
 * Now each is written only when the document does not have it yet — and
 * neither is written when the documents could not be read (offline): a merge
 * without them keeps what is there.
 */
import { DEFAULT_CLASS_TYPE, PILOT_CLASS_CAPACITY, PILOT_CLASS_NAME } from '@/core/pilotInstitution';

/** A document as read before the write: its data, null when it does not exist, undefined when it could not be read. */
export type ReadDoc = Record<string, unknown> | null | undefined;

export interface ActivationMirrorInput {
  classId: string;
  schoolId: string;
  teacherUid: string | null;
  activeSessionId: string;
  now: number;
  classDoc: ReadDoc;
  /** Learner N's document at index N-1. */
  studentDocs: ReadDoc[];
}

export interface ActivationMirror {
  classFields: Record<string, unknown>;
  /** Learner N (1–12) → the fields merged into students/student_userN. */
  studentFields: Map<number, Record<string, unknown>>;
}

const hasNonEmptyString = (doc: ReadDoc, field: string) =>
  !!doc && typeof doc[field] === 'string' && (doc[field] as string).length > 0;
const hasNumber = (doc: ReadDoc, field: string) => !!doc && typeof doc[field] === 'number';

/** Written only when known to be missing: a document that exists and has it, or that could not be read, keeps its own. */
const missing = (doc: ReadDoc, has: (d: ReadDoc) => boolean) => doc !== undefined && !has(doc);

export function activationMirror(input: ActivationMirrorInput): ActivationMirror {
  const classFields: Record<string, unknown> = {
    class_id: input.classId,
    school_id: input.schoolId,
    class_name: PILOT_CLASS_NAME,
    teacher_id: input.teacherUid || 'teacher',
    active_session_id: input.activeSessionId,
    updated_by_teacher_id: input.teacherUid || null,
    student_count: PILOT_CLASS_CAPACITY,
    ...(missing(input.classDoc, (d) => hasNonEmptyString(d, 'class_type')) ? { class_type: DEFAULT_CLASS_TYPE } : {}),
  };
  const studentFields = new Map<number, Record<string, unknown>>();
  for (let n = 1; n <= PILOT_CLASS_CAPACITY; n++) {
    const existing = input.studentDocs[n - 1];
    studentFields.set(n, {
      student_id: n,
      class_id: input.classId,
      school_id: input.schoolId,
      active_session_id: input.activeSessionId,
      ...(missing(existing, (d) => hasNumber(d, 'created_at')) ? { created_at: input.now } : {}),
    });
  }
  return { classFields, studentFields };
}
