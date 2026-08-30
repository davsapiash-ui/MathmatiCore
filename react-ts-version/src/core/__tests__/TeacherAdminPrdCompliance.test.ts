import { describe, it, expect } from 'vitest';
import { getSessionDurationMinutes } from '../classSession';
import { session2DocId } from '../teacherGate';
import { getCognitiveGlyph } from '@/presentation/pages/TeacherDashboard/components/HeatmapGrid';

/**
 * Teacher & admin surfaces — exact PRD v7.1 compliance guards.
 */
describe('Module 14 §ב/§ב1: session durations drive the teacher deadline notice', () => {
  it('session 1 sandbox is 20 minutes', () => {
    expect(getSessionDurationMinutes(1)).toBe(20);
  });

  it('sessions 2 and 8 are 25 minutes', () => {
    expect(getSessionDurationMinutes(2)).toBe(25);
    expect(getSessionDurationMinutes(8)).toBe(25);
  });

  it('sessions 3 through 7 are 15 minutes', () => {
    for (const n of [3, 4, 5, 6, 7]) {
      expect(getSessionDurationMinutes(n)).toBe(15);
    }
  });

  it('the popup value X is never a constant — it differs per session', () => {
    const values = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(getSessionDurationMinutes));
    expect(values).toEqual(new Set([20, 25, 15]));
  });
});

describe('Module 20: SessionDocument is the sole source of truth for the gate', () => {
  it('resolves the canonical session-2 document id for a learner', () => {
    expect(session2DocId('student_user7')).toBe('session_02_student_7');
    expect(session2DocId('student_3')).toBe('session_02_student_3');
    expect(session2DocId('11')).toBe('session_02_student_11');
  });
});

describe('Module 18: cognitive glyph mapping is exactly ח / ר / מ', () => {
  it('maps each canonical error_category to its Hebrew glyph', () => {
    expect(getCognitiveGlyph('calculation')?.glyph).toBe('ח');
    expect(getCognitiveGlyph('procedural')?.glyph).toBe('ר');
    expect(getCognitiveGlyph('conceptual')?.glyph).toBe('מ');
  });

  it('renders nothing when no classification exists', () => {
    expect(getCognitiveGlyph(null)).toBeNull();
    expect(getCognitiveGlyph(undefined)).toBeNull();
    expect(getCognitiveGlyph('')).toBeNull();
  });
});
