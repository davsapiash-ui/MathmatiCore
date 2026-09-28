/**
 * The server clock read stays bounded (AGENTS.md invariant 2, offline first):
 * while the database is unreachable the handshake never comes, and meeting 3's
 * opening awaits the read. After SERVER_CLOCK_TIMEOUT_MS (4 s) the last known
 * offset is used, and the clock still counts as unknown — so the teacher's
 * client decides no time limit on this device's own clock. A handshake that
 * arrives later is taken up by the same listener.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const info = vi.hoisted(() => ({ callback: null as null | ((snap: unknown) => void), listens: 0, gets: 0 }));

vi.mock('firebase/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/database')>();
  return {
    ...actual,
    get: vi.fn((...args: Parameters<typeof actual.get>) => {
      info.gets++;
      return actual.get(...args);
    }),
    onValue: vi.fn((r: unknown, cb: (snap: unknown) => void, ...rest: unknown[]) => {
      if (String(r).includes('.info/serverTimeOffset')) {
        info.listens++;
        info.callback = cb; // the handshake never comes until the test sends it
        return () => {};
      }
      return (actual.onValue as (...a: unknown[]) => () => void)(r, cb, ...rest);
    }),
  };
});

import { fetchServerClockOffset, isServerClockKnown, serverNow } from '@/infrastructure/firebase';

describe('the server clock read is bounded to 4 seconds', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('no handshake: resolves with the last known offset (0) after 4 s, and the clock stays unknown', async () => {
    let settled: number | null = null;
    void fetchServerClockOffset().then((v) => { settled = v; });

    await vi.advanceTimersByTimeAsync(3999);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(0);
    expect(isServerClockKnown()).toBe(false);
    expect(info.listens).toBe(1);
    expect(info.gets).toBe(0);
  });

  it('a handshake that arrives later is taken up by the same listener', async () => {
    info.callback!({ val: () => 90_000 });
    expect(isServerClockKnown()).toBe(true);
    expect(serverNow() - Date.now()).toBe(90_000);
    await expect(fetchServerClockOffset()).resolves.toBe(90_000);
    expect(info.listens).toBe(1);
  });
});
