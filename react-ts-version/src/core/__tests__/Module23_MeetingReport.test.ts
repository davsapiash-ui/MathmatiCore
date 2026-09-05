import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * PRD Module 23 §ב, as amended by the product owner on 4.9.2026 (register
 * item 7): the teacher can request the AI report for ANY meeting of a learner
 * from "דו"חות אבחון אישיים", and the report is built from that meeting's own
 * telemetry — all of it.
 *
 * Pinned from source because the functions package compiles under its own
 * tsconfig (see Module23_ReportAnalysis).
 */
const server = readFileSync(resolve(__dirname, '../../../../functions/src/pedagogicalReport.ts'), 'utf-8');
const metrics = readFileSync(resolve(__dirname, '../../../../functions/src/meetingMetrics.ts'), 'utf-8');
const service = readFileSync(resolve(__dirname, '../../infrastructure/services/LearnerJourneyService.ts'), 'utf-8');
const journey = readFileSync(resolve(__dirname, '../../presentation/pages/TeacherDashboard/components/LearnerJourney.tsx'), 'utf-8');

describe('Module 23 — report for every meeting (server)', () => {
  it('reads the whole meeting, not a single page of 100 events', () => {
    expect(server).not.toMatch(/where\("session_id", "==", sessionId\)\s*\.limit\(100\)/);
    expect(server).toMatch(/async function readAllTelemetryForSession/);
    expect(server).toMatch(/for \(let page = 0; page < TELEMETRY_MAX_PAGES; page\+\+\)/);
  });

  it('applies the PRD first-attempt rule when the meeting has no session document', () => {
    // "PROBLEM_COMPLETE … שלא קדם לו אף DIGIT_ENTERED עם is_correct === false באותו exercise_id"
    expect(metrics).toContain('export function computeFirstAttemptScore(');
    expect(metrics).toMatch(/ev\.event_type === "DIGIT_ENTERED" && ev\.details\?\.is_correct === false/);
    expect(metrics).toMatch(/ev\.event_type === "PROBLEM_COMPLETE" && !wrongBeforeComplete\.has\(exId\)/);
    expect(metrics).toContain('export const DIAGNOSTIC_COMPULSORY_COUNT = 7;');
    expect(server).toMatch(/const first = computeFirstAttemptScore\(telemetryDocs, compulsoryTotal\);/);
    expect(server).toMatch(/scoreSource = "telemetry_first_attempt"/);
  });

  it('takes the learner number and the meeting number explicitly, and never silently falls back to learner 1', () => {
    expect(server).toMatch(/studentId: explicitStudentId \} = request\.data/);
    expect(server).toContain('throw new HttpsError("invalid-argument", "Missing studentId (1-12).");');
    expect(server).not.toMatch(/replace\(\/\\D\/g, ''\) \|\| '1'/);
  });

  it('keeps layer 1 deterministic and layer 2 behind the exact PRD fallback', () => {
    expect(server).toContain('if (score < 50) {');
    expect(server).toContain('report.ai_fallback_text || EXACT_AI_FALLBACK_TEXT');
  });

  it('stores the analysis on the report document so the page can show it without regenerating', () => {
    expect(server).toMatch(/knowledge_gaps: report\.knowledge_gaps,\s*teaching_recommendations: report\.teaching_recommendations,/);
    expect(server).toMatch(/exercise_narratives: exerciseNarratives,/);
  });
});

describe('Module 23 — report for every meeting (teacher page)', () => {
  it('offers the report on the selected meeting, keyed by that meeting\'s telemetry session_id', () => {
    expect(journey).toMatch(/const meetingSessionId = sessionEvents\.length > 0 \? sessionEvents\[0\]\.sessionId : null;/);
    expect(journey).toMatch(/generateMeetingReport\(\{ studentNum, sessionNumber: selectedSession, sessionId: meetingSessionId \}\)/);
    expect(journey).toContain('הפק דוח למפגש ${selectedSession}');
  });

  it('shows the PRD texts: processing fallback and AI-unavailable fallback', () => {
    expect(service).toContain("export const REPORT_PROCESSING_TEXT = 'הדוח בעיבוד כעת, אנא נסו שוב בעוד מספר רגעים';");
    expect(service).toContain("export const AI_FALLBACK_TEXT = 'הניתוח הפדגוגי המפורט אינו זמין כעת. ההמלצות שלהלן מבוססות על מדדי הביצוע.';");
    expect(journey).toMatch(/reportState === 'error' && \([\s\S]*?\{REPORT_PROCESSING_TEXT\}/);
    expect(journey).toMatch(/report\.aiAnalysisAvailable \? \([\s\S]*?\{AI_FALLBACK_TEXT\}/);
  });

  it('shows the report content in the page itself, not only as a PDF', () => {
    for (const field of ['scorePercent', 'routingLabelHe', 'recommendationDetailsHe', 'exerciseNarratives', 'knowledgeGaps', 'teachingRecommendations']) {
      expect(journey).toContain(`report.${field}`);
    }
  });

  it('calls the deployed functions by their names', () => {
    expect(service).toContain("httpsCallable(functions, 'generatePedagogicalReportPDF'");
    expect(service).toContain("httpsCallable(functions, 'getPedagogicalReportDownloadUrl')");
  });
});
