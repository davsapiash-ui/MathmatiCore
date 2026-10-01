import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PRD Module 1 §ג (fail-closed) and the register (13.9.2026): "מחיקת מורה
 * שוללת כניסה". Deleting a whitelist entry takes the staff claims off the
 * account and revokes its refresh tokens.
 */

const h = vi.hoisted(() => ({
  users: {} as Record<string, string>, // email → uid
  listed: new Set<string>(),
  claims: [] as Array<{ uid: string; claims: Record<string, unknown> }>,
  revoked: [] as string[],
}));

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();
  const auth = {
    getUserByEmail: async (email: string) => {
      if (!(email in h.users)) throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
      return { uid: h.users[email] };
    },
    setCustomUserClaims: async (uid: string, claims: Record<string, unknown>) => { h.claims.push({ uid, claims }); },
    revokeRefreshTokens: async (uid: string) => { h.revoked.push(uid); },
  };
  const firestore = {
    collection: () => ({ doc: (id: string) => ({ get: async () => ({ exists: h.listed.has(id) }) }) }),
  };
  return { ...actual, auth: () => auth, firestore: () => firestore, default: { ...actual, auth: () => auth, firestore: () => firestore } };
});

import { revokeRemovedStaff } from '../revokeRemovedStaff';

const fire = (email: string) => (revokeRemovedStaff as any).run({ params: { email }, data: undefined });

describe('revokeRemovedStaff', () => {
  beforeEach(() => {
    h.users = { 'removed@edu-haifa.org.il': 'uid_removed' };
    h.listed.clear();
    h.claims = [];
    h.revoked = [];
  });

  it('strips the staff claims and revokes the tokens of a removed teacher', async () => {
    await fire('removed@edu-haifa.org.il');
    expect(h.claims).toHaveLength(1);
    expect(h.claims[0].uid).toBe('uid_removed');
    expect(h.claims[0].claims.teacher).toBe(false);
    expect(h.claims[0].claims.admin).toBe(false);
    expect(h.claims[0].claims.role).toBe('guest');
    expect(h.revoked).toEqual(['uid_removed']);
  });

  it('does nothing for an address that never signed in', async () => {
    await fire('never@edu-haifa.org.il');
    expect(h.claims).toHaveLength(0);
    expect(h.revoked).toHaveLength(0);
  });

  it('keeps the access of an address that was added back', async () => {
    h.listed.add('removed@edu-haifa.org.il');
    await fire('removed@edu-haifa.org.il');
    expect(h.claims).toHaveLength(0);
    expect(h.revoked).toHaveLength(0);
  });
});
