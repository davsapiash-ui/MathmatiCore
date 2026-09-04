import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Module 23א: after a reset (any level) a learner must look fresh in the
 * "דו"חות אבחון אישיים" tab. The status badge and the mapping-status block
 * used to be fixed sentences ("מפגש 1 הושלם...") shown to every learner who
 * had not reached meeting 2 — including one who had just been reset, or had
 * never logged in. They must be derived from highestCompletedMeeting, which
 * the reset zeroes.
 */
const dashboard = readFileSync(resolve(__dirname, '../../../TeacherDashboard.tsx'), 'utf-8');

describe('Reports tab — a reset or brand-new learner is shown as such', () => {
  it('derives "started" from highestCompletedMeeting, not from a fixed sentence', () => {
    expect(dashboard).toMatch(/const highestDone = typeof s\.highestCompletedMeeting === 'number' \? s\.highestCompletedMeeting : 0;/);
    expect(dashboard).toMatch(/const hasStarted = hasCompletedDiagnosticM2 \|\| highestDone >= 1;/);
  });

  it('shows "מפגש 1 הושלם" only when meeting 1 was actually completed', () => {
    expect(dashboard).toMatch(/hasStarted \? 'מפגש 1 הושלם — ממתין לאבחון במפגש 2' : 'טרם התחיל — אין נתונים'/);
    expect(dashboard).toMatch(/hasStarted \? 'מפגש 1 \(ארגז החול והיכרות\) הושלם\.' : 'התלמיד עדיין לא סיים אף מפגש\.'/);
    expect(dashboard).not.toContain('הושלם בהצלחה.</p>');
  });

  it('no longer labels the gate button as a lesson-plan approval (Module 26)', () => {
    expect(dashboard).not.toContain('אישור תוכנית ומסלול');
    expect(dashboard).not.toContain('אישור שער ועריכת תרגילים');
  });
});
