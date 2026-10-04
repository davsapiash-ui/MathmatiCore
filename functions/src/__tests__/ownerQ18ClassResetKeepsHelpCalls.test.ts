import { describe, it, expect, vi } from 'vitest';

/**
 * Owner question Q18 (audit reset-11, 4.10.2026). Register deviation 20, "מה
 * לא משתנה": "ההתראות ברדאר אינן מאופסות (זו רמה 1)". The whole-class restart
 * of the open meeting used to clear every learner's help call as well.
 */
vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() {
      return { getAccessToken: async () => ({ token: 'test-access-token' }) };
    }
  },
}));

import { buildActiveSessionResetValues, buildResetScope, executeResetDeletion } from '../exportDriveReport';

function fakeRtdb(initial: Record<string, any>) {
  const tree: Record<string, any> = JSON.parse(JSON.stringify(initial));
  const parts = (p: string) => p.split('/').filter(Boolean);
  const read = (p: string) => parts(p).reduce<any>((n, k) => (n && typeof n === 'object' ? n[k] : undefined), tree) ?? null;
  const write = (p: string, value: unknown) => {
    const keys = parts(p);
    let n = tree;
    for (const k of keys.slice(0, -1)) n = n[k] = n[k] && typeof n[k] === 'object' ? n[k] : {};
    if (value === null) delete n[keys[keys.length - 1]];
    else n[keys[keys.length - 1]] = value;
  };
  const rtdb: any = {
    ref: (path: string) => ({
      get: async () => {
        const v = read(path);
        const children = v && typeof v === 'object' ? Object.keys(v).length : 0;
        return { val: () => v, exists: () => v !== null, hasChildren: () => children > 0, numChildren: () => children };
      },
      set: async (value: unknown) => write(path, value),
      update: async (values: Record<string, unknown>) => write(path, { ...(read(path) ?? {}), ...values }),
      remove: async () => write(path, null),
    }),
  };
  return { rtdb, read };
}

const emptyDb: any = {
  collection: () => {
    const q: any = { where: () => q, orderBy: () => q, limit: () => q, get: async () => ({ empty: true, size: 0, docs: [] }) };
    return q;
  },
  batch: () => ({ delete: () => undefined, commit: async () => undefined }),
};

describe('Q18 — the whole-class meeting restart keeps the help calls', () => {
  const caller = { helpRequested: true, handRaised: true, isStruggling: true, isSocraticActive: true, workspaceState: { blocks: [1] } };

  it('the class scope asks the field reset to keep them', () => {
    const scope = buildResetScope('single_student', 'all', 'active_session', 4, 'class');
    expect(scope.fieldResets?.length).toBeGreaterThan(0);
    for (const reset of scope.fieldResets || []) expect(reset.values.__keepHelpCalls).toBe(true);
  });

  it('a class restart leaves helpRequested / handRaised / isStruggling as they were', async () => {
    const { rtdb, read } = fakeRtdb({ users: { students: { student_user4: caller } } });
    await executeResetDeletion(rtdb, emptyDb, buildResetScope('single_student', 'all', 'active_session', 4, 'class'));
    const record = read('users/students/student_user4');
    expect(record.helpRequested).toBe(true);
    expect(record.handRaised).toBe(true);
    expect(record.isStruggling).toBe(true);
    // The card is closed by the restart: its live flag is not an alert.
    expect(record.isSocraticActive).toBe(false);
    expect(record.workspaceState).toBeNull();
    expect(record.forceReload).toBe(true);
  });

  it('one learner\'s meeting reset is unchanged: it still clears that learner\'s flags', async () => {
    const { rtdb, read } = fakeRtdb({ users: { students: { student_user4: caller } } });
    await executeResetDeletion(rtdb, emptyDb, buildResetScope('single_student', '4', 'active_session', 4, 'student'));
    expect(read('users/students/student_user4')).toMatchObject({ helpRequested: false, handRaised: false, isStruggling: false, isSocraticActive: false });
  });

  it('buildActiveSessionResetValues writes no help-call field when asked to keep them', () => {
    const values = buildActiveSessionResetValues(4, caller, { keepHelpCalls: true });
    expect(values).not.toHaveProperty('helpRequested');
    expect(values).not.toHaveProperty('handRaised');
    expect(values).not.toHaveProperty('isStruggling');
    expect(values.isSocraticActive).toBe(false);
    expect(buildActiveSessionResetValues(4, caller)).toMatchObject({ helpRequested: false, handRaised: false, isStruggling: false });
  });
});
