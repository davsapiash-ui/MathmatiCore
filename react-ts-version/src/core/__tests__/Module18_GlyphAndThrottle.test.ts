import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeatmapGrid, getCognitiveGlyph } from '@/presentation/pages/TeacherDashboard/components/HeatmapGrid';

const mockDbUpdates: Array<{ path: string; data: any }> = [];

vi.mock('firebase/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/database')>();
  return {
    ...actual,
    update: vi.fn(async (r: any, val: any) => {
      mockDbUpdates.push({ path: r.key || (r.toString ? r.toString() : 'path'), data: val });
      return Promise.resolve();
    }),
  };
});

import { throttledRtdbUpdate, resetThrottledWrites } from '@/infrastructure/services/ThrottledRtdbWriter';

describe('Master PRD — Module 18: Silent Radar Additions (Glyphs & Write Throttling)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbUpdates.length = 0;
    resetThrottledWrites();
  });

  afterEach(() => {
    resetThrottledWrites();
    vi.useRealTimers();
  });

  describe('Module 18(e): Cognitive Glyph Mapping (ח / ר / מ)', () => {
    it('maps calculation errors strictly to "ח"', () => {
      const res = getCognitiveGlyph('calculation');
      expect(res).not.toBeNull();
      expect(res?.glyph).toBe('ח');
      expect(res?.title).toContain('חישוב');
    });

    it('maps procedural/component errors strictly to "ר"', () => {
      const res = getCognitiveGlyph('procedural');
      expect(res).not.toBeNull();
      expect(res?.glyph).toBe('ר');
      expect(res?.title).toContain('מיומנות רכיב');
    });

    it('maps conceptual/structural errors strictly to "מ"', () => {
      const res = getCognitiveGlyph('conceptual');
      expect(res).not.toBeNull();
      expect(res?.glyph).toBe('מ');
      expect(res?.title).toContain('מבנה עשרוני');
    });

    it('returns null when errorCategory is null, undefined, or empty', () => {
      expect(getCognitiveGlyph(null)).toBeNull();
      expect(getCognitiveGlyph(undefined)).toBeNull();
      expect(getCognitiveGlyph('')).toBeNull();
      expect(getCognitiveGlyph('unknown_category')).toBeNull();
    });

    it('actually renders the glyph "ח" in the DOM on the student grid cell when errorCategory is "calculation"', () => {
      const mockStudents = Array.from({ length: 12 }, (_, index) => {
        const studentNum = index + 1;
        return {
          id: `student_${studentNum}`,
          studentNumber: studentNum,
          displayName: `תלמיד ${studentNum}`,
          sessionNumber: 1,
          currentPath: 'ירוק' as const,
          status: 'active' as const,
          hesitationSeconds: 0,
          errorCount: 0,
          physicalOverride: false,
          isStruggling: false,
          isSocraticActive: false,
          errorCategory: studentNum === 1 ? ('calculation' as const) : null,
          lastAction: '',
          isOnline: true,
        };
      });

      const html = renderToString(React.createElement(HeatmapGrid as any, { initialStudents: mockStudents }));

      // Assert glyph element exists for student 1 with character 'ח' and title
      expect(html).toContain('data-testid="glyph-student-1"');
      expect(html).toContain('ח');
      expect(html).toContain('title="שגיאת חישוב בסיסי (ח)"');

      // Assert students without errors do not render a glyph element
      expect(html).not.toContain('data-testid="glyph-student-2"');
    });
  });

  describe('Module 18(c): 1000ms Client RTDB Write Throttle', () => {
    it('throttles rapid repeated writes to at most 1 write per 1000ms window with trailing edge payload', async () => {
      vi.useFakeTimers();

      const testPath = 'users/students/student_test_throttle_1';

      // 1st write: fires immediately
      throttledRtdbUpdate(testPath, { activeStep: 1, lastAction: 'Action 1' });
      expect(mockDbUpdates).toHaveLength(1);
      expect(mockDbUpdates[0].data).toEqual({ activeStep: 1, lastAction: 'Action 1' });

      // 5 rapid writes within 500ms
      for (let i = 2; i <= 6; i++) {
        vi.advanceTimersByTime(80);
        throttledRtdbUpdate(testPath, { activeStep: i, lastAction: `Action ${i}` });
      }

      // No new write should have fired yet during the active 1000ms window
      expect(mockDbUpdates).toHaveLength(1);

      // Advance time to complete the 1000ms window
      vi.advanceTimersByTime(600);

      // Trailing write should now have fired with the latest merged payload
      expect(mockDbUpdates).toHaveLength(2);
      expect(mockDbUpdates[1].data).toEqual({ activeStep: 6, lastAction: 'Action 6' });

      // After 1000ms has elapsed, a new write executes immediately
      vi.advanceTimersByTime(1100);
      throttledRtdbUpdate(testPath, { activeStep: 7, lastAction: 'Action 7' });
      expect(mockDbUpdates).toHaveLength(3);
      expect(mockDbUpdates[2].data).toEqual({ activeStep: 7, lastAction: 'Action 7' });
    });
  });
});
