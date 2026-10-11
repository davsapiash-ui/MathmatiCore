import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Audit L36 (12.10.2026): when Drive did not take a reset's backup, the backup
 * is only in the system's own storage, and the teacher had no way to open it.
 * The server now returns a short-lived signed link (backupDownloadUrl,
 * functions/src/exportDriveReport.ts); the success toast offers it with the
 * same button as a Drive backup.
 */

const mockCallable = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  functions: {},
  firestore: {},
  authReady: Promise.resolve(true),
  serverNow: () => Date.now(),
  fetchServerClockOffset: async () => 0,
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => mockCallable) }));
vi.mock('firebase/database', () => ({
  ref: vi.fn(() => ({})),
  onValue: vi.fn(() => () => {}),
  update: vi.fn(async () => {}),
  get: vi.fn(async () => ({ exists: () => false, val: () => null })),
  remove: vi.fn(async () => {}),
  set: vi.fn(async () => {}),
  push: vi.fn(() => ({ key: 'mock_key' })),
  onDisconnect: vi.fn(() => ({ set: vi.fn(async () => {}) })),
  runTransaction: vi.fn(async () => ({ committed: true })),
  serverTimestamp: vi.fn(() => Date.now()),
}));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(() => ({})), setDoc: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: (...args: unknown[]) => mockToastSuccess(...args),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

const { useStore } = await import('@/application/useStore');

const SIGNED = 'https://storage.googleapis.com/bucket/backups/class_1/reset_1/x.json?X-Goog-Signature=abc';

describe('a backup kept only in the system storage opens from the toast', () => {
  beforeEach(() => {
    mockCallable.mockReset();
    mockToastSuccess.mockClear();
  });

  it('the signed link comes with the "פתיחת הגיבוי" button, and the text never says Cloud Storage', async () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    mockCallable.mockResolvedValueOnce({ data: { status: 'SUCCESS', backupChannel: 'storage', webViewLink: 'gs://bucket/backups/class_1/reset_1/x.json', backupDownloadUrl: SIGNED } });
    await useStore.getState().resetEntireSystemUsageData('test_run');
    const [text, options] = mockToastSuccess.mock.calls[0];
    expect(text).not.toContain('Cloud Storage');
    expect(options.action.label).toBe('פתיחת הגיבוי');
    options.action.onClick();
    expect(open).toHaveBeenCalledWith(SIGNED, '_blank', 'noopener,noreferrer');
    vi.unstubAllGlobals();
  });

  it('no signed link (none could be issued): the toast has no button', async () => {
    mockCallable.mockResolvedValueOnce({ data: { status: 'SUCCESS', backupChannel: 'storage', webViewLink: 'gs://bucket/backups/class_1/reset_1/x.json' } });
    await useStore.getState().resetEntireSystemUsageData('test_run');
    expect(mockToastSuccess.mock.calls[0]).toHaveLength(1);
  });

  it('a link that is not https is never opened', async () => {
    mockCallable.mockResolvedValueOnce({ data: { status: 'SUCCESS', backupDownloadUrl: 'javascript:alert(1)' } });
    await useStore.getState().resetEntireSystemUsageData('test_run');
    expect(mockToastSuccess.mock.calls[0]).toHaveLength(1);
  });
});
