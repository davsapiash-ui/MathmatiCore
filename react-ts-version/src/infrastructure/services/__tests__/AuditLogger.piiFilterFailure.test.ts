/**
 * PRD Module 3 §א (v7.9): a PII filter failure "נרשם ביומן השרת (רישום ביקורת)".
 * AuditLogger registers the filter's failure sink and writes to the existing
 * `audit_logs` node, under the signed-in user's own uid, with no checked text.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  auth: { currentUser: { uid: 'anon-uid-7' } },
  authReady: Promise.resolve(true),
}));
vi.mock('firebase/database', () => ({
  ref: vi.fn((_db, path) => ({ path })),
  push: vi.fn(() => Promise.resolve({ key: 'k' })),
  set: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => ({ '.sv': 'timestamp' })),
}));

import { push } from 'firebase/database';
import { PII_FILTER_FAILURE_ACTION } from '../AuditLogger';
import { reportPiiFilterFailure } from '@/core/security/PiiFilter';

describe('Module 3 §א — a PII filter failure reaches the server audit log', () => {
  beforeEach(() => {
    vi.mocked(push).mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('writes one audit_logs entry with the place and the error name only', async () => {
    reportPiiFilterFailure('audit-test-place', new TypeError('secret text a@b.co'));
    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const [target, entry] = vi.mocked(push).mock.calls[0] as unknown as [{ path: string }, Record<string, unknown>];
    expect(target.path).toBe('audit_logs');
    expect(entry.action).toBe(PII_FILTER_FAILURE_ACTION);
    expect(entry.user_id).toBe('anon-uid-7');
    expect(String(entry.details)).toContain('audit-test-place');
    expect(String(entry.details)).toContain('TypeError');
    expect(String(entry.details)).not.toContain('a@b.co');
  });
});
