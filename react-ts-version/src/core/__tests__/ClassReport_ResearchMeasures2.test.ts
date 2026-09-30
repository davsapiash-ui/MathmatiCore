import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { RESEARCH_MEASURES_HE } from '@/infrastructure/services/ClassReportService';

/**
 * Owner, 30.9.2026: research measure 2 has two parts — 2א התמדה (exercises
 * with a mistake solved without the silent help call) and 2ב תיקון עצמי (the
 * Module 16 §ב formula). Every report names each measure with the same words
 * and one sentence on what it says, and the learner's take-back of a help
 * call is logged as research data.
 */
const REPO = resolve(__dirname, '../../../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf-8').replace(/\r\n/g, '\n');

describe('measure 2א and 2ב — the teacher reads the same words everywhere', () => {
  it('the dashboard panel keeps the server\'s names and sentences word for word', () => {
    const server = read('functions/src/meetingMetrics.ts');
    expect(RESEARCH_MEASURES_HE.map((m) => m.key)).toEqual(['persistence', 'self_correction', 'flexibility', 'mediation']);
    for (const m of RESEARCH_MEASURES_HE) {
      expect(server).toContain(m.label);
      expect(server).toContain(m.explanation.replace(/"/g, '\\"'));
    }
  });

  it('the panel shows 2א and 2ב as two columns, and no longer one "התמדה וויסות עצמי" column', () => {
    const panel = read('react-ts-version/src/presentation/pages/TeacherDashboard/components/ClassMeetingReportPanel.tsx');
    expect(panel).toContain('<th>2א. התמדה</th><th>2ב. תיקון עצמי</th>');
    expect(panel).not.toContain('התמדה וויסות עצמי');
  });
});

describe('the take-back of a silent help call is research data (owner, 30.9.2026)', () => {
  it('is logged on the second press, allowed by the rules, and counted by the server', () => {
    const store = read('react-ts-version/src/application/useWorkspaceStore.ts');
    const start = store.indexOf("'Student took back the silent help call'");
    expect(start).toBeGreaterThan(0);
    expect(store.slice(start, start + 900)).toContain("emitScaffoldEvent(get(), 'HELP_WITHDRAWN'");
    expect(read('firestore.rules')).toContain("'HELP_WITHDRAWN'");
    expect(read('functions/src/meetingMetrics.ts')).toContain('case "HELP_WITHDRAWN": s.help_withdrawals++; break;');
  });
});
