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
 * out. The grid is still now. The blue call-for-help legend breathed slowly
 * while a learner called; the owner removed that too on 11.10.2026 (Module 18
 * "אינו מהבהב ואינו פועם"): the tile's colour and frame carry the call.
 */
const src = readFileSync(
  resolve(__dirname, '../../presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx'),
  'utf-8'
);
const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf-8');

describe('Module 18: the radar is still', () => {
  it('no cell tag, status dot or banner pulses or pings any more', () => {
    // Owner, 11.10.2026 (round two): no pulse at all on teacher screens — the
    // export button's in-flight pulse is gone too; its label says "מייצא...".
    expect(src).not.toContain('animate-pulse');
    expect(src).not.toContain('animate-ping');
  });

  it('the states that describe most of the class are static', () => {
    for (const title of ['title="מחובר וממתין בלובי"', 'title="פעיל ותקין"', 'title={CARD_OPEN_HE}', 'title={`ממתין ב${TEACHER_GATE_HE} לפני מפגש 3`}']) {
      const at = src.indexOf(title);
      expect(at, title).toBeGreaterThan(-1);
      // Nothing animated in the 200 characters of markup around each tag.
      expect(src.slice(Math.max(0, at - 200), at + 200), title).not.toMatch(/animate-(pulse|ping|bounce|spin)/);
    }
  });

  it('the blue call for help does not breathe either (owner, 11.10.2026)', () => {
    expect(src).not.toContain('animate-radar-call');
    expect(src).not.toMatch(/animate-(bounce|soft-heartbeat)/);
  });

  it('the slow breath respects prefers-reduced-motion', () => {
    // The rule that defines the breath (a line that starts with the class), not
    // the quiet-mode override "[data-quiet='true'] .animate-radar-call {" earlier
    // in the file, whose neighbourhood other rules can push the media query out of.
    const at = css.search(/^\s*\.animate-radar-call \{\s*animation: radar-call/m);
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, at + 400)).toContain('prefers-reduced-motion');
  });
});
