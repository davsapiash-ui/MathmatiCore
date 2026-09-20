import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { COLUMN_SCOPED_EVENTS, NON_COLUMN_EVENTS } from '@/types/telemetry';

/**
 * מודול 5 / נספח א' §3 + סטייה 19. כל אירוע טלמטריה שהלקוח שולח חייב להתקבל
 * בחוקי Firestore. שלושת אירועי הפיגומים של סטייה 19 (ADAPTIVE_GRID_TOGGLED,
 * KEYBOARD_LOCK_BLOCKED, HELP_REQUESTED) נוספו ללקוח בלבד: החוקים דחו כל אחד
 * מהם, התור ניסה חמש פעמים והחנה אותם במכשיר הלומד, והמונים שלהם בדוח הכיתה
 * ובייצוא המחקר נשארו אפס. הבדיקה הזאת מונעת מהרשימות להתרחק שוב.
 */
const rules = readFileSync(resolve(__dirname, '../../../../firestore.rules'), 'utf-8');

function rulesList(fnName: string): string[] {
  const start = rules.indexOf(`function ${fnName}(eventType)`);
  const body = rules.slice(start, rules.indexOf('];', start));
  // Quoted names on their own line only — a comment may mention an event too.
  return [...body.matchAll(/^\s*'([A-Z_]+)',?\s*$/gm)].map((m) => m[1]);
}

describe('firestore.rules accepts every telemetry event the client emits', () => {
  it('column-scoped events', () => {
    const inRules = rulesList('isColumnScopedEvent');
    expect(inRules.length).toBeGreaterThan(0);
    // UNDO_EXECUTED is accepted by its own clause (column_index optional).
    for (const e of COLUMN_SCOPED_EVENTS) expect(inRules, e).toContain(e);
  });

  it('events without a column', () => {
    const inRules = rulesList('isNonColumnEvent');
    expect(inRules.length).toBeGreaterThan(0);
    for (const e of NON_COLUMN_EVENTS) expect(inRules, e).toContain(e);
  });

  it('the rules list nothing the client does not know', () => {
    const known = new Set<string>([...COLUMN_SCOPED_EVENTS, ...NON_COLUMN_EVENTS]);
    for (const e of [...rulesList('isColumnScopedEvent'), ...rulesList('isNonColumnEvent')]) {
      expect(known.has(e), e).toBe(true);
    }
  });
});

describe('server-side guards found by the dashboard audit (20.9.2026)', () => {
  const reset = readFileSync(resolve(__dirname, '../../../../functions/src/exportDriveReport.ts'), 'utf-8');
  const studentAuth = readFileSync(resolve(__dirname, '../../../../functions/src/authenticateStudentSession.ts'), 'utf-8');

  it('all three reset levels need the teacher identity (PRD 23א §ו), level 1 included', () => {
    expect(reset).toMatch(/if \(!isTeacherIdentity\) \{\s*logger\.warn\(/);
    expect(reset).not.toContain("!isTeacherIdentity && (reset_level === 'single_student' || reset_level === 'system')");
    // The check comes before the level-1 branch does anything.
    expect(reset.indexOf('if (!isTeacherIdentity) {')).toBeLessThan(reset.indexOf("if (reset_level === 'alerts') {"));
  });

  it('learner claims are stamped on anonymous users only, never over a staff user\'s claims', () => {
    const guard = studentAuth.indexOf('if (signInProvider !== "anonymous") {');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(studentAuth.indexOf('setCustomUserClaims(uid, claims)'));
  });
});
