import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Module 24 — the research export, as the product owner defined the research
 * on 5.9.2026: "כל הסביבה והתהליך", every meeting of every learner, not only
 * the routing decision of meetings 2 and 8.
 *
 * Until then the export read at most 500 telemetry rows (one page, once),
 * used a lexicographic ">=" filter that did not select a meeting at all, and
 * had a score only for meetings with a session document (meeting 2).
 *
 * Pinned from source: the functions package compiles under its own tsconfig.
 */
const server = readFileSync(resolve(__dirname, '../../../../functions/src/exportDriveReport.ts'), 'utf-8');
const metrics = readFileSync(resolve(__dirname, '../../../../functions/src/meetingMetrics.ts'), 'utf-8');
const radar = readFileSync(resolve(__dirname, '../../presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx'), 'utf-8');

const exportSection = server.slice(server.indexOf('export const exportResearchDataset'));

describe('Module 24 — research export covers the whole process', () => {
  it('reads every document, never a single page of 500', () => {
    expect(exportSection).not.toMatch(/\.limit\(500\)/);
    expect(exportSection).not.toMatch(/where\("session_id", ">=",/);
    expect(exportSection).toMatch(/await readAllDocs\(db\.collection\("telemetry_logs"\)\)/);
    expect(metrics).toMatch(/export async function readAllDocs[\s\S]*?for \(let page = 0; page < MAX_PAGES; page\+\+\)/);
  });

  it('exports all meetings by default and one meeting on request', () => {
    expect(exportSection).toMatch(/rawSession === "all" \? null : Number\(rawSession\) \|\| null/);
    expect(exportSection).toMatch(/scopedSession === null \|\| e\.session_number === scopedSession/);
    expect(radar).toContain("exportFn({ class_id: 'class_1', session_number: 'all' })");
  });

  it('writes one row per learner × meeting with the PRD first-attempt score for every meeting', () => {
    expect(exportSection).toMatch(/const score = computeFirstAttemptScore\(events, compulsory\);/);
    expect(exportSection).toMatch(/const summary = summarizeMeeting\(events\);/);
    for (const col of [
      'first_attempt_score_percent', 'compulsory_total', 'active_minutes', 'wrong_digits', 'undos', 'deletions',
      'hesitations', 'socratic_cards', 'regroupings', 'recording_minutes', 'learning_path', 'session_doc_score_percent',
    ]) {
      expect(exportSection).toContain(`${col}:`);
    }
  });

  it('exports five files: actions, meetings, recordings, reflections, reset log', () => {
    for (const name of ['פעולות', 'מפגשים', 'הקלטות', 'רפלקציות', 'יומן_איפוסים']) {
      expect(exportSection).toContain(`{ name: "${name}"`);
    }
  });

  it('collects reflections from every place a learner writes them', () => {
    expect(exportSection).toMatch(/readAllDocs\(db\.collection\("srl_reflections"\)\)/);
    expect(exportSection).toMatch(/rtdb\.ref\("reflections"\)\.get\(\)/);
    expect(exportSection).toContain('source: "rtdb_student"');
  });

  it('keeps the PII gate, the class scope and the audit entry', () => {
    expect(exportSection).toContain('ייצוא נתוני המחקר נדחה: זוהה מידע מזהה (PII).');
    expect(exportSection).toMatch(/callerClassId !== class_id/);
    expect(exportSection).toMatch(/reset_level: "export",/);
  });

  it('lands under the research folder, never the Drive root', () => {
    expect(exportSection).toMatch(/resolveDriveFolder\(\[DRIVE_FOLDERS\.researchData, scopeLabel, exportDate\]\)/);
  });
});
