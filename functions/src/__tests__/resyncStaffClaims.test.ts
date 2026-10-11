import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Owner decision 11.10.2026 (read-only staff) and PRD Module 1 §ג: a change to
 * an authorizedTeachers entry's role or read-only flag re-stamps the account's
 * claims from the syncUserRoles rules and revokes its refresh tokens, so the
 * change does not wait for the next sign-in. A sign-in's own write (updatedAt)
 * does nothing.
 */

const h = vi.hoisted(() => ({
  users: {} as Record<string, { uid: string; customClaims?: Record<string, unknown> }>,
  claims: [] as Array<{ uid: string; claims: Record<string, unknown> }>,
  revoked: [] as string[],
}));

vi.mock('firebase-functions/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, log: () => {} }));

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();
  const auth = {
    getUserByEmail: async (email: string) => {
      if (!(email in h.users)) throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
      return h.users[email];
    },
    setCustomUserClaims: async (uid: string, claims: Record<string, unknown>) => { h.claims.push({ uid, claims }); },
    revokeRefreshTokens: async (uid: string) => { h.revoked.push(uid); },
  };
  return { ...actual, auth: () => auth, default: { ...actual, auth: () => auth } };
});

import { claimsAfterEntryChange, resyncStaffClaimsOnEntryChange, staffEntryChanged } from '../resyncStaffClaims';
import { TEACHER_CLAIMS, ADMIN_CLAIMS } from '../roleClaims';

const snap = (d: Record<string, unknown> | undefined) => ({ data: () => d });
const fire = (email: string, before: Record<string, unknown>, after: Record<string, unknown>) =>
  (resyncStaffClaimsOnEntryChange as any).run({ params: { email }, data: { before: snap(before), after: snap(after) } });

const T = 'teacher@example.org';

describe('staffEntryChanged', () => {
  it('a change of role or of the read-only flag', () => {
    expect(staffEntryChanged({ role: 'teacher' }, { role: 'admin' })).toBe(true);
    expect(staffEntryChanged({ role: 'teacher' }, { role: 'teacher', readOnly: true })).toBe(true);
    expect(staffEntryChanged({ role: 'teacher', readOnly: 'true' }, { role: 'teacher' })).toBe(true);
  });

  it('not a sign-in\'s own write, nor a change that grants the same', () => {
    expect(staffEntryChanged({ role: 'teacher', updatedAt: 1 }, { role: 'teacher', updatedAt: 2 })).toBe(false);
    // No role reads as teacher; syncUserRoles writing 'teacher' is no change.
    expect(staffEntryChanged({ email: T }, { email: T, role: 'teacher' })).toBe(false);
    // The flag typed as text or as a boolean is the same flag.
    expect(staffEntryChanged({ role: 'teacher', readOnly: 'true' }, { role: 'teacher', readOnly: true })).toBe(false);
    expect(staffEntryChanged(undefined, { role: 'admin' })).toBe(false);
  });
});

describe('claimsAfterEntryChange', () => {
  it('a teacher made read-only keeps the teacher claims, with readOnly', () => {
    expect(claimsAfterEntryChange({ ...TEACHER_CLAIMS }, { role: 'teacher', readOnly: true })).toEqual({ ...TEACHER_CLAIMS, readOnly: true });
  });

  it('an admin address signed in as the teacher stays the teacher; signed in as admin stays admin', () => {
    expect(claimsAfterEntryChange({ ...TEACHER_CLAIMS }, { role: 'admin', readOnly: true })).toEqual({ ...TEACHER_CLAIMS, readOnly: true });
    expect(claimsAfterEntryChange({ ...ADMIN_CLAIMS, readOnly: true }, { role: 'admin' })).toEqual({ ...ADMIN_CLAIMS });
  });

  it('an admin made a teacher can never keep the admin claims', () => {
    expect(claimsAfterEntryChange({ ...ADMIN_CLAIMS }, { role: 'teacher' })).toEqual({ ...TEACHER_CLAIMS });
  });

  it('no staff role on the account yet: the admin side for an admin address (fail-closed), teacher otherwise', () => {
    expect(claimsAfterEntryChange(undefined, { role: 'admin' })).toEqual({ ...ADMIN_CLAIMS });
    expect(claimsAfterEntryChange({ role: 'guest' }, { role: 'teacher' })).toEqual({ ...TEACHER_CLAIMS });
  });
});

describe('resyncStaffClaimsOnEntryChange', () => {
  const env = { ...process.env };
  beforeEach(() => {
    h.users = { [T]: { uid: 'uid_t', customClaims: { ...TEACHER_CLAIMS } } };
    h.claims = [];
    h.revoked = [];
  });
  afterEach(() => { process.env = { ...env }; });

  it('re-stamps the claims and revokes the refresh tokens when the flag changes', async () => {
    await fire(T, { role: 'teacher' }, { role: 'teacher', readOnly: true });
    expect(h.claims).toEqual([{ uid: 'uid_t', claims: { ...TEACHER_CLAIMS, readOnly: true } }]);
    expect(h.revoked).toEqual(['uid_t']);
  });

  it('does nothing on a sign-in\'s own write (updatedAt only)', async () => {
    await fire(T, { role: 'teacher', updatedAt: 1 }, { role: 'teacher', updatedAt: 2 });
    expect(h.claims).toHaveLength(0);
    expect(h.revoked).toHaveLength(0);
  });

  it('does nothing for an address with no Auth user', async () => {
    await fire('never@example.org', { role: 'teacher' }, { role: 'admin' });
    expect(h.claims).toHaveLength(0);
    expect(h.revoked).toHaveLength(0);
  });

  it('does nothing for the owner\'s emergency address, whose authorisation is not the document', async () => {
    process.env.ADMIN_SSO_PRIMARY_EMAIL = 'owner@example.org';
    h.users['owner@example.org'] = { uid: 'uid_o', customClaims: { ...ADMIN_CLAIMS } };
    await fire('owner@example.org', { role: 'admin' }, { role: 'admin', readOnly: true });
    expect(h.claims).toHaveLength(0);
    expect(h.revoked).toHaveLength(0);
  });

  it('normalises the address of the document id', async () => {
    await fire('  Teacher@Example.org ', { role: 'teacher' }, { role: 'admin' });
    expect(h.claims).toEqual([{ uid: 'uid_t', claims: { ...TEACHER_CLAIMS } }]);
    expect(h.revoked).toEqual(['uid_t']);
  });
});
