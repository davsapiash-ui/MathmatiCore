import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pedagogicalReportHtml } from '../reportHtml';

/**
 * "מסלול מומלץ" is the meeting-2 diagnostic's recommendation for the gate
 * (PRD 20 §ב). Meetings 3–8 are routed by their score bands (PRD 23). The
 * report printed a path for every scored meeting, and remediation whenever it
 * had none — so a learner who had not finished meeting 3 read as remediation.
 */
const base = { meeting_kind: 'scored', anonymous_student_label: 'תלמיד 8', score_percent: 40, routing_label_he: 'קבוצה הומוגנית קטנה' };

describe('the report prints a path for meeting 2 only', () => {
  it('meeting 2: the path the diagnostic recommended', () => {
    const html = pedagogicalReportHtml({ ...base, session_number: 2, matrix_recommended_path: 'green_path' });
    expect(html).toContain('מסלול מומלץ');
  });

  it('meeting 3: no path — its grouping by score band only', () => {
    const html = pedagogicalReportHtml({ ...base, session_number: 3, matrix_recommended_path: null });
    expect(html).not.toContain('מסלול מומלץ');
    expect(html).toContain('קבוצה הומוגנית קטנה');
  });

  it('no recommendation is never shown as remediation', () => {
    const html = pedagogicalReportHtml({ ...base, session_number: 2, matrix_recommended_path: null });
    expect(html).not.toContain('מסלול מומלץ');
  });

  it('the report sets a path only for meeting 2', () => {
    const src = readFileSync(resolve(__dirname, '../pedagogicalReport.ts'), 'utf-8');
    expect(src).toContain('matrix_recommended_path: score === null || resolvedSessionNumber !== 2');
  });
});
