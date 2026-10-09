import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { activationMirror, type ReadDoc } from '@/core/classActivationMirror';
import { DEFAULT_CLASS_TYPE } from '@/core/pilotInstitution';

/**
 * PRD 25 (l.1171: class_type is a non-nullable field the admin sets in the
 * setup wizard) and Appendix A §1 (students/*.created_at). Every meeting
 * activation overwrote class_type with "כיתת ביקורת" and moved every learner
 * document's created_at to the activation time. Each is now written only when
 * the document does not have it.
 */
const base = (classDoc: ReadDoc, studentDocs: ReadDoc[] = []) =>
  activationMirror({
    classId: 'class_1', schoolId: 'school_bikorot', teacherUid: 'teacher-uid',
    activeSessionId: 'session_03', now: 1_790_000_000_000, classDoc, studentDocs,
  });

describe('the activation keeps the class type the admin chose', () => {
  it('an existing class type is not written', () => {
    const m = base({ class_type: 'כיתת תמיכה מוגברת (UDL)', class_name: 'המבקרים' });
    expect(m.classFields).not.toHaveProperty('class_type');
    expect(m.classFields).toMatchObject({ class_id: 'class_1', active_session_id: 'session_03', updated_by_teacher_id: 'teacher-uid', class_name: 'המבקרים' });
  });

  it('a class document that does not exist (or has no type) gets the default, as the wizard would', () => {
    expect(base(null).classFields.class_type).toBe(DEFAULT_CLASS_TYPE);
    expect(base({ class_name: 'המבקרים' }).classFields.class_type).toBe(DEFAULT_CLASS_TYPE);
  });

  it('a document that could not be read is not overwritten', () => {
    expect(base(undefined).classFields).not.toHaveProperty('class_type');
  });
});

describe('the activation keeps each learner document\'s created_at', () => {
  it('written only for a document that does not exist or has none', () => {
    const docs: ReadDoc[] = Array.from({ length: 12 }, () => null);
    docs[0] = { student_id: 1, created_at: 1_700_000_000_000 };
    docs[1] = { student_id: 2 };
    docs[2] = undefined;
    const m = base({ class_type: 'x' }, docs);
    expect(m.studentFields.get(1)).not.toHaveProperty('created_at');
    expect(m.studentFields.get(2)?.created_at).toBe(1_790_000_000_000);
    expect(m.studentFields.get(3)).not.toHaveProperty('created_at');
    expect(m.studentFields.get(4)?.created_at).toBe(1_790_000_000_000);
    expect(m.studentFields.get(12)).toEqual({
      student_id: 12, class_id: 'class_1', school_id: 'school_bikorot', active_session_id: 'session_03', created_at: 1_790_000_000_000,
    });
    // Module 19: the support profile is never stamped here.
    for (const fields of m.studentFields.values()) expect(Object.keys(fields).some((k) => k.startsWith('support_profile'))).toBe(false);
  });
});

describe('the dashboard writes the mirror through the helper', () => {
  const dash = readFileSync(resolve(__dirname, '../../presentation/pages/TeacherDashboard.tsx'), 'utf-8');
  it('no fixed class type and no created_at stamp in the activation', () => {
    expect(dash).not.toContain("class_type: 'כיתת ביקורת'");
    expect(dash).not.toContain('created_at: now,');
    expect(dash).toContain('const mirror = activationMirror({');
  });
});
