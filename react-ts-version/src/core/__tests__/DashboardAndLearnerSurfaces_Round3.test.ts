import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describeReportError, REPORT_PROCESSING_TEXT } from '@/infrastructure/services/LearnerJourneyService';

/**
 * סבב הסוכנים, חלק שלישי — מסכים שהציגו מצב שאינו המצב:
 *
 * - דשבורד המורה: ספינר בלי סוף כשמסד הנתונים לא עונה (onValue לא מפעיל שגיאה).
 * - restoreSession נתן למפגש 1 25 דקות; initSession וה-PRD אומרים 20.
 * - syncUserRoles: כשל קריאה ב-Firestore הפך למורה "אורח" — הורדה שקטה.
 * - דוח שהשרת סירב להפיק ("אין פעולות מתועדות") הוצג כ"בעיבוד, נסו שוב".
 * - "המלצה: ירוק" ללומד שאין לו המלצה בכלל.
 * - פרסום תוכנית הלימודים: כתיבות מקבילות בלי אישור ובלי אטומיות.
 * - חלון בחירת התפקיד ללא Escape וללא role="dialog".
 * - שגיאת נגן ההקלטות הזריקה את טקסט החריגה ל-innerHTML.
 * - מסכי ההמתנה פעמו גם במצב שקט, ובלי הקראה; טופס הכניסה עם autoFocus
 *   שדילג על בחירת המספר, ומונחי מערכת לילד.
 * - קישור "אודות" בדף הנחיתה שלח ילד ל-GitHub.
 * - "פח המחזור" בשלושה קבצים נוספים — הלוח עצמו אומר "פח אשפה".
 */
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');
const repo = (p: string) => readFileSync(resolve(__dirname, '../../../..', p), 'utf-8');

describe('דשבורד המורה — טעינה שלא נענית מסתיימת בהודעה, לא בספינר', () => {
  const dash = src('presentation/pages/TeacherDashboard.tsx');
  it('שעון שמירה מכבה את הטעינה ומציג התראה', () => {
    expect(dash).toContain('const watchdog = setTimeout(');
    expect(dash).toContain('setLoadTimedOut(true)');
    expect(dash).toContain('לא התקבלה תשובה ממסד הנתונים');
    expect(dash).toMatch(/clearTimeout\(watchdog\);\s*setLoadTimedOut\(false\);/);
  });
});

describe('משך המפגש המשוחזר זהה למשך המפגש שהותחל', () => {
  const store = src('application/useWorkspaceStore.ts');
  it('שני המקומות משתמשים באותה טבלה: 20 / 15 / 25', () => {
    const table = "sanitized === 1 ? 20 : (sanitized >= 3 && sanitized <= 7) ? 15 : 25";
    expect(store.split(table).length - 1).toBe(2);
    expect(store).not.toContain("const durationMin = (sanitized >= 3 && sanitized <= 7) ? 15 : 25;");
  });
});

describe('syncUserRoles — כשל קריאה אינו הורדה בדרגה', () => {
  const fn = repo('functions/src/syncUserRoles.ts');
  it('שגיאת Firestore זורקת unavailable במקום ליפול ל-guest', () => {
    const catchBlock = fn.slice(fn.indexOf('Could not fetch authorizedTeachers doc'), fn.indexOf('Could not fetch authorizedTeachers doc') + 400);
    expect(catchBlock).toContain('throw new HttpsError("unavailable"');
  });
});

describe('דוח — סירוב סופי מוסבר, רק כשל חולף הוא "בעיבוד"', () => {
  it('not-found עם הודעה בעברית מוצג כמות שהוא', () => {
    const err = Object.assign(new Error('אין פעולות מתועדות למפגש 4 של תלמיד 3'), { code: 'functions/not-found' });
    expect(describeReportError(err)).toEqual({ final: true, message: 'אין פעולות מתועדות למפגש 4 של תלמיד 3' });
  });
  it('permission-denied באנגלית מקבל הסבר בעברית', () => {
    const err = Object.assign(new Error('Access denied: teacher not assigned to this class.'), { code: 'functions/permission-denied' });
    const d = describeReportError(err);
    expect(d.final).toBe(true);
    expect(d.message).toContain('הרשאה');
  });
  it('internal / unavailable / רשת — טקסט העיבוד של ה-PRD', () => {
    for (const code of ['functions/internal', 'functions/unavailable', 'functions/deadline-exceeded', undefined]) {
      const err = Object.assign(new Error('boom'), code ? { code } : {});
      expect(describeReportError(err)).toEqual({ final: false, message: REPORT_PROCESSING_TEXT });
    }
  });
});

describe('אין המלצת מסלול מומצאת', () => {
  const heat = src('presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx');
  it('לומד ללא המלצה מקבל "טרם נקבעה", לא "ירוק"', () => {
    expect(heat).toContain("'טרם נקבעה'");
    expect(heat).not.toMatch(/\? 'צמצום פערים' : 'ירוק';\n/);
  });
});

describe('פרסום תוכנית הלימודים — אישור ואטומיות', () => {
  const view = src('presentation/pages/admin/AdminCurriculumView.tsx');
  it('window.confirm לפני, writeBatch אחד במקום Promise.all של setDoc', () => {
    expect(view).toContain('window.confirm(`לפרסם את תוכנית הלימודים?');
    expect(view).toContain('const batch = writeBatch(db);');
    expect(view).toContain('await batch.commit();');
    expect(view).not.toMatch(/Promise\.all\(\s*banks\.map/);
  });
});

describe('חלון בחירת התפקיד', () => {
  const modal = src('presentation/components/RoleSelectionModal.tsx');
  it('role="dialog", ו-Escape מבצע את פעולת הביטול', () => {
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('useDismissableOverlay<HTMLDivElement>(true, logout)');
  });
});

describe('נגן ההקלטות — שגיאה בטוחה', () => {
  const replay = src('presentation/components/ReplayViewer.tsx');
  it('אין החריגה ב-innerHTML; ההודעה נכתבת ב-textContent', () => {
    expect(replay).not.toContain('container.innerHTML = `');
    expect(replay).toContain("notice.textContent = 'לא הצלחנו להפעיל את ההקלטה הזו");
    expect(replay).toContain("notice.setAttribute('role', 'alert')");
  });
});

describe('מסכי ההמתנה של הלומד', () => {
  const screens = [
    'presentation/components/student/SessionPausedOverlay.tsx',
    'presentation/components/student/SessionClosedOverlay.tsx',
    'presentation/components/student/ProjectorWaitingScreen.tsx',
  ];
  it('הנקודות הפועמות מכבדות מצב שקט', () => {
    for (const p of screens) {
      const s = src(p);
      expect(s, p).toContain('useReducedMotion()');
      expect(s, p).toContain('reduceMotion ? {} :');
    }
  });
  it('לכל מסך המתנה יש הקראה', () => {
    for (const p of [...screens, 'presentation/components/student/BeeFlightWaitingScreen.tsx']) {
      expect(src(p), p).toContain('<UdlSpeechButton text=');
    }
    expect(src('presentation/components/student/BeeFlightWaitingScreen.tsx')).toContain("[data-quiet='true'] .bee-flight { animation: none; }");
  });
});

describe('טופס הכניסה של הילד', () => {
  const login = src('presentation/pages/Login.tsx');
  it('בלי autoFocus על הסיסמה, מילים של ילד, והקראה', () => {
    expect(login).not.toContain('autoFocus');
    expect(login).toContain('המספר שלי בכיתה');
    expect(login).toContain('"רגע, בודקים..." : "כניסה"');
    expect(login).toContain('<UdlSpeechButton text="בחרו את המספר שלכם בכיתה');
  });
  it('שגיאת SSO שאינה שלנו אינה מודפסת כמות שהיא', () => {
    expect(login).not.toContain('setErrorMsg(err?.message ||');
    expect(login).toContain('ההתחברות נכשלה. נסו שוב');
  });
});

describe('דף הנחיתה ומונחים', () => {
  it('אין קישור ל-GitHub', () => {
    expect(src('presentation/pages/LandingPage.tsx')).not.toContain('github.com');
  });
  it('"פח המחזור" נעלם גם מהמנוע הסוקרטי, מהמשימות ומההדרכה', () => {
    for (const p of [
      'infrastructure/services/SocraticEngine.ts',
      'data/sessionTasks.ts',
      'features/workspace/overlays/HelpOverlays.tsx',
    ]) {
      expect(src(p), p).not.toContain('פח המחזור');
    }
  });
});

describe('קוד מת ומפה לא חסומה', () => {
  it('PedagogicalReportService ו-SilentAdaptationPanel אינם קיימים', () => {
    expect(() => src('infrastructure/services/PedagogicalReportService.ts')).toThrow();
    expect(() => src('presentation/pages/TeacherDashboard/components/SilentAdaptationPanel.tsx')).toThrow();
  });
  it('מפת השמות בצ׳אט מורה-מנהל חסומה ל-12 רשומות תקפות', () => {
    const chat = repo('functions/src/teacherAdminChat.ts');
    expect(chat).toContain('.slice(0, 12)');
    expect(chat).toContain('name.length <= 40');
    expect(chat).not.toContain('Object.assign(knownNameMap, ephemeral_name_map)');
  });
});
