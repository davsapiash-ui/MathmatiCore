import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * מודול 23 §ב: הציון הוא פונקציה של הטלמטריה של המפגש. מסמך הסטיות, "פונקציות
 * הענן": "חוקי Firestore מתירים ללומד לכתוב את השדה הזה בלי הגבלת ערך — כלומר
 * ילד יכול היה לכתוב 100 ולהיות מומלץ למסלול הירוק… הציון מחושב עכשיו בשרת".
 *
 * בפועל זה לא קרה: הטריגר התנה את עצמו בכך ש-matrix_recommended_path ריק,
 * והלקוח של הילד כותב את השדה הזה באותה כתיבה עצמה שמסמנת is_completed. לכן
 * הגוף של הטריגר מעולם לא רץ, והציון שהשער פעל לפיו היה של הדפדפן.
 * ביקורת הדשבורד, 20.9.2026; אישור בעל המוצר לתיקון.
 */
const trigger = readFileSync(resolve(__dirname, '../sessionTrigger.ts'), 'utf-8');
const body = trigger.slice(0, trigger.indexOf('export const createSessionWithServerDeadline'));

describe('the server recomputes the meeting score', () => {
  it('no longer waits for a missing recommendation — it runs on every completion', () => {
    expect(body).toContain('if (!justCompleted) return;');
    expect(body).not.toContain('const needsPathEvaluation = !afterData.matrix_recommended_path;');
    expect(body).not.toContain('needsPathEvaluation');
  });

  it('reads the events by learner and meeting, not by the document id', () => {
    // sessions/session_02_student_4 vs telemetry session_2_student_student_user4.
    expect(body).toContain('readMeetingTelemetry(db, studentNum, sessionNum)');
    expect(body).not.toContain('readAllTelemetryForSession(');
  });

  it('never invents a score: no events, or no compulsory count, leaves the document alone', () => {
    const noEvents = body.indexOf('if (telemetry.length === 0)');
    const noDenominator = body.indexOf('if (computed.scorePercent === null)');
    const write = body.indexOf('session_score_percent: computed.scorePercent,');
    expect(noEvents).toBeGreaterThan(-1);
    expect(noEvents).toBeLessThan(write);
    expect(noDenominator).toBeLessThan(write);
  });

  it('the PRD 50% rule decides the path', () => {
    expect(body).toContain("const recommendedPath = computed.scorePercent >= 50 ? \"green_path\" : \"remediation_path\";");
  });

  it('mirrors the result to the learner record, which is what the teacher screens read', () => {
    // Registers 15 and 16: the RTDB record is the mirror the radar, the class
    // card and the approval drawer read. Without this they would keep the
    // client's number while the gate tab showed the server's.
    expect(body).toContain('users/students/student_user${studentNum}');
    expect(body).toContain('matrix_recommended_path: recommendedPath,');
  });

  it('does not re-enter on its own write', () => {
    expect(body).toContain('if (afterData.evaluated_at && beforeData?.is_completed === true) return;');
  });

  it('a mismatch between the client and the server is logged', () => {
    expect(body).toContain('Server value stands.');
  });
});

describe('the score stays the teacher\'s (Module 24 §ב, Module 23 §ג)', () => {
  it('no learner-facing screen reads it', () => {
    const fe = resolve(__dirname, '../../../react-ts-version/src');
    for (const file of [
      'features/workspace/StudentWorkspacePage.tsx',
      'features/workspace/ReflectionScreen.tsx',
      'presentation/components/student/Session8ReflectionScreen.tsx',
      'presentation/pages/StudentHub.tsx',
    ]) {
      expect(readFileSync(resolve(fe, file), 'utf-8'), file).not.toContain('session_score_percent');
    }
  });
});
