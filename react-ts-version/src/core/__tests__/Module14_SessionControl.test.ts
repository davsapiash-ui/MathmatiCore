import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getClassSessionStatus, isClassSessionLive, TEACHER_DISCONNECT_GRACE_MS } from '@/core/classSession';

/**
 * PRD Module 14 §ב0 as amended by the product owner on 6.9.2026 (register
 * item 10): a meeting has three teacher controls — start, pause, close — and
 * each one changes the learner's screen live, in place.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8');
const teacher = read('../../presentation/pages/TeacherDashboard.tsx');
const learner = read('../../features/workspace/StudentWorkspacePage.tsx');
const hub = read('../../presentation/pages/StudentHub.tsx');
const hook = read('../../application/useActiveClassSession.ts');

describe('Module 14 — class session status', () => {
  it('reads active / paused / closed from the record', () => {
    expect(getClassSessionStatus(null)).toBe('closed');
    expect(getClassSessionStatus({ active: false })).toBe('closed');
    expect(getClassSessionStatus({ active: true, sessionNumber: 3 })).toBe('active');
    expect(getClassSessionStatus({ active: true, status: 'active', sessionNumber: 3 })).toBe('active');
    expect(getClassSessionStatus({ active: true, status: 'paused', sessionNumber: 3 })).toBe('paused');
  });

  it('a paused meeting is still open (the learner waits, nothing is lost)', () => {
    expect(isClassSessionLive({ active: true, status: 'paused' })).toBe(true);
  });

  it('a paused meeting whose teacher vanished for the grace window counts as closed', () => {
    const now = 10_000_000;
    const rec = { active: true, status: 'paused' as const, teacherDisconnectedAt: now - TEACHER_DISCONNECT_GRACE_MS - 1 };
    expect(getClassSessionStatus(rec, now)).toBe('closed');
  });
});

describe('Module 14 — teacher controls', () => {
  it('offers pause, resume and close, each written to the shared session record', () => {
    expect(teacher).toMatch(/const handlePauseClassSession = async \(\) => \{[\s\S]*?update\(ref\(database, 'active_class_session'\), \{ status: 'paused', pausedAt: Date\.now\(\) \}\)/);
    expect(teacher).toMatch(/const handleResumeClassSession = async \(\) => \{[\s\S]*?update\(ref\(database, 'active_class_session'\), \{ status: 'active', pausedAt: null/);
    expect(teacher).toMatch(/status: 'closed',\s*sessionNumber: null,\s*endedAt: Date\.now\(\)/);
    expect(teacher).toContain('<span>עצור מפגש</span>');
    expect(teacher).toContain('<span>המשך מפגש</span>');
    expect(teacher).toContain('<span>סגור מפגש</span>');
  });

  it('starting a meeting stamps status active', () => {
    expect(teacher).toMatch(/active: true,\s*status: 'active',\s*sessionNumber: sessionNum/);
  });
});

describe('Module 14 — the learner sees every state in place', () => {
  it('paused → the waiting overlay over the untouched workspace', () => {
    expect(learner).toMatch(/activeClassSession\.status === 'paused' && !isTeacherOrAdmin && <SessionPausedOverlay \/>/);
  });

  it('closed → the in-place closed screen, no automatic navigation to the lobby', () => {
    expect(learner).toContain('המורה סגרה את המפגש');
    expect(learner).not.toMatch(/if \(!isTeacherSessionActive\) \{\s*navigate\('\/hub'\);/);
  });

  it('the lobby shows a paused meeting as waiting, not as enterable', () => {
    expect(hub).toMatch(/activeClassSession\.status === 'paused' \? \([\s\S]*?המורה עצרה את הפעילות לרגע/);
  });

  it('the learner re-reads the session state from the server, not only through the listener', () => {
    expect(hook).toMatch(/const refreshTimer = setInterval\(refreshFromServer, 15000\);/);
    expect(hook).toMatch(/document\.addEventListener\('visibilitychange', onVisible\);/);
    expect(hook).toMatch(/status: getClassSessionStatus\(val\)/);
  });
});
