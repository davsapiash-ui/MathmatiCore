import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useTeacherGenderStore } from '@/application/useTeacherGender';
import { DEFAULT_TEACHER_GENDER } from '@/core/teacherGender';

/**
 * Owner, 1.10.2026: the toast after the silent help call names the teacher in
 * the teacher's own gender, like every other sentence about the teacher on
 * the child's screens (core/teacherGender.ts).
 */
const ws = () => useWorkspaceStore.getState();

describe('the help-call toast follows the teacher’s choice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAuthStore.setState({ user: { uid: 'student_user5', name: 'user5' } as any, role: 'student', isAuthenticated: true });
    ws().resetWorkspace();
    ws().initSession(1, false);
  });
  afterEach(() => {
    vi.useRealTimers();
    useTeacherGenderStore.setState({ gender: DEFAULT_TEACHER_GENDER });
  });

  it('feminine by default', () => {
    ws().requestSilentHelp();
    expect(ws().feedback?.title).toBe('המורה יודעת 🤝');
  });

  it('masculine when the teacher marked it', () => {
    useTeacherGenderStore.setState({ gender: 'male' });
    ws().requestSilentHelp();
    expect(ws().feedback?.title).toBe('המורה יודע 🤝');
  });
});
