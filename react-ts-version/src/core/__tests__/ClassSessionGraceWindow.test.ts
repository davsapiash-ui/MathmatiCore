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
    const edge = now - TEACHER_DISCONNECT_GRACE_MS; // exactly 5 minutes
    expect(isClassSessionLive({ active: true, teacherDisconnectedAt: edge }, now)).toBe(true);
  });

  it('closes after the teacher stays disconnected beyond 5 minutes', () => {
    const stale = now - TEACHER_DISCONNECT_GRACE_MS - 1;
    expect(isClassSessionLive({ active: true, teacherDisconnectedAt: stale }, now)).toBe(false);
  });

  it('grace window is exactly 5 minutes', () => {
    expect(TEACHER_DISCONNECT_GRACE_MS).toBe(5 * 60 * 1000);
  });
});
