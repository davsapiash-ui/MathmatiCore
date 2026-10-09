import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { CATCHUP_COLLECTION, CATCHUP_NOTE_MAX_LENGTH, CATCHUP_REASON_KEYS, catchUpDocId } from '@/core/catchUp';

/**
 * Catch-up time (owner, 2.10.2026): "המורה יקח את אותם ילדים שלא סיימו למפגש
 * נוסף \ זמן נוסף וזה יתועד מה הסיבה לכך".
 *
 * The rules of catchup_records, read as text against the shared contract
 * (core/catchUp.ts). The behaviour itself runs against the emulator in
 * src/__tests__/emulator/CatchUpRecordsRules.live.test.ts.
 */
const rules = readFileSync(resolve(__dirname, '../../../..', 'firestore.rules'), 'utf-8');

const section = (from: string, to: string) => {
  const start = rules.indexOf(from);
  expect(start).toBeGreaterThan(-1);
  const end = rules.indexOf(to, start);
  expect(end).toBeGreaterThan(start);
  return rules.slice(start, end);
};

const block = () => section(`match /${CATCHUP_COLLECTION}/{docId}`, '// Module 23 — the class report');
const roundRule = () => section('function isValidCatchUpRound', 'function isValidCatchUpDoc');

describe('catchup_records — the rules follow the contract', () => {
  it('the closed list of reasons is the contract list, in the same order', () => {
    const list = section('function catchUpReasonKeys', 'function isValidCatchUpRound');
    expect(list).toContain(`[${CATCHUP_REASON_KEYS.map((k) => `'${k}'`).join(', ')}]`);
  });

  it('the note cap is the contract cap', () => {
    expect(roundRule()).toContain(`round.note.size() <= ${CATCHUP_NOTE_MAX_LENGTH}`);
  });

  it('a round has exactly the contract fields, the teacher as the recorder and the server fields null', () => {
    const r = roundRule();
    for (const f of ['action', 'reason', 'note', 'stopped_at', 'recorded_by', 'recorded_at', 'opened_at', 'closed_at', 'closed_by', 'active_minutes']) {
      expect(r).toContain(`'${f}'`);
    }
    expect(r).toContain('round.keys().hasOnly([');
    expect(r).toContain('round.keys().hasAll([');
    expect(r).toContain("round.action in ['reopen', 'continue']");
    expect(r).toContain('round.recorded_by == request.auth.uid');
    expect(r).toContain('round.recorded_at is number');
    for (const f of ['opened_at', 'closed_at', 'closed_by', 'active_minutes']) expect(r).toContain(`round.${f} == null`);
  });

  it('the document id is the session document spelling of its learner and meeting', () => {
    const doc = section('function isValidCatchUpDoc', `match /${CATCHUP_COLLECTION}/{docId}`);
    expect(doc).toContain("docId == 'session_0' + string(d.session_number) + '_student_' + string(d.student_id)");
    // The rule's spelling is catchUpDocId's for every meeting the rule admits (1–8).
    for (let m = 1; m <= 8; m++) expect(catchUpDocId(m, 4)).toBe(`session_0${m}_student_4`);
    // The teacher's fields, plus the server's score fields (PRD 14 §ב0), which a teacher never writes:
    expect(doc).toContain("d.keys().hasOnly(['student_id', 'session_number', 'class_id', 'rounds',");
    expect(doc).toContain("'score_percent', 'previous_score_percent', 'scored_at',");
    expect(block()).toContain("request.resource.data.keys().hasOnly(['student_id', 'session_number', 'class_id', 'rounds'])");
    expect(block()).toContain("request.resource.data.diff(resource.data).affectedKeys().hasOnly(['rounds'])");
  });

  it('only the teacher of the class writes; a create carries one round, an update adds exactly one and changes none', () => {
    const b = block();
    expect(b).toContain('allow create: if isTeacherOfClass(request.resource.data.class_id)');
    expect(b).toContain('request.resource.data.rounds.keys().size() == 1');
    expect(b).toContain('allow update: if isTeacherOfClass(resource.data.class_id)');
    expect(b).toContain(".affectedKeys().hasOnly(['rounds'])");
    expect(b).toContain('.removedKeys().size() == 0');
    expect(b).toContain('.changedKeys().size() == 0');
    expect(b).toContain('.addedKeys().size() == 1');
    expect(b).toContain('allow delete: if false;');
  });

  it('the class teacher reads it (PRD 23א §ו); learners have no rule that lets them in', () => {
    const b = block();
    expect(b).toContain('allow read: if isClassTeacherReading();');
    expect(b).not.toContain('isOwningStudent');
    expect(b).not.toContain('isOwningSession');
  });
});
