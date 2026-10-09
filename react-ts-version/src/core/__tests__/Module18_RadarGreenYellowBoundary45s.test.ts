/**
 * PRD Module 18 §ב (v7.9): "ירוק: הלומד ביצע פעולה ב-45 השניות האחרונות";
 * "צהוב: 45 שניות ומעלה ללא פעולה בטור הפעיל". One boundary, at 45 seconds,
 * with no gap between green and yellow.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { resolveRadarColor } from '@/core/radarColor';
import { DEFAULT_HESITATION_THRESHOLD_SECONDS } from '@/core/hesitationCalibration';

const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');
const live = { helpRequested: false, socraticActive: false, isOnline: true, sessionStarted: true };

describe('Module 18 §ב — green under 45 seconds without action, yellow from 45, no gap', () => {
  it('the default threshold is 45 seconds', () => {
    expect(DEFAULT_HESITATION_THRESHOLD_SECONDS).toBe(45);
  });

  it('every second from 0 to 44 is green and every second from 45 is yellow', () => {
    for (let s = 0; s < 45; s++) {
      expect(resolveRadarColor({ ...live, hesitationSeconds: s }), `${s}s`).toBe('GREEN');
    }
    for (const s of [45, 46, 60, 300]) {
      expect(resolveRadarColor({ ...live, hesitationSeconds: s }), `${s}s`).toBe('YELLOW');
    }
    // A colour for every value: nothing between green and yellow.
    for (let s = 0; s <= 90; s += 0.5) {
      expect(['GREEN', 'YELLOW']).toContain(resolveRadarColor({ ...live, hesitationSeconds: s }));
    }
  });

  it('the learner raises the flag at the threshold, and the radar counts it yellow from that moment', () => {
    const hook = src('application/useCognitiveHesitationRadar.ts');
    expect(hook).toMatch(/hesitating: true,[\s\S]*?\}, getHesitationThresholdSeconds\(\) \* 1000\);/);
    const grid = src('presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx');
    // The moment the flag lands, the tile reads threshold + 0 seconds: yellow.
    expect(grid).toContain('? hesitationThreshold + Math.max(0, Math.round((serverClockNow - hesitatingSince) / 1000))');
    expect(grid).not.toContain('היסוס מעל');
    expect(src('application/useTeacherStore.ts')).not.toMatch(/within last 30s/);
  });
});
