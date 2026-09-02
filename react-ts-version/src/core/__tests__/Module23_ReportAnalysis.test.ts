import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * PRD Module 23 — the pedagogical report is built from two INDEPENDENT layers,
 * and the spec forbids mixing them:
 *
 *   Layer 1 — the physical working group and manipulatives, decided purely by
 *     the percentage rule, server-side, with no AI involvement. Deterministic.
 *   Layer 2 — the verbal analysis of knowledge gaps and teaching
 *     recommendations, authored by the AI engine, which is forbidden from
 *     altering or contradicting layer 1.
 *
 * Layer 2 previously had no server implementation at all: the types existed and
 * the fallback sentence existed, so every report ever produced showed the
 * fallback. The spec permits that sentence only on engine failure or timeout —
 * never as the standing state.
 *
 * These tests pin the shipped implementation from source, the way
 * Module20_GateSingleWriter does, because the functions package compiles under
 * its own tsconfig and cannot be imported into the frontend bundle.
 */
const fnSrc = (rel: string) =>
  readFileSync(resolve(__dirname, '../../../../functions/src/', rel), 'utf-8');

describe('Module 23: pedagogical report, layer 2 (AI verbal analysis)', () => {
  const analysis = fnSrc('reportAnalysis.ts');
  const report = fnSrc('pedagogicalReport.ts');

  it('implements the PRD tier boundaries, with 75 itself in the middle band', () => {
    // "ציון > 75%" with an explicit "(לא כולל 75)" — so 75 is between_50_75.
    expect(analysis).toContain('if (scorePercent < 50) return "below_50";');
    expect(analysis).toContain('if (scorePercent <= 75) return "between_50_75";');
    expect(analysis).toContain('return "above_75";');
  });

  it('carries the PRD response contract exactly', () => {
    expect(analysis).toContain('knowledge_gaps: string[]');
    expect(analysis).toContain('teaching_recommendations: string[]');
    expect(analysis).toContain('recommendation_tier: RecommendationTier');
    expect(analysis).toContain('failed_exercises: ReportExerciseTemplate[]');
    expect(analysis).toContain('telemetry_summary: ReportTelemetryEvent[]');
  });

  it('forbids the engine from contradicting layer 1', () => {
    expect(analysis).toContain('חל עליך איסור מוחלט לשנות, לסתור');
    // Layer 1's decision is stated to the model as a fixed constraint.
    expect(analysis).toContain('TIER_FRAMEWORK_HE[tier]');
  });

  it('never lets the engine fail the report', () => {
    // Every failure path returns null rather than throwing.
    expect(analysis).toContain('Promise<GeminiReportResponse | null>');
    expect(analysis).toContain('AI_ANALYSIS_TIMEOUT_MS');
    expect(analysis).toContain('Promise.race([call, timeout])');
    // A malformed response is treated exactly like a failed call.
    expect(analysis).toContain('export function parseAnalysisResponse');
  });

  it('keeps the fallback sentence verbatim, and only for the unavailable case', () => {
    expect(report).toContain(
      'export const EXACT_AI_FALLBACK_TEXT = "הניתוח הפדגוגי המפורט אינו זמין כעת. ההמלצות שלהלן מבוססות על מדדי הביצוע.";'
    );
    // The renderer prefers the analysis and falls back only when both arrays are empty.
    expect(report).toContain('if (gaps.length > 0 || teaching.length > 0) {');
    expect(report).toContain('report.ai_fallback_text || EXACT_AI_FALLBACK_TEXT');
  });

  it('binds the Gemini credential to the report function', () => {
    // A v2 handler only receives the secret when it declares it; without this
    // the key reads back undefined and every report silently falls back.
    expect(report).toContain('onCall(GEMINI_SECRETS, async (request)');
  });

  it('keeps layer 1 deterministic and free of engine involvement', () => {
    const layer1Start = report.indexOf("let routingGroup =");
    const layer1End = report.indexOf('// ---- Module 23 layer 2');
    expect(layer1Start).toBeGreaterThan(-1);
    expect(layer1End).toBeGreaterThan(layer1Start);
    const layer1 = report.slice(layer1Start, layer1End);
    expect(layer1).not.toContain('generateReportAnalysis');
    expect(layer1).not.toContain('Gemini');
    // The three PRD bands, decided by score alone.
    expect(layer1).toContain('if (score < 50)');
    expect(layer1).toContain('} else if (score <= 75) {');
  });
});

describe('Module 23: exercise narrative (server-authored, not AI)', () => {
  const report = fnSrc('pedagogicalReport.ts');

  it('names concrete columns rather than aggregate counters alone', () => {
    expect(report).toContain('const COLUMN_NAMES_HE = ["אחדות", "עשרות", "מאות", "אלפים"];');
    expect(report).toContain('בטור ה${where}');
  });

  it('covers every event the PRD requires the paragraph to weave in', () => {
    // Representation, regrouping/decomposition, digits, deletions, undos,
    // prolonged hesitations, Socratic card.
    for (const eventType of [
      'BLOCK_DRAG_COMPLETE',
      'REGROUPING_SUCCESS',
      'DIGIT_ENTERED',
      'DIGIT_DELETED',
      'UNDO_EXECUTED',
      'HESITATION_DETECTED',
      'SOCRATIC_CARD_SHOWN',
    ]) {
      expect(report).toContain(`case "${eventType}":`);
    }
    expect(report).toContain('ביצע פריטה');
    expect(report).toContain('ביצע הקבצה');
    expect(report).toContain('קיבל כרטיס חניכה');
    expect(report).toContain('שניות');
  });

  it('is built from telemetry order, not from a fixed template with counters', () => {
    expect(report).toContain('telemetryDocs.sort((a, b) => (a.client_timestamp || 0) - (b.client_timestamp || 0));');
    // The old aggregate phrasing must not come back.
    expect(report).not.toContain('גרירות בלוקים');
    expect(report).not.toContain('פעולות ביטול (Undo) לבקרה עצמית');
  });
});
