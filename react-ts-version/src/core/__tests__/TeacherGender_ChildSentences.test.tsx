/**
 * @vitest-environment jsdom
 */
/**
 * Owner, 1.10.2026: the teacher marks once whether the children's screens
 * speak of the teacher in the feminine or in the masculine, and every sentence
 * about the teacher that a child reads or hears follows — on the screen and in
 * the read-aloud button alike. The teacher's own screens are not part of it.
 *
 * The feminine stays the default, word for word what the children read before
 * the choice existed, so a teacher who never marks anything changes nothing.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const h = vi.hoisted(() => {
  const snap = (value: unknown) => ({ val: () => value ?? null, exists: () => value !== undefined && value !== null });
  return {
    snap,
    listeners: new Map<string, (s: ReturnType<typeof snap>) => void>(),
    cancels: new Map<string, (err: Error) => void>(),
    subscriptions: 0,
    writes: [] as Array<{ path: string; value: unknown }>,
    refuse: false,
  };
});

vi.mock('firebase/database', () => ({
  ref: (_db: unknown, path = '') => ({ path }),
  onValue: (r: { path: string }, cb: (s: unknown) => void, cancel?: (err: Error) => void) => {
    h.subscriptions += 1;
    h.listeners.set(r.path, cb as never);
    if (cancel) h.cancels.set(r.path, cancel);
    return () => { h.listeners.delete(r.path); h.cancels.delete(r.path); };
  },
  set: (r: { path: string }, value: unknown) => {
    if (h.refuse) return Promise.reject(new Error('PERMISSION_DENIED'));
    h.writes.push({ path: r.path, value });
    h.listeners.get(r.path)?.(h.snap(value));
    return Promise.resolve();
  },
  update: () => Promise.resolve(),
  push: () => ({ key: 'k' }),
  remove: () => Promise.resolve(),
  get: () => Promise.resolve({ exists: () => false, val: () => null }),
  onDisconnect: () => ({ set: () => Promise.resolve(), cancel: () => Promise.resolve() }),
  serverTimestamp: () => 0,
}));
vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  auth: { currentUser: null },
  authReady: Promise.resolve(false),
  fetchServerClockOffset: async () => 0,
  serverNow: () => Date.now(),
}));
vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <button type="button" data-testid="speech" data-text={text} />,
}));
vi.mock('@/presentation/components/ui/LogoutButton', () => ({ LogoutButton: () => <button type="button">התנתקות</button> }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { toast } from 'sonner';
import { TEACHER_SENTENCES_HE, DEFAULT_TEACHER_GENDER, parseTeacherGender, teacherSentenceHe, type TeacherGender } from '@/core/teacherGender';
import { useTeacherGender, useTeacherGenderStore, TEACHER_GENDER_PATH } from '@/application/useTeacherGender';
import { SessionPausedOverlay } from '@/presentation/components/student/SessionPausedOverlay';
import { SessionClosedOverlay } from '@/presentation/components/student/SessionClosedOverlay';
import { TeacherWillOpenWaitingScreen } from '@/presentation/components/student/TeacherWillOpenWaitingScreen';
import { Meeting2WaitingScreen } from '@/presentation/components/student/Meeting2WaitingScreen';
import { TeacherGenderSetting } from '@/presentation/pages/TeacherDashboard/components/TeacherGenderSetting';

const repo = (p: string) => readFileSync(resolve(__dirname, '../../../..', p), 'utf-8');
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');
const speechTexts = () => screen.queryAllByTestId('speech').map((b) => b.getAttribute('data-text'));
const setGender = (gender: TeacherGender) => act(() => { useTeacherGenderStore.setState({ gender }); });

beforeEach(() => {
  h.listeners.clear();
  h.cancels.clear();
  h.subscriptions = 0;
  localStorage.clear();
  h.writes = [];
  h.refuse = false;
  useTeacherGenderStore.setState({ gender: DEFAULT_TEACHER_GENDER });
  vi.mocked(toast.error).mockClear();
});
afterEach(() => cleanup());

describe('the sentences, in both genders', () => {
  it('the feminine is the default, word for word what the children read before', () => {
    expect(DEFAULT_TEACHER_GENDER).toBe('female');
    expect(TEACHER_SENTENCES_HE.helpCallReceived.female).toBe('המורה יודעת 🤝');
    expect(TEACHER_SENTENCES_HE.willOpenActivity.female).toBe('המורה תפתח את הפעילות בקרוב.');
    expect(TEACHER_SENTENCES_HE.pausedTitle.female).toBe('המורה עצרה את הפעילות לרגע');
    expect(TEACHER_SENTENCES_HE.pausedBody.female).toBe('חכו רגע. כשהמורה תמשיך, העבודה שלכם תחזור בדיוק מאיפה שעצרתם.');
    expect(TEACHER_SENTENCES_HE.closedTitle.female).toBe('המורה סגרה את התחנה');
    expect(TEACHER_SENTENCES_HE.closedBody.female).toBe('העבודה שלכם נשמרה בבטחה. כשהמורה תפתח תחנה חדשה, הפעילות תתחדש כאן מיד.');
    expect(TEACHER_SENTENCES_HE.meeting2Waiting.female).toBe('כל הכבוד, מתמטיקאים! סיימתם את התחנה השנייה. המורה בודקת את העבודה שלכם. כשהמורה תסיים לבדוק, נמשיך.');
    expect(TEACHER_SENTENCES_HE.nextStation.female).toBe('כשהמורה תפתח את התחנה הבאה, נמשיך יחד.');
  });

  it('the masculine changes only the words about the teacher', () => {
    expect(TEACHER_SENTENCES_HE.helpCallReceived.male).toBe('המורה יודע 🤝');
    expect(TEACHER_SENTENCES_HE.willOpenActivity.male).toBe('המורה יפתח את הפעילות בקרוב.');
    expect(TEACHER_SENTENCES_HE.pausedTitle.male).toBe('המורה עצר את הפעילות לרגע');
    expect(TEACHER_SENTENCES_HE.pausedBody.male).toBe('חכו רגע. כשהמורה ימשיך, העבודה שלכם תחזור בדיוק מאיפה שעצרתם.');
    expect(TEACHER_SENTENCES_HE.closedTitle.male).toBe('המורה סגר את התחנה');
    expect(TEACHER_SENTENCES_HE.closedBody.male).toBe('העבודה שלכם נשמרה בבטחה. כשהמורה יפתח תחנה חדשה, הפעילות תתחדש כאן מיד.');
    expect(TEACHER_SENTENCES_HE.meeting2Waiting.male).toBe('כל הכבוד, מתמטיקאים! סיימתם את התחנה השנייה. המורה בודק את העבודה שלכם. כשהמורה יסיים לבדוק, נמשיך.');
    expect(TEACHER_SENTENCES_HE.nextStation.male).toBe('כשהמורה יפתח את התחנה הבאה, נמשיך יחד.');
  });

  it('a stored value other than "male" reads as the default', () => {
    expect(parseTeacherGender('male')).toBe('male');
    for (const raw of ['female', null, undefined, '', 'MALE', 'זכר', 1, true, {}]) {
      expect(parseTeacherGender(raw)).toBe('female');
    }
  });
});

describe('the children’s screens follow the teacher’s choice, on the screen and in the read-aloud', () => {
  it('the pause', () => {
    render(<SessionPausedOverlay />);
    expect(screen.getByRole('heading').textContent).toBe('המורה עצרה את הפעילות לרגע');
    expect(speechTexts()).toEqual(['המורה עצרה את הפעילות לרגע. חכו רגע. כשהמורה תמשיך, העבודה שלכם תחזור בדיוק מאיפה שעצרתם.']);
    setGender('male');
    expect(screen.getByRole('heading').textContent).toBe('המורה עצר את הפעילות לרגע');
    expect(screen.getByText('חכו רגע. כשהמורה ימשיך, העבודה שלכם תחזור בדיוק מאיפה שעצרתם.')).toBeTruthy();
    expect(speechTexts()).toEqual(['המורה עצר את הפעילות לרגע. חכו רגע. כשהמורה ימשיך, העבודה שלכם תחזור בדיוק מאיפה שעצרתם.']);
  });

  it('the closed meeting', () => {
    render(<SessionClosedOverlay />);
    expect(screen.getByRole('heading').textContent?.trim()).toBe('המורה סגרה את התחנה');
    expect(speechTexts()).toEqual(['המורה סגרה את התחנה. העבודה שלכם נשמרה בבטחה. כשהמורה תפתח תחנה חדשה, הפעילות תתחדש כאן מיד.']);
    setGender('male');
    expect(screen.getByRole('heading').textContent?.trim()).toBe('המורה סגר את התחנה');
    expect(speechTexts()).toEqual(['המורה סגר את התחנה. העבודה שלכם נשמרה בבטחה. כשהמורה יפתח תחנה חדשה, הפעילות תתחדש כאן מיד.']);
  });

  it('the quiet wait in meetings 3–8', () => {
    render(<TeacherWillOpenWaitingScreen />);
    const screenEl = screen.getByTestId('teacher-will-open-screen');
    expect(screenEl.textContent).toBe('המורה תפתח את הפעילות בקרוב.');
    expect(speechTexts()).toEqual(['המורה תפתח את הפעילות בקרוב.']);
    setGender('male');
    expect(screenEl.textContent).toBe('המורה יפתח את הפעילות בקרוב.');
    expect(speechTexts()).toEqual(['המורה יפתח את הפעילות בקרוב.']);
  });

  it('the wait at the end of meeting 2', () => {
    render(<Meeting2WaitingScreen />);
    expect(speechTexts()).toEqual([TEACHER_SENTENCES_HE.meeting2Waiting.female]);
    expect(screen.getByText(TEACHER_SENTENCES_HE.meeting2Waiting.female)).toBeTruthy();
    setGender('male');
    expect(speechTexts()).toEqual([TEACHER_SENTENCES_HE.meeting2Waiting.male]);
    expect(screen.getByText(TEACHER_SENTENCES_HE.meeting2Waiting.male)).toBeTruthy();
  });

  it('the lobby, the end-of-station screen and the help-call toast read the same sentences', () => {
    const hub = src('presentation/pages/StudentHub.tsx');
    expect(hub).toContain('const teacherGender = useTeacherGender();');
    // Every lobby sentence (core/lobbyState.ts) in the teacher's gender.
    expect(hub).toContain('teacherSentenceHe(state.sentence, teacherGender)');
    const page = src('features/workspace/StudentWorkspacePage.tsx');
    expect(page).toContain('const teacherGender = useTeacherGender();');
    expect(page).toContain("teacherSentenceHe('nextStation', teacherGender)");
    const store = src('application/useWorkspaceStore.ts');
    expect(store).toContain("teacherSentenceHe('helpCallReceived', useTeacherGenderStore.getState().gender)");
  });

  it('the teacher’s pause and close notices quote the children’s screen in the same form', () => {
    const dashboard = src('presentation/pages/TeacherDashboard.tsx');
    expect(dashboard).toContain("כל התלמידים רואים עכשיו \"${teacherSentenceHe('closedTitle', useTeacherGenderStore.getState().gender)}\"");
    expect(dashboard).toContain("כל התלמידים רואים עכשיו \"${teacherSentenceHe('pausedTitle', useTeacherGenderStore.getState().gender)}\"");
    expect(dashboard).not.toContain('"המורה סגרה את התחנה"');
    expect(dashboard).not.toContain('"המורה עצרה את הפעילות לרגע"');
    // The dashboard holds the value itself — the admin's embedded view has no side menu.
    expect(dashboard).toMatch(/export function TeacherDashboard\([^)]*\) \{[\s\S]{0,600}\n  useTeacherGender\(\);/);
  });

  it('no child screen keeps a sentence about the teacher outside the two-gender list', () => {
    const childFiles = [
      'presentation/pages/StudentHub.tsx',
      'features/workspace/StudentWorkspacePage.tsx',
      'application/useWorkspaceStore.ts',
      'presentation/components/student/SessionPausedOverlay.tsx',
      'presentation/components/student/SessionClosedOverlay.tsx',
      'presentation/components/student/TeacherWillOpenWaitingScreen.tsx',
      'presentation/components/student/Meeting2WaitingScreen.tsx',
    ];
    for (const file of childFiles) {
      const code = src(file);
      for (const forms of Object.values(TEACHER_SENTENCES_HE)) {
        expect(code, file).not.toContain(forms.female);
        expect(code, file).not.toContain(forms.male);
      }
    }
  });
});

describe('the value reaches every screen from the database', () => {
  function Probe() {
    return <p data-testid="probe">{teacherSentenceHe('willOpenActivity', useTeacherGender())}</p>;
  }

  it('one listener on the class setting; a missing or unknown value is the default', () => {
    const { unmount } = render(<><Probe /><Probe /></>);
    expect([...h.listeners.keys()]).toEqual([TEACHER_GENDER_PATH]);
    expect(TEACHER_GENDER_PATH).toBe('system_control/teacher_gender');

    act(() => h.listeners.get(TEACHER_GENDER_PATH)!(h.snap('male')));
    expect(screen.getAllByTestId('probe').map((p) => p.textContent)).toEqual(['המורה יפתח את הפעילות בקרוב.', 'המורה יפתח את הפעילות בקרוב.']);

    act(() => h.listeners.get(TEACHER_GENDER_PATH)!(h.snap(null)));
    expect(screen.getAllByTestId('probe')[0].textContent).toBe('המורה תפתח את הפעילות בקרוב.');

    act(() => h.listeners.get(TEACHER_GENDER_PATH)!(h.snap('something else')));
    expect(screen.getAllByTestId('probe')[0].textContent).toBe('המורה תפתח את הפעילות בקרוב.');

    unmount();
    expect(h.listeners.size).toBe(0);
  });

  it('the device remembers the last value, so a masculine class does not open in the feminine', async () => {
    const first = render(<Probe />);
    act(() => h.listeners.get(TEACHER_GENDER_PATH)!(h.snap('male')));
    expect(localStorage.getItem('mathmaticore_teacher_gender')).toBe('male');
    first.unmount();

    vi.resetModules(); // a fresh page load on the same device
    const reloaded = await import('@/application/useTeacherGender');
    expect(reloaded.useTeacherGenderStore.getState().gender).toBe('male');

    localStorage.setItem('mathmaticore_teacher_gender', 'nonsense');
    vi.resetModules();
    const again = await import('@/application/useTeacherGender');
    expect(again.useTeacherGenderStore.getState().gender).toBe('female');
  });

  it('a listener the database refused is started again by the next screen that needs it', () => {
    const first = render(<Probe />);
    expect(h.subscriptions).toBe(1);
    act(() => h.cancels.get(TEACHER_GENDER_PATH)!(new Error('permission_denied')));
    render(<Probe />);
    expect(h.subscriptions).toBe(2);
    first.unmount();
  });
});

describe('the teacher marks it in the side menu', () => {
  it('two choices, the current one checked, and an example sentence in the chosen form', async () => {
    render(<TeacherGenderSetting />);
    const group = screen.getByRole('radiogroup', { name: 'המורה במסכי התלמידים' });
    // Native radio buttons: one name, so the arrow keys move between them.
    const female = screen.getByRole('radio', { name: 'לשון נקבה' }) as HTMLInputElement;
    const male = screen.getByRole('radio', { name: 'לשון זכר' }) as HTMLInputElement;
    expect(group).toBeTruthy();
    expect(female.name).toBe(male.name);
    expect(female.checked).toBe(true);
    expect(male.checked).toBe(false);
    expect(screen.getByText('לדוגמה: "המורה תפתח את הפעילות בקרוב."')).toBeTruthy();

    await act(async () => { fireEvent.click(male); });
    expect(h.writes).toEqual([{ path: 'system_control/teacher_gender', value: 'male' }]);
    expect(male.checked).toBe(true);
    expect(female.checked).toBe(false);
    expect(screen.getByText('לדוגמה: "המורה יפתח את הפעילות בקרוב."')).toBeTruthy();

    // Pressing the checked choice again writes nothing.
    await act(async () => { fireEvent.click(male); });
    expect(h.writes).toHaveLength(1);
  });

  it('nothing waits on the network: the choices stay open while a write is pending', async () => {
    render(<TeacherGenderSetting />);
    for (const radio of screen.getAllByRole('radio') as HTMLInputElement[]) expect(radio.disabled).toBe(false);
    expect(src('presentation/pages/TeacherDashboard/components/TeacherGenderSetting.tsx')).not.toMatch(/disabled=|isSaving/);
  });

  it('a refused write is shown to the teacher and the choice stays as it was', async () => {
    h.refuse = true;
    render(<TeacherGenderSetting />);
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: 'לשון זכר' })); });
    expect(toast.error).toHaveBeenCalledWith('השמירה נכשלה. נסו שוב.');
    expect((screen.getByRole('radio', { name: 'לשון נקבה' }) as HTMLInputElement).checked).toBe(true);
  });

  it('it sits in the teacher’s side menu, above the sign-out', () => {
    const dashboard = src('presentation/pages/TeacherDashboard.tsx');
    const at = dashboard.indexOf('<TeacherGenderSetting />');
    expect(at).toBeGreaterThan(dashboard.indexOf('<aside className='));
    expect(at).toBeLessThan(dashboard.indexOf('<LogoutButton', at));
    expect(dashboard.match(/<TeacherGenderSetting \/>/g)).toHaveLength(1);
  });
});

describe('the database rules', () => {
  const control = JSON.parse(repo('database.rules.json')).rules.system_control;

  it('every signed-in device reads it; only a teacher writes it, not the admin', () => {
    expect(control['.read']).toBe('auth != null');
    const write = control.teacher_gender['.write'];
    expect(write).toContain("auth.token.role == 'teacher'");
    expect(write).toContain('auth.token.teacher == true');
    expect(write).not.toContain('admin');
    expect(write).not.toContain('student');
  });

  it('only "female" or "male" is stored', () => {
    expect(control.teacher_gender['.validate']).toBe("newData.isString() && (newData.val() == 'female' || newData.val() == 'male')");
  });
});
