import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildResetScope, buildActiveSessionResetValues } from '../exportDriveReport';

/**
 * מודול 23א §ב.2 + סטייה 10: איפוס לומד יחיד "מוחק רק את מסמכי המפגש הזה
 * ב-Firestore". בפועל הוא לא מחק אף אחד מהם: המחיקה סיננה לפי שדה student_id,
 * ולמסמך מפגש אין שדה כזה (החוקים אינם מרשים אותו) — הלומד נמצא במזהה המסמך.
 * אחרי איפוס מפגש 2 של לומד, לשונית "שער מעבר" המשיכה להציג "הושלם ואושר" עם
 * הציון הישן, והחוקים דחו את ההשלמה החדשה שלו (teacher_gate_approved true→false).
 * ביקורת הדשבורד, 20.9.2026.
 */
const sessionsEntry = (scope: ReturnType<typeof buildResetScope>) => scope.firestore.find((e) => e.collection === 'sessions')!;

describe('a single-learner reset reaches the learner\'s session documents', () => {
  it('active meeting: sessions are matched by document id, for that meeting only', () => {
    const entry = sessionsEntry(buildResetScope('single_student', '4', 'active_session', 2, 'student'));
    expect(entry.studentNumbers).toEqual([4]);
    expect(entry.sessionNumber).toBe(2);
    expect(entry.studentValues).toBeUndefined();
    expect(entry.backupOnly).toBe(false);
  });

  it('full learner reset: all of that learner\'s session documents, again by document id', () => {
    const entry = sessionsEntry(buildResetScope('single_student', '11', 'full_student', null, 'student'));
    expect(entry.studentNumbers).toEqual([11]);
    expect(entry.sessionNumber).toBeUndefined();
    expect(entry.studentValues).toBeUndefined();
  });

  it('the other collections do carry student_id and keep the field filter; they are backed up, not deleted', () => {
    const scope = buildResetScope('single_student', '4', 'active_session', 2, 'student');
    for (const entry of scope.firestore.filter((e) => e.collection !== 'sessions')) {
      expect(entry.studentValues, entry.collection).toContain(4);
      expect(entry.studentNumbers, entry.collection).toBeUndefined();
      expect(entry.backupOnly, entry.collection).toBe(true);
    }
  });

  it('the whole-class target is unchanged: no learner filter at all', () => {
    const entry = sessionsEntry(buildResetScope('single_student', '', 'active_session', 3, 'class'));
    expect(entry.studentNumbers).toBeUndefined();
    expect(entry.studentValues).toBeUndefined();
    expect(entry.sessionNumber).toBe(3);
  });

  it('the id filter is applied when backing up, when deleting one meeting and when deleting all', () => {
    const src = readFileSync(resolve(__dirname, '../exportDriveReport.ts'), 'utf-8');
    expect((src.match(/entryCoversDoc\(entry, d\.id\)/g) || []).length).toBe(3);
  });
});

describe('resetting the diagnostic meeting clears everything the diagnostic produced', () => {
  it('meeting 2: the completion key the learner really writes, the approved path and the mastery profile', () => {
    const values = buildActiveSessionResetValues(2, { highestCompletedMeeting: 2 });
    expect(values.session_02_completed).toBe(false);
    for (const key of ['pedagogicalPath', 'teacher_selected_path', 'gate_approved_at', 'gate_approved_by', 'conceptMastery', 'matrix_recommended_path', 'session_score_percent', 'qMatrixResults']) {
      expect(values[key], key).toBeNull();
    }
    expect(values.teacher_gate_approved).toBe(false);
    expect(values.highestCompletedMeeting).toBe(1);
  });

  it('any other meeting leaves the diagnostic and the approved path alone', () => {
    const values = buildActiveSessionResetValues(4, { highestCompletedMeeting: 4 });
    for (const key of ['pedagogicalPath', 'teacher_selected_path', 'conceptMastery', 'qMatrixResults', 'session_02_completed']) {
      expect(key in values, key).toBe(false);
    }
    expect(values.highestCompletedMeeting).toBe(3);
  });
});

describe('what the teacher is told when a reset does not go cleanly (Module 23א §ג, §ד, §ז)', () => {
  const server = readFileSync(resolve(__dirname, '../exportDriveReport.ts'), 'utf-8');
  const client = readFileSync(resolve(__dirname, '../../../react-ts-version/src/application/useStore.ts'), 'utf-8');

  it('a partial deletion is marked as such, and the client no longer calls it "the backup failed, nothing was deleted"', () => {
    expect(server).toContain("{ stage: 'deletion_incomplete' }");
    expect(client).toContain("if (err?.details?.stage === 'deletion_incomplete') {");
    // All three reset actions ask the helper before falling back to the backup-failure message.
    expect((client.match(/reportResetFailureAfterBackupStage\(err, code, serverMessage\);/g) || []).length).toBe(3);
  });

  it('a reset that could not be collected still leaves a failed audit entry, and a missing audit entry is reported', () => {
    const collectCatch = server.slice(server.indexOf('logger.error("Failed to collect data for backup:", err);'));
    expect(collectCatch.slice(0, 900)).toContain("backup_status: 'failed'");
    expect(server).toContain('deletion.failures.push(`reset_audit_log: ${auditErr?.message || auditErr}`);');
  });
});
