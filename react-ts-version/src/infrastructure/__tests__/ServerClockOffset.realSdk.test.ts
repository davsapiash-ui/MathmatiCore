/**
 * PRD Module 14 §ב: "השרת הוא מקור האמת היחיד והמוחלט עבור זמן המפגש".
 *
 * `fetchServerClockOffset()` read `.info/serverTimeOffset` with `get()`. `.info`
 * is local to the SDK and served only through `onValue`; `get()` sends the path
 * to the server, and the live database answers "Invalid token in path". So the
 * offset stayed 0 and `serverNow()` was every device's own clock — harmless
 * while the meeting start came from the teacher's laptop too, fatal once the
 * start is the server's (a laptop X minutes fast would close the meeting for
 * everyone after 45 − X minutes).
 *
 * This runs the real `firebase/database` module on the app's own `database`
 * (a `demo-` project on 127.0.0.1 in tests: nothing leaves the machine; see
 * src/test/noProductionNetwork.ts). `get` and `onValue` are the SDK's own,
 * wrapped only to be observed. The server's two roles are played at the
 * connection object the SDK talks to: its answer to a `get` of `.info`, and its
 * connect handshake, which carries the server time (`handleTimestamp_`).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/database')>();
  return { ...actual, get: vi.fn(actual.get), onValue: vi.fn(actual.onValue) };
});

import { get, onValue, ref } from 'firebase/database';
import { database, fetchServerClockOffset, isServerClockKnown, serverNow } from '@/infrastructure/firebase';

const MIN = 60 * 1000;

type Connection = {
  get: (query: { _path: { toString(): string } }) => Promise<unknown>;
  handleTimestamp_: (serverTime: number) => void;
};
const connection = () => (database as unknown as { _repo: { server_: Connection } })._repo.server_;
const pathOf = (r: unknown) => String((r as { toString(): string }).toString());

describe('the server clock offset is read the way the SDK serves .info', () => {
  it('get() on .info goes to the server, which refuses it — the read that used to fail', async () => {
    const serverGet = vi
      .spyOn(connection(), 'get')
      .mockImplementation((q) =>
        String(q._path.toString()).startsWith('/.info') ? Promise.reject('Invalid token in path') : Promise.resolve(null)
      );
    await expect(get(ref(database, '.info/serverTimeOffset'))).rejects.toThrow('Invalid token in path');
    expect(serverGet).toHaveBeenCalledTimes(1);
    expect(String(serverGet.mock.calls[0][0]._path.toString())).toBe('/.info/serverTimeOffset');
    serverGet.mockRestore();
  });

  it('fetchServerClockOffset() reads .info through onValue, never get(), and resolves on the handshake', async () => {
    const serverGet = vi.spyOn(connection(), 'get');
    vi.mocked(get).mockClear();
    vi.mocked(onValue).mockClear();

    const pending = fetchServerClockOffset();

    const infoListens = vi.mocked(onValue).mock.calls.filter(([r]) => pathOf(r).includes('.info/serverTimeOffset'));
    expect(infoListens).toHaveLength(1);
    expect(vi.mocked(get).mock.calls.filter(([r]) => pathOf(r).includes('.info'))).toHaveLength(0);
    expect(serverGet).not.toHaveBeenCalled();

    // The server's connect handshake: its clock is 46 minutes ahead of this device.
    connection().handleTimestamp_(Date.now() + 46 * MIN);

    const offset = await pending;
    expect(Math.abs(offset - 46 * MIN)).toBeLessThan(1000);
    expect(isServerClockKnown()).toBe(true);
    expect(Math.abs(serverNow() - (Date.now() + 46 * MIN))).toBeLessThan(1000);
    serverGet.mockRestore();
  });

  it('the listener stays attached: a later handshake refreshes the offset, with no second read', async () => {
    vi.mocked(onValue).mockClear();

    connection().handleTimestamp_(Date.now() - 46 * MIN);
    expect(Math.abs(serverNow() - (Date.now() - 46 * MIN))).toBeLessThan(1000);

    const offset = await fetchServerClockOffset();
    expect(Math.abs(offset + 46 * MIN)).toBeLessThan(1000);
    expect(vi.mocked(onValue).mock.calls.filter(([r]) => pathOf(r).includes('.info'))).toHaveLength(0);
  });
});
