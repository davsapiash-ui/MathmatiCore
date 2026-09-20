import { describe, it, expect } from 'vitest';
import { isClassSessionLive, TEACHER_DISCONNECT_GRACE_MS } from '../classSession';

/**
 * Module 14 + pilot policy: an open class session survives momentary teacher
 * disconnects and closes only after 5 continuous offline minutes.
 */
describe('Module 14: class session 5-minute teacher-disconnect grace window', () => {
  const now = 1_000_000_000;

  it('inactive or missing session is never live', () => {
    expect(isClassSessionLive(null, now)).toBe(false);
    expect(isClassSessionLive(undefined, now)).toBe(false);
    expect(isClassSessionLive({ active: false }, now)).toBe(false);
    expect(isClassSessionLive({}, now)).toBe(false);
  });

  it('active session with a connected teacher (no stamp) is live', () => {
    expect(isClassSessionLive({ active: true, sessionNumber: 3 }, now)).toBe(true);
    expect(isClassSessionLive({ active: true, teacherDisconnectedAt: null }, now)).toBe(true);
  });

  it('survives a momentary disconnect within the grace window', () => {
    const stamp = now - 30_000; // 30 seconds offline
    expect(isClassSessionLive({ active: true, teacherDisconnectedAt: stamp }, now)).toBe(true);
    const edge = now - TEACHER_DISCONNECT_GRACE_MS; // exactly at the window's end
    expect(isClassSessionLive({ active: true, teacherDisconnectedAt: edge }, now)).toBe(true);
  });

  it('closes once the teacher stays disconnected beyond the window', () => {
    const stale = now - TEACHER_DISCONNECT_GRACE_MS - 1;
    expect(isClassSessionLive({ active: true, teacherDisconnectedAt: stale }, now)).toBe(false);
  });

  it('the window is 15 minutes — a full working block of meetings 3–7 (owner, 20.9.2026)', () => {
    // Nothing changes on the learners' screens while it runs; it is the time the
    // class is protected from the teacher's own connection. Five minutes was
    // shorter than one working block, so a Wi-Fi drop mid-meeting cut twelve
    // children off before they finished.
    expect(TEACHER_DISCONNECT_GRACE_MS).toBe(15 * 60 * 1000);
  });

  it('a longer window cannot make a lesson run longer: the 45-minute cap still closes it', () => {
    const startedAt = now - (44 * 60 * 1000);
    // Teacher dropped a minute ago, well inside the window.
    const rec = { active: true, startedAt, teacherDisconnectedAt: now - 60_000 };
    expect(isClassSessionLive(rec, now)).toBe(true);
    expect(isClassSessionLive(rec, startedAt + 45 * 60 * 1000)).toBe(false);
  });
});
