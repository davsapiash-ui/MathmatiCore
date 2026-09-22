import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';

/**
 * החזרה לאפיון, 22.9.2026 — מסלול שמתחלף באמצע תרגיל.
 *
 * מודול 26 §ב: "עדכוני תרגילים המופצים על ידי מנהל המערכת במהלך שיעור פעיל
 * מוחלים בצד התלמיד אך ורק על תרגילים שטרם נפתחו בפועל. תרגיל פעיל שפתרונו החל
 * אינו מופרע." מודול 19 §ב קובע את אותו גבול החלה בטוח לשינוי התאמה.
 *
 * בפועל `getActiveTasks` קרא את המסלול של הלומד בכל רינדור מחדש. מורה ששינתה
 * מסלול בזמן שילד עמד באמצע תרגיל החליפה לו את המאגר תחת הידיים: אותו אינדקס,
 * מספרים אחרים על המסך.
 */
const STUDENT = 'student_user4';
const store = readFileSync(resolve(__dirname, '../../application/useWorkspaceStore.ts'), 'utf-8');

function setPath(path: 'green_path' | 'remediation_path') {
  useStore.setState((s) => ({
    students: { ...s.students, [STUDENT]: { ...(s.students[STUDENT] ?? {}), pedagogicalPath: path } as any },
  }));
}

describe('המאגר ננעץ לכל אורך התרגיל', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { uid: STUDENT, name: 'user4' } as any, role: 'student', isAuthenticated: true });
    useStore.setState({ students: {} as any });
    setPath('green_path');
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(4, false);
  });

  it('אתחול המפגש נועץ את המסלול המאושר', () => {
    expect(useWorkspaceStore.getState().activeBankPath).toBe('green_path');
  });

  it('שינוי מסלול באמצע תרגיל אינו מחליף את התרגיל שעל המסך', () => {
    const before = getActiveTasks(useWorkspaceStore.getState())[0];
    expect(before).toBeTruthy();

    setPath('remediation_path');

    const after = getActiveTasks(useWorkspaceStore.getState())[0];
    expect(after.id).toBe(before.id);
    expect(after.numberA).toBe(before.numberA);
  });

  it('המאגר הננעץ הוא שקובע, גם כשהרשומה אומרת אחרת', () => {
    setPath('green_path');
    const pinnedToRemediation = getActiveTasks({
      ...useWorkspaceStore.getState(),
      activeBankPath: 'remediation_path',
    } as any);
    expect(pinnedToRemediation[0].id).toContain('_r_');
  });

  it('לומד שרשומתו טרם נטענה אינו ננעץ על ירוק בטעות — ההכרעה נשארת חיה', () => {
    useStore.setState({ students: {} as any });
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(4, false);
    expect(useWorkspaceStore.getState().activeBankPath).toBeNull();

    setPath('remediation_path');
    expect(getActiveTasks(useWorkspaceStore.getState())[0].id).toContain('_r_');
  });
});

describe('הנעיצה מתחדשת בגבול ההחלה הבטוח בלבד', () => {
  it('advanceStandard נועצת מחדש לפני שהיא קוראת את המאגר של התרגיל הבא', () => {
    const fn = store.slice(store.indexOf('function advanceStandard() {'));
    const repin = fn.indexOf('set({ activeBankPath: pinnableLearningPath() });');
    const readBank = fn.indexOf('const tasks = getActiveTasks(s);');
    expect(repin).toBeGreaterThan(-1);
    expect(repin).toBeLessThan(readBank);
  });

  it('ההחלה הממתינה של מודול 19 קודמת לנעיצה, אחרת שינוי שהומתן היה נכנס תרגיל אחד מאוחר מדי', () => {
    const fn = store.slice(store.indexOf('function advanceStandard() {'));
    expect(fn.indexOf('applyPendingAdaptationAtBoundary();')).toBeLessThan(
      fn.indexOf('set({ activeBankPath: pinnableLearningPath() });')
    );
  });

  it('בחירת המאגר עצמה עוברת דרך הערך הננעץ', () => {
    expect(store).toContain(
      'return getSessionTasks(s.sessionNumber as any, s.activeBankPath ?? resolveLearningPath()) ?? [];'
    );
  });
});
