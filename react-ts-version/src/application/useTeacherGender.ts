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

/**
 * The last value this device saw. A class whose teacher chose the masculine
 * would otherwise open every screen in the feminine and switch a moment later,
 * when the database answers — a sentence that changes under a child's eyes.
 * One value for the whole class, so nothing of one learner reaches another.
 */
export const TEACHER_GENDER_CACHE_KEY = 'mathmaticore_teacher_gender';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readCachedGender(): TeacherGender {
  try {
    return parseTeacherGender(storage()?.getItem(TEACHER_GENDER_CACHE_KEY));
  } catch {
    return DEFAULT_TEACHER_GENDER;
  }
}

export const useTeacherGenderStore = create<{ gender: TeacherGender }>(() => ({
  gender: readCachedGender(),
}));

// One listener however many screens need the value: the lobby, the workspace
// and the teacher's dashboard each hold it while they are up.
let holders = 0;
let unsubscribe: (() => void) | null = null;

function hold(): void {
  holders += 1;
  if (unsubscribe) return;
  try {
    const unsub = onValue(
      ref(database, TEACHER_GENDER_PATH),
      (snap) => {
        const gender = parseTeacherGender(snap.val());
        useTeacherGenderStore.setState({ gender });
        try {
          storage()?.setItem(TEACHER_GENDER_CACHE_KEY, gender);
        } catch {
          // A full or blocked storage only costs the head start on the next load.
        }
      },
      (err) => {
        // A refused listener is gone: let the next screen that needs it start a new one.
        console.warn('[useTeacherGender] listener notice:', err);
        unsubscribe = null;
      },
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

/**
 * The teacher's write. The rules refuse it from anyone else. The listener
 * shows the new value at once, before the server confirms it; offline, the
 * promise waits for the connection and the choice already shows.
 */
export function saveTeacherGender(gender: TeacherGender): Promise<void> {
  return firebaseSet(ref(database, TEACHER_GENDER_PATH), gender);
}
