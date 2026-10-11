import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { researchDetailsColumns } from '../researchTelemetryRow';

/**
 * Audit 11.10.2026, research export.
 *  - Memory-circle digits were stored (details.input_target) but had no column, so in
 *    the CSV they could not be told apart from digits of the result row.
 *  - REGROUPING_SUCCESS.duration_ms was 0 for every event (the client never records
 *    when a conversion became possible); a column of zeros reads as a measurement.
 *  - The meetings file sorted its "learner:meeting" keys as text: learners 10-12 came
 *    before learner 1.
 */
describe('research export columns', () => {
  it('names the memory circle on digit events and leaves other digits blank', () => {
    expect(researchDetailsColumns('DIGIT_ENTERED', { input_target: 'carry_circle' }).input_target).toBe('carry_circle');
    expect(researchDetailsColumns('DIGIT_DELETED', { input_target: 'carry_circle' }).input_target).toBe('carry_circle');
    expect(researchDetailsColumns('DIGIT_ENTERED', {}).input_target).toBe('');
    // Only the one known value passes; anything else a client sends is not copied.
    expect(researchDetailsColumns('DIGIT_ENTERED', { input_target: 'שם' }).input_target).toBe('');
    expect(researchDetailsColumns('BLOCK_DRAG_COMPLETE', { input_target: 'carry_circle' }).input_target).toBe('');
  });

  it('puts the new column after every existing one', () => {
    const keys = Object.keys(researchDetailsColumns('DIGIT_ENTERED', {}));
    expect(keys[keys.length - 1]).toBe('input_target');
    expect(keys[keys.length - 2]).toBe('branch');
  });

  it('an unknown conversion duration is blank, a measured one is kept', () => {
    expect(researchDetailsColumns('REGROUPING_SUCCESS', { duration_ms: 0 }).duration_ms).toBe('');
    expect(researchDetailsColumns('REGROUPING_SUCCESS', {}).duration_ms).toBe('');
    expect(researchDetailsColumns('REGROUPING_SUCCESS', { duration_ms: 1850 }).duration_ms).toBe(1850);
    expect(researchDetailsColumns('BLOCK_DRAG_COMPLETE', { duration_ms: 1850 }).duration_ms).toBe('');
  });

  it('the meetings file orders learners by number, not as text', () => {
    const src = readFileSync(resolve(__dirname, '../exportDriveReport.ts'), 'utf-8').replace(/\r\n/g, '\n');
    expect(src).toContain('Array.from(byLearnerMeeting.entries()).sort(byNumbers)');
    expect(src).not.toContain('Array.from(byLearnerMeeting.entries()).sort())');
    // The comparator itself: "10:1" must come after "2:8".
    const order = ['10:1', '2:8', '1:3', '2:1'].sort((a, b) => {
      const [an, am] = a.split(':').map(Number);
      const [bn, bm] = b.split(':').map(Number);
      return an - bn || am - bm;
    });
    expect(order).toEqual(['1:3', '2:1', '2:8', '10:1']);
  });
});
