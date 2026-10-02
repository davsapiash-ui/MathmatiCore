import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Module 23א, the texts round (2.10.2026): every reset toast says what really
 * happened and where the backup went — the shared Drive with a link to open it,
 * or the system's own backup storage when Drive was not reachable (register
 * gap יב). The success toasts said "שאר המפגשים נשמרו" also after meeting 2,
 * "כל נתוני כיתת הביקורת אופסו בהצלחה לאפס מוחלט!" for level 3, and nothing
 * about the backup; a failed alerts reset showed two generic toasts.
 */

const mockCallable = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

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
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

const { useStore, backupSavedHe } = await import('@/application/useStore');

const STORAGE = 'הגיבוי נשמר באחסון הגיבוי של המערכת.';
const DRIVE_LINK = 'https://drive.google.com/file/d/abc123/view';

describe('where the backup went', () => {
  it('a Drive link: Google Drive, with the link; anything else: the system\'s own backup storage', () => {
    expect(backupSavedHe(DRIVE_LINK)).toEqual({ text: 'הגיבוי נשמר ב-Google Drive.', driveLink: DRIVE_LINK });
    expect(backupSavedHe('gs://bucket/backups/class_1/reset_1.json')).toEqual({ text: STORAGE, driveLink: null });
    expect(backupSavedHe(undefined)).toEqual({ text: STORAGE, driveLink: null });
  });
});

describe('the reset toasts', () => {
  beforeEach(() => {
    mockCallable.mockReset();
    mockToastSuccess.mockClear();
    mockToastError.mockClear();
  });

  it('one learner, a meeting: the Drive backup comes with a button that opens it', async () => {
    mockCallable.mockResolvedValueOnce({ data: { status: 'SUCCESS', sessionNumber: 5, webViewLink: DRIVE_LINK } });
    await useStore.getState().resetStudentData('student_user3', 'student_stuck', undefined, { scope: 'active_session', sessionNumber: 5 });
    const [text, options] = mockToastSuccess.mock.calls[0];
    expect(text).toBe('תלמיד 3 הוחזר לתחילת מפגש 5 · חיסור במאונך עם פריטה. העבודה במפגשים האחרים נשמרה. הגיבוי נשמר ב-Google Drive.');
    expect(options.action.label).toBe('פתיחת הגיבוי');
  });

  it('one learner, meeting 8: the reflection is erased too', async () => {
    mockCallable.mockResolvedValueOnce({ data: { status: 'SUCCESS', sessionNumber: 8 } });
    await useStore.getState().resetStudentData('student_user3', 'student_stuck', undefined, { scope: 'active_session', sessionNumber: 8 });
    expect(mockToastSuccess).toHaveBeenCalledWith(`תלמיד 3 הוחזר לתחילת מפגש 8 · חוקרים בעצמנו. העבודה במפגשים האחרים נשמרה. הרפלקציה שלו נמחקה. ${STORAGE}`);
  });

  it('one learner, the full reset: what was erased, and that the settings stay', async () => {
    mockCallable.mockResolvedValueOnce({ data: { status: 'SUCCESS' } });
    await useStore.getState().resetStudentData('student_user5', 'student_stuck', undefined, { scope: 'full_student' });
    expect(mockToastSuccess).toHaveBeenCalledWith(`תלמיד 5 אופס כולו: ההתקדמות בכל המפגשים, תוצאות האבחון, המסלול, ההקלטות והצ'אט נמחקו. ההגדרות שלו נשמרו. ${STORAGE}`);
  });

  it('the whole class, meeting 2: the diagnostic results and the approved paths are erased too', async () => {
    mockCallable.mockResolvedValueOnce({ data: { status: 'SUCCESS' } });
    await useStore.getState().resetClassActiveSession('restart_session', undefined, 2);
    expect(mockToastSuccess).toHaveBeenCalledWith(`מפגש 2 · יוצאים למסע אופס לכל הכיתה, ו-12 התלמידים חוזרים לתחילתו. העבודה במפגשים האחרים נשמרה. ציוני האבחון והמסלולים שאושרו נמחקו. ${STORAGE}`);
  });

  it('level 3: no "כיתת הביקורת", no "אופסו… לאפס"', async () => {
    mockCallable.mockResolvedValueOnce({ data: { status: 'SUCCESS' } });
    await useStore.getState().resetEntireSystemUsageData('test_run');
    expect(mockToastSuccess).toHaveBeenCalledWith(`כל נתוני הלמידה של הכיתה נמחקו, וכל 12 התלמידים מתחילים מההתחלה. ${STORAGE}`);
  });

  it('a failed alerts reset: one toast, with the server\'s own reason', async () => {
    mockCallable.mockRejectedValueOnce(Object.assign(new Error('רישום האיפוס ביומן הביקורת נכשל, ולכן האיפוס בוטל. ההתראות לא אופסו.'), { code: 'functions/failed-precondition' }));
    await expect(useStore.getState().resetRadarAlerts('technical_fault')).rejects.toThrow('ALERTS_RESET_FAILED');
    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(mockToastError).toHaveBeenCalledWith('רישום האיפוס ביומן הביקורת נכשל, ולכן האיפוס בוטל. ההתראות לא אופסו.');
    mockCallable.mockRejectedValueOnce(new Error('network down'));
    await expect(useStore.getState().resetRadarAlerts('technical_fault')).rejects.toThrow('ALERTS_RESET_FAILED');
    expect(mockToastError).toHaveBeenLastCalledWith('איפוס ההתראות נכשל. נסו שוב.');
  });
});
