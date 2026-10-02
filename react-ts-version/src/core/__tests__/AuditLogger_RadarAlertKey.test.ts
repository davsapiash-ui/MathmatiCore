import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Acceptance run of 2.10.2026 (D4): every learner audit event was pushed to
 * radar_alerts under a bare push() key, and the rules accept a learner's write
 * there only under a key that starts with the learner's own id — so every one
 * was refused (PERMISSION_DENIED). The writer now prefixes the key.
 */
const writes: { path: string; value: Record<string, unknown> }[] = [];
vi.mock('@/infrastructure/firebase', () => ({ database: {}, authReady: Promise.resolve() }));
vi.mock('firebase/database', () => {
  let n = 0;
  const ref = (_db: unknown, path: string) => ({ path });
  return {
    ref,
    serverTimestamp: () => 'ts',
    push: (r: { path: string }, value?: Record<string, unknown>) => {
      const key = `-Nkey${++n}`;
      if (value !== undefined) writes.push({ path: `${r.path}/${key}`, value });
      return { key, then: undefined };
    },
    set: async (r: { path: string }, value: Record<string, unknown>) => {
      writes.push({ path: r.path, value });
    },
  };
});

import { AuditLogger } from '@/infrastructure/services/AuditLogger';

describe('radar_alerts: the learner writes under a key the rules accept', () => {
  beforeEach(() => {
    writes.length = 0;
  });

  it('the key starts with the learner id, and the record carries no name', async () => {
    await AuditLogger.log('TAB_ESCAPE', 'student_user3', 'Student switched to another tab or window');
    const alert = writes.find((w) => w.path.startsWith('radar_alerts/'));
    expect(alert).toBeDefined();
    const key = alert!.path.slice('radar_alerts/'.length);
    expect(key.startsWith('student_user3_')).toBe(true);
    expect(key).not.toContain('/');
    expect(alert!.value.studentId).toBe('student_user3');
    for (const field of ['studentName', 'name', 'email', 'taz', 'rawStudentName']) {
      expect(alert!.value).not.toHaveProperty(field);
    }
    // Still not in the global audit log (Module 24 §ב).
    expect(writes.some((w) => w.path.startsWith('audit_logs'))).toBe(false);
  });

  it('two events of the same learner get two keys', async () => {
    await AuditLogger.log('HELP_REQUESTED', 'student_user5', 'a');
    await AuditLogger.log('HELP_REQUESTED', 'student_user5', 'b');
    const keys = writes.filter((w) => w.path.startsWith('radar_alerts/')).map((w) => w.path);
    expect(new Set(keys).size).toBe(2);
  });

  it('the rule the key is written for', () => {
    const rules = JSON.parse(readFileSync(resolve(__dirname, '../../../../database.rules.json'), 'utf-8'));
    const write: string = rules.rules.radar_alerts.$alertId['.write'];
    expect(write).toContain("$alertId.beginsWith('student_user' + auth.token.student_id + '_')");
  });
});
