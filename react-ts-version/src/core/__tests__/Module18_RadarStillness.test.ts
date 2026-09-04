import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * PRD Module 18 — "התו אינו מהבהב, אינו זז ואינו משנה את גודל המשבצת", and the
 * radar is driven "באמצעות שינוי צבעי הרקע של המשבצות בלבד ללא תזוזה של רכיבי
 * הממשק או יצירת רעש חזותי". מסמך 04 §3ב says the same in interface terms:
 * "חיוויי צבע חלקים ואיטיים (מניעת תנועה מהירה המסיחה את דעת המורה בכיתה)".
 *
 * Eight elements pulsed, including the "מחובר" and "פעיל" dots — the normal
 * state of most of the class — so ten cells throbbed at once and nothing stood
 * out. The grid is still now; the one exception is the blue call-for-help
 * legend, which breathes slowly (2s) because it marks a learner actually
 * waiting for the teacher.
 */
const src = readFileSync(
  resolve(__dirname, '../../presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx'),
  'utf-8'
);
const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf-8');

describe('Module 18: the radar is still', () => {
  it('no cell tag, status dot or banner pulses or pings any more', () => {
    // The single remaining pulse is the export button's in-flight spinner,
    // which is a transient action indicator and not part of the radar grid.
    const pulses = src.match(/animate-pulse/g) || [];
    expect(pulses).toHaveLength(1);
    expect(src).toContain("isExportingDataset ? 'animate-pulse' : ''");
    expect(src).not.toContain('animate-ping');
  });

  it('the states that describe most of the class are static', () => {
    for (const title of ['title="מחובר בלובי"', 'title="פעיל ותקין"', 'title="חניכה סוקרטית פעילה"', 'title="ממתין לאישור מסלול למפגש 3"']) {
      const at = src.indexOf(title);
      expect(at, title).toBeGreaterThan(-1);
      // Nothing animated in the 200 characters of markup around each tag.
      expect(src.slice(Math.max(0, at - 200), at + 200), title).not.toMatch(/animate-(pulse|ping|bounce|spin)/);
    }
  });

  it('the blue call for help breathes slowly rather than blinking', () => {
    expect(src).toContain('animate-radar-call');
    expect(css).toContain('.animate-radar-call');
    expect(css).toMatch(/animation: radar-call 2s ease-in-out infinite/);
    expect(css).toMatch(/@keyframes radar-call/);
  });

  it('the slow breath respects prefers-reduced-motion', () => {
    const at = css.indexOf('.animate-radar-call {');
    expect(css.slice(at, at + 400)).toContain('prefers-reduced-motion');
  });
});
