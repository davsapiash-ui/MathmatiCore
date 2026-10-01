import { useEffect } from 'react';
import { create } from 'zustand';
import { ref, onValue, set as firebaseSet } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { DEFAULT_TEACHER_GENDER, parseTeacherGender, type TeacherGender } from '@/core/teacherGender';

/**
 * The teacher's choice of how the children's screens speak of the teacher
 * (core/teacherGender.ts). One value for the class, beside the projector
 * switch: the teacher writes it, every signed-in device reads it, and the
 * database rules refuse anything but 'female' or 'male' from anyone but a
 * teacher. It is not tied to the teacher's address — nothing is added to the
 * teacher's record (useAdminStore: "ככל שנשמר פחות — כך טוב יותר").
 */
export const TEACHER_GENDER_PATH = 'system_control/teacher_gender';

export const useTeacherGenderStore = create<{ gender: TeacherGender }>(() => ({
  gender: DEFAULT_TEACHER_GENDER,
}));

// One listener however many screens need the value: the lobby, the workspace
// and the teacher's sidebar each hold it while they are up.
let holders = 0;
let unsubscribe: (() => void) | null = null;

function hold(): void {
  holders += 1;
  if (unsubscribe) return;
  try {
    const unsub = onValue(
      ref(database, TEACHER_GENDER_PATH),
      (snap) => useTeacherGenderStore.setState({ gender: parseTeacherGender(snap.val()) }),
      (err) => console.warn('[useTeacherGender] listener notice:', err),
    );
    unsubscribe = typeof unsub === 'function' ? unsub : null;
  } catch (err) {
    console.warn('[useTeacherGender] listener not started:', err);
  }
}

function release(): void {
  holders = Math.max(0, holders - 1);
  if (holders === 0 && unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

/**
 * Keeps the teacher's choice up to date while the calling screen is up, and
 * returns it. Screens rendered inside one that calls this read the store
 * directly (`useTeacherGenderStore`), as does the help-call toast.
 */
export function useTeacherGender(): TeacherGender {
  useEffect(() => {
    hold();
    return release;
  }, []);
  return useTeacherGenderStore((s) => s.gender);
}

/** The teacher's write. The rules refuse it from anyone else. */
export function saveTeacherGender(gender: TeacherGender): Promise<void> {
  return firebaseSet(ref(database, TEACHER_GENDER_PATH), gender);
}
