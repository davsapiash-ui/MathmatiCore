/**
 * The teacher marks a learner's help call as handled: the write "סמנו כטופל"
 * has always made (חלונית הלומד), now shared with the side action queue, where
 * the teacher's mediation action clears the call too (owner, 11.10.2026).
 */
import { ref, update } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { normalizeStudentId } from '@/application/useChatStore';

export const HELP_CLEARED_PAYLOAD = {
  helpRequested: false,
  handRaised: false,
  isStruggling: false,
  lastAction: 'המורה סימן את בקשת העזרה כטופלה',
} as const;

/** Every spelling of the learner's record the call may sit under. */
export function helpRecordIdsOf(studentId: string): string[] {
  const normId = normalizeStudentId(studentId);
  const rawNum = studentId.replace(/[^0-9]/g, '');
  return Array.from(new Set([studentId, normId, rawNum, `student_user${rawNum}`].filter(Boolean)));
}

/** Clears the call on every spelling; rejects when the server refuses. */
export async function clearHelpRequest(studentId: string): Promise<void> {
  await Promise.all(helpRecordIdsOf(studentId).map((id) => update(ref(database, `users/students/${id}`), { ...HELP_CLEARED_PAYLOAD })));
}
