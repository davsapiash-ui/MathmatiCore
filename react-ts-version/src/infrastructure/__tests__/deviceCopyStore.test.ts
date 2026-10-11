// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readDeviceCopy, writeDeviceCopy, removeDeviceCopy, resetDeviceCopiesForTests, deviceCopiesReady, DEVICE_COPY_PREFIX } from '@/infrastructure/services/deviceCopyStore';

/**
 * Owner, 11.10.2026 (PRD Modules 4, 8 §א, 17): this device's copies of the
 * workspace are kept in IndexedDB, not in localStorage — same keys, same JSON.
 * jsdom has no IndexedDB: the copies then live in memory, and an older
 * version's copy in localStorage is still read until it can be moved.
 */
describe('deviceCopyStore', () => {
  beforeEach(async () => {
    await deviceCopiesReady;
    localStorage.clear();
    resetDeviceCopiesForTests();
  });

  it('a copy written is read back at once, and never written to localStorage', () => {
    const key = `${DEVICE_COPY_PREFIX}u1`;
    writeDeviceCopy(key, '{"sessionNumber":4}');
    expect(readDeviceCopy(key)).toBe('{"sessionNumber":4}');
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("an older version's copy in localStorage is read until it is moved, and a removal drops it everywhere", () => {
    const key = `${DEVICE_COPY_PREFIX}u2_m5`;
    localStorage.setItem(key, '{"sessionNumber":5}');
    expect(readDeviceCopy(key)).toBe('{"sessionNumber":5}');
    removeDeviceCopy(key);
    expect(readDeviceCopy(key)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('a removed copy does not come back from localStorage', () => {
    const key = `${DEVICE_COPY_PREFIX}u3`;
    writeDeviceCopy(key, '{"a":1}');
    removeDeviceCopy(key);
    localStorage.setItem(key, '{"stale":true}');
    expect(readDeviceCopy(key)).toBeNull();
  });
});
