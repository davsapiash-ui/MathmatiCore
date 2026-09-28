import { useAuthStore, currentStudentUid } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';

/**
 * Tests only. Module 26 and the owner's ruling of 28.9.2026: meetings 3–8 have
 * no exercises until the learner's record carries the path the gate approved —
 * never the green bank by default. A test that works inside one of those
 * meetings first gives its learner an approved path, the way the gate does.
 *
 * Signs in learner 1 when no learner is signed in, and keeps whatever else the
 * test already put on the learner's record.
 */
export function approvePath(path: 'green_path' | 'remediation_path' = 'green_path'): string {
  let uid = currentStudentUid();
  if (!uid) {
    const user = useAuthStore.getState().user ?? {};
    useAuthStore.setState({ user: { ...user, uid: 'student_user1', student_id: 1 } as any });
    uid = 'student_user1';
  }
  useStore.setState((s) => ({
    students: {
      ...s.students,
      [uid]: { ...(s.students[uid] ?? {}), teacher_gate_approved: true, routeStatus: 'APPROVED', pedagogicalPath: path } as any,
    },
  }));
  return uid;
}
