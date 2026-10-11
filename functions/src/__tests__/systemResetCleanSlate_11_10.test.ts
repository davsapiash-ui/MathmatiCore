import { describe, it, expect } from 'vitest';
import { buildResetScope } from '../exportDriveReport';

// Owner, 11.10.2026: before the research run the system reset leaves nothing
// from a trial lesson — the mediation log (measure 5) and the rejected-AI
// records are wiped with the learners' data; the reset log is kept.
describe('system reset: a clean slate before the research run', () => {
  const scope = buildResetScope('system', 'all');
  const collections = scope.firestore.map((e) => e.collection);

  it('wipes the teacher mediation log and the rejected-AI records, whole', () => {
    for (const c of ['teacher_mediation_log', 'ai_rejections']) {
      const entry = scope.firestore.find((e) => e.collection === c);
      expect(entry, c).toBeTruthy();
      expect(entry!.backupOnly).toBeFalsy();
      expect(entry!.studentValues).toBeUndefined();
    }
  });

  it('keeps the learners\' data collections and never touches the reset log', () => {
    for (const c of ['sessions', 'telemetry_logs', 'telemetry_events', 'reports', 'class_reports', 'srl_reflections']) expect(collections).toContain(c);
    expect(collections).not.toContain('reset_audit_log');
  });

  it('a single-learner reset does not touch the mediation log', () => {
    const one = buildResetScope('single_student', '4', 'full_student', null, 'student');
    expect(one.firestore.map((e) => e.collection)).not.toContain('teacher_mediation_log');
  });
});
