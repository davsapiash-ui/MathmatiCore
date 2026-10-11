import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { increment: (n: number) => ({ __inc: n }), serverTimestamp: () => ({ __ts: true }) },
  getFirestore: () => ({ collection: () => ({ add: async () => ({ id: 'x' }), doc: () => ({ set: async () => undefined, get: async () => ({ exists: false }) }) }) }),
}));

import { clientRejectionRecord, mayReportRejection, CLIENT_CHECK_MODEL_ID } from '../socraticRejectionReport';
import { AI_REJECTION_FIELDS, AI_REJECTION_TEXT_MAX } from '../aiMonitoring';
import { requiredRepresentationContradicted, representationOfOption } from '../socraticContract';
import { buildAiRejectionsReport, aiRejectionsReportHtml, aiRejectionsReportLines, validatorReasonLabelHe, OTHER_REASON_HE } from '../aiRejectionsReport';

/** Owner decision, 11.10.2026: items 13-1 (client refusals recorded; the representation check on the server) and 13-10 (Hebrew reasons). */

describe('a client refusal record (13-1)', () => {
  it('holds the closed field list only: no learner, no session, the text capped and scrubbed', () => {
    const rec = clientRejectionRecord({
      outcome: 'static_reject', reason: 'final answer leaked', exercise_id: 's1_r_value368', meeting: 1, attempt: 1, demo: false,
      card_text: 'כתבו אל a@b.co ' + 'א'.repeat(5000), student_id: 3, session_id: 'session_1_student_3', uid: 'abc',
    })!;
    expect(Object.keys(rec).sort()).toEqual([...AI_REJECTION_FIELDS].sort());
    expect(rec.model_id).toBe(CLIENT_CHECK_MODEL_ID);
    expect(rec.card_text.length).toBe(AI_REJECTION_TEXT_MAX);
    expect(rec.card_text).not.toContain('a@b.co');
    expect(JSON.stringify(rec)).not.toMatch(/session_1_student_3|abc"/);
  });

  it('only the two client kinds; a bad id or meeting is dropped; the meeting comes from the id', () => {
    expect(clientRejectionRecord({ outcome: 'answer_leak' })).toBeNull();
    const rec = clientRejectionRecord({ outcome: 'client_reject', exercise_id: 's4_g_t1', meeting: 99, attempt: 7 })!;
    expect(rec.meeting).toBe(4);
    expect(rec.attempt).toBe(1);
    expect(clientRejectionRecord({ outcome: 'client_reject', exercise_id: 'x y; drop' })!.exercise_id).toBeNull();
  });

  it('a learner or a staff sign-in only', () => {
    expect(mayReportRejection(undefined)).toBe(false);
    expect(mayReportRejection({})).toBe(false);
    expect(mayReportRejection({ student_id: 3 })).toBe(true);
    expect(mayReportRejection({ role: 'teacher' })).toBe(true);
    expect(mayReportRejection({ role: 'admin' })).toBe(true);
  });
});

describe('the server refuses a card that marks the instruction\'s blocks wrong (13-1)', () => {
  const facts = { task_kind: 'representation' as const, required_counts: { hundreds: 3, tens: 4 } };
  it('reads an option that offers blocks', () => {
    expect(representationOfOption('בונים 3 לבני מאה ו-4 לבני עשרת')).toEqual({ units: 0, tens: 4, hundreds: 3, thousands: 0 });
    expect(representationOfOption('פורטים מאה אחת לעשר עשרות')).toBeNull();
  });
  it('the instruction\'s blocks as a wrong option, or other blocks as the right one', () => {
    const opt = (t: string, c: boolean) => ({ option_text: t, is_correct: c });
    expect(requiredRepresentationContradicted(facts, [opt('בונים 34 עשרות', true), opt('בונים 3 מאות ו-4 עשרות', false), opt('כותבים 34', false)])).toBe(true);
    expect(requiredRepresentationContradicted(facts, [opt('בונים 3 מאות ו-4 עשרות', true), opt('בונים 34 עשרות', false), opt('כותבים 34', false)])).toBe(false);
    expect(requiredRepresentationContradicted({ task_kind: 'addition', required_counts: null }, [opt('בונים 34 עשרות', true)])).toBe(false);
  });
});

describe('the weekly report speaks Hebrew only (13-10)', () => {
  it('every validator reason has a Hebrew label; no code or English sentence is printed', () => {
    expect(validatorReasonLabelHe('form: a wrong option\'s feedback must be ONE question')).toBe('רמז עם יותר משאלה אחת');
    expect(validatorReasonLabelHe('frame: this is a level-1 card — the question …')).toBe('כרטיס כללי שמזכיר את הטור שבו הקושי');
    expect(validatorReasonLabelHe('something new')).toBe(OTHER_REASON_HE);
    const r = buildAiRejectionsReport([
      { exercise_id: 's5_g_t1', meeting: 5, reason: 'form: a wrong option\'s feedback must be ONE question', outcome: 'language_reject', card_text: '{}', created_at_ms: 1 },
      { exercise_id: 's1_r_value368', meeting: 1, reason: 'final answer leaked', outcome: 'static_reject', card_text: 'x', created_at_ms: 2 },
    ], { from_ms: 0, to_ms: 10 });
    const printed = aiRejectionsReportHtml(r) + aiRejectionsReportLines(r).join('\n');
    expect(printed).not.toMatch(/language_reject|static_reject|feedback must|final answer/);
    expect(printed).toContain('כרטיס קבוע שנדחה בבדיקה במחשב של הלומד');
  });
});
