import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { payloadByteSize, enforceMaxPayloadBytes, MAX_PAYLOAD_BYTES } from '@/infrastructure/services/FirebaseSyncService';

/**
 * חוזה הנגישות של מסמך העיצוב (DESIGN_SYSTEM_RULES.md), כפי שהוא מיושם
 * בפועל.
 *
 * שלוש הדרישות שנבדקות כאן — טבעת פוקוס על כל אלמנט לחיץ, Escape בכל
 * מגירה וחלון, ומצב שקט חזותי — היו כתובות במסמך אך כמעט לא מומשו. הן
 * נבדקות על הקוד עצמו ולא על התנהגות זמן-ריצה, כי הן חיות ב-CSS
 * גלובלי ובהוק משותף; מה שחשוב לנעול הוא שהמימוש המשותף נשאר במקומו
 * ושאף מסך לא חזר לפתור את זה בעצמו.
 */
const read = (p: string) => readFileSync(resolve(__dirname, '../../..', p), 'utf-8');

const css = read('src/index.css');
const hook = read('src/hooks/useDismissableOverlay.ts');

const OVERLAYS = [
  'src/presentation/pages/TeacherDashboard/components/TeacherGateApprovalDrawer.tsx',
  'src/presentation/pages/TeacherDashboard/components/StudentLearningConditionsDrawer.tsx',
  'src/presentation/pages/TeacherDashboard/components/ResetConfirmationModal.tsx',
  'src/presentation/pages/TeacherDashboard/components/SessionActivationModal.tsx',
  'src/presentation/pages/TeacherDashboard.tsx',
  'src/features/workspace/overlays/SocraticDrawer.tsx',
  'src/features/workspace/overlays/GraphicOrganizerHint.tsx',
  'src/features/workspace/overlays/StudentChatOverlay.tsx',
];

describe('מסמך העיצוב §1.2 — ניווט מקלדת מלא', () => {
  it('טבעת פוקוס מוגדרת גלובלית לכל אלמנט לחיץ', () => {
    expect(css).toMatch(/button:focus-visible/);
    expect(css).toMatch(/\[role="button"\]:focus-visible/);
    expect(css).toMatch(/\[tabindex\]:not\(\[tabindex="-1"\]\):focus-visible/);
    expect(css).toMatch(/outline:\s*3px solid/);
  });

  it('ההוק המשותף מטפל ב-Escape, בלכידת פוקוס ובהחזרתו', () => {
    expect(hook).toContain("e.key === 'Escape'");
    expect(hook).toContain("e.key !== 'Tab'");
    expect(hook).toContain('previouslyFocused.current?.focus?.()');
  });

  it.each(OVERLAYS)('%s נסגר דרך ההוק המשותף ולא במימוש משלו', (file) => {
    const src = read(file);
    expect(src).toContain('useDismissableOverlay');
    // מימוש מקומי של Escape פירושו שמסך אחד יתנהג אחרת מהשאר.
    expect(src).not.toMatch(/window\.addEventListener\('keydown'[\s\S]{0,200}Escape/);
  });

  it('פאנל לא-חוסם אינו לוכד פוקוס — אחרת הלומד ננעל מחוץ ללוח שלו', () => {
    const socratic = read('src/features/workspace/overlays/SocraticDrawer.tsx');
    expect(socratic).toContain('trapFocus: false');
    expect(hook).toContain('trapFocus = true');
  });
});

describe('מסמך העיצוב §1.3 — מצב שקט חזותי', () => {
  it('סימון הרגישות החושית מגיע לשורש מרחב העבודה', () => {
    const page = read('src/features/workspace/StudentWorkspacePage.tsx');
    expect(page).toContain("data-quiet={isASDMode ? 'true' : undefined}");
  });

  it('מצב שקט מכבה תנועה חוזרת ונשנית', () => {
    expect(css).toMatch(/\[data-quiet='true'\] \.animate-pulse/);
    expect(css).toMatch(/\[data-quiet='true'\] \.animate-bounce/);
    expect(css).toMatch(/\[data-quiet='true'\] \.animate-ping/);
  });

  it('תנועה שמלמדת שורדת את מצב השקט', () => {
    expect(css).toMatch(/\[data-quiet='true'\] \.motion-essential/);
    expect(read('src/features/workspace/components/InteractiveTutorialPointer.tsx')).toContain('motion-essential');
  });

  it('העדפת תנועה מופחתת של מערכת ההפעלה מכובדת גלובלית', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]{0,200}animation-duration: 0\.01ms/);
  });

  it('מצב השקט מכסה גם תנועת framer-motion, לא רק כיתות CSS', () => {
    // מסכי ההמתנה מנפישים ב-repeat: Infinity דרך סגנון מוטבע ב-JavaScript.
    // כלל ה-CSS לא נוגע בהם כלל, ולכן הם המשיכו לפעום מול ילד רגיש חושית
    // וגם מול מי שביקש תנועה מופחתת במערכת ההפעלה.
    expect(read('src/App.tsx')).toContain("reducedMotion={isQuiet ? 'always' : 'user'}");
    expect(read('src/features/workspace/StudentWorkspacePage.tsx'))
      .toContain("reducedMotion={isASDMode ? 'always' : 'user'}");
  });

  it('מצב השקט הוא תכונה של הלומד וחל על כל מסך שהוא רואה', () => {
    // הגרסה הראשונה סימנה רק את מרחב העבודה, ולכן הלובי — המסך שילד
    // רגיש חושית מבלה בו הכי הרבה זמן בהמתנה — נשאר פועם.
    const hook = read('src/hooks/useQuietMode.ts');
    expect(hook).toContain("root.setAttribute('data-quiet', 'true')");
    expect(read('src/App.tsx')).toContain('useQuietMode()');
  });
});

describe('מסמך העיצוב §1.1 — אף פעם לא צבע בלבד', () => {
  it('ספרה שנפרטה מסומנת גם בטקסט ולא רק בקו אדום', () => {
    const task = read('src/features/workspace/tasks/VerticalAdditionTask.tsx');
    expect(task).toContain('נפרטה');
    expect(task).toMatch(/aria-label=\{[\s\S]{0,200}נפרטה/);
  });

  it('תא ברדאר מוקרא כמשפט אחד ולא כרצף תגיות', () => {
    const grid = read('src/presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx');
    expect(grid).toContain('describeRadarCell');
    expect(grid).toMatch(/aria-label=\{describeRadarCell\(/);
  });

  it('תגית הודעה חדשה אומרת מה היא, ולא רק מאירה באדום', () => {
    const topbar = read('src/features/workspace/WorkspaceTopbar.tsx');
    expect(topbar).toContain('יש הודעה חדשה מהמורה');
  });

  it('מונה הטור מוכרז עם שם הטור ולא כמספר ערום', () => {
    // אזור ההכרזה קרא את תוכן התגית בלבד, ולכן לומד שנעזר בהקראה שמע
    // "3", "4", "3" בלי לדעת על איזה טור מדובר.
    const column = read('src/features/workspace/board/PlaceColumn.tsx');
    expect(column).toMatch(/aria-live="polite" className="sr-only"/);
    expect(column).toMatch(/\$\{PLACE_NAMES_HE\[place\]\}: \$\{count\}/);
  });
});

describe('כפתור מושבת אומר מה חסר', () => {
  it('סיום הרפלקציה מסביר לילד מה נשאר לבחור', () => {
    const reflection = read('src/features/workspace/ReflectionScreen.tsx');
    expect(reflection).toContain('נשאר לבחור כמה השתדלתם היום');
    expect(reflection).toContain('נשאר לסמן לפחות כלי אחד שעזר לכם');
  });

  it('נעילת חלונית החניכה מסבירה למה, כמה זמן, ומה כן אפשר לעשות', () => {
    const help = read('src/features/workspace/overlays/HelpOverlays.tsx');
    expect(help).toContain('החלונית נעולה לחשיבה');
    expect(help).toContain('לוח הדינס וכפתור הביטול');
    // הודעת ההמתנה עצמה לא מהבהבת — היא מוצגת ברגע של תסכול.
    expect(help).not.toMatch(/החלונית נעולה[\s\S]{0,400}animate-pulse/);
  });
});

describe('משוב פדגוגי נאמר, לא רק מצויר', () => {
  // הרגע שבו הילד מקבל תשובה על הבחירה שלו הוא הרגע הלימודי עצמו.
  // הוא הופיע במסך בלי שום הכרזה, כך שילד שנעזר בהקראה בחר אפשרות
  // ולא קיבל שום סימן שמשהו קרה.
  it.each([
    ['src/features/workspace/overlays/SocraticDrawer.tsx', 'feedbackMsg'],
    ['src/features/workspace/overlays/HelpOverlays.tsx', 'feedbackHint'],
  ])('%s מכריז על המשוב', (file, marker) => {
    const src = read(file);
    expect(src).toContain(marker);
    expect(src).toMatch(/role="status"\s*\n\s*aria-live="assertive"/);
  });

  it('נעילת ההמתנה בכרטיס החניכה מוכרזת גם היא', () => {
    const drawer = read('src/features/workspace/overlays/SocraticDrawer.tsx');
    expect(drawer).toMatch(/role="status"[\s\S]{0,600}רגע לחשיבה/);
  });
});

describe('מודול 13 — כלל הברזל חל על כל כרטיס, לא רק על תשובת הבינה', () => {
  it('כל כרטיס שיוצא מהמנוע עובר את שער התוכן', () => {
    const engine = read('src/infrastructure/services/SocraticEngine.ts');
    expect(engine).toContain('private static enforceIronRule');
    // getSynchronousTaskHint הוא הפתח היחיד לכרטיסים הסטטיים, והוא עוטף
    // את הפתרון בשער.
    expect(engine).toMatch(/getSynchronousTaskHint[\s\S]{0,400}enforceIronRule\(/);
  });
});

describe('מסמך העיצוב §2.3 — אפס מונחי פיתוח בממשק', () => {
  const SURFACES = [
    'src/presentation/pages/TeacherDashboard/ClassManagement.tsx',
    'src/presentation/pages/TeacherDashboard/components/ResetConfirmationModal.tsx',
    'src/presentation/pages/TeacherDashboard/components/SilentAdaptationPanel.tsx',
    'src/features/workspace/WorkspaceTopbar.tsx',
    'src/presentation/pages/admin/AdminWizardModal.tsx',
    'src/presentation/pages/admin/AdminSchoolsView.tsx',
    'src/presentation/pages/admin/AdminOverview.tsx',
    'src/presentation/pages/admin/AdminCurriculumView.tsx',
    'src/presentation/pages/admin/AdminSupportHubView.tsx',
    'src/presentation/pages/admin/AiEngineStatusCard.tsx',
  ];

  it.each(SURFACES)('%s אינו מציג מספרי מודולים או מונחי פיתוח למשתמש', (file) => {
    const src = read(file);
    // רק טקסט שמוצג בפועל; הערות בקוד מותרות ורצויות.
    const visible = src
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    expect(visible).not.toMatch(/>[^<]*\(Module \d+\)/);
    expect(visible).not.toMatch(/>[^<]*\(מודול \d+/);
    expect(visible).not.toMatch(/["'][^"']*\(מודול \d+/);
    expect(visible).not.toMatch(/>[^<]*Audit Trail/);
    expect(visible).not.toMatch(/'[^']*\((?:Online|Offline)\)'/);
  });
});

describe('מודול 5 — מגבלת מטען של 50KB', () => {
  it('מודדת בייטים אמיתיים של UTF-8, לא תווים', () => {
    // עברית היא שני בייטים לתו. המדידה הקודמת ספרה תווים, ולכן מטען
    // עברי כפול מגודלו עבר את הבדיקה.
    const hebrew = { t: 'א'.repeat(1000) };
    expect(payloadByteSize(hebrew)).toBeGreaterThan(JSON.stringify(hebrew).length);
  });

  it('מטען קטן עובר כמות שהוא', () => {
    const small = { sessionNumber: 3, counts: { units: 4 } };
    expect(enforceMaxPayloadBytes(small)).toBe(small);
  });

  it('מטען חורג מוחזר מתחת למגבלה, תמיד', () => {
    const huge = {
      sessionNumber: 4,
      standardTaskIdx: 2,
      flowStatus: 'active',
      keyboardState: 'UNLOCKED',
      undoCount: 1,
      hesitationCount: 0,
      hasInteracted: true,
      isASD: false,
      currentTask: { id: 'ex_1', titleHe: 'כ'.repeat(30000), instructionHe: 'ה'.repeat(30000) },
      qflow: { results: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`task${i}`, { detail: 'ד'.repeat(2000) }])) },
    };
    const out = enforceMaxPayloadBytes(huge);
    expect(payloadByteSize(out)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
    // הגרעין שמאפשר לשחזר את מצב הלומד שורד בכל מקרה.
    expect(out.sessionNumber).toBe(4);
    expect(out.standardTaskIdx).toBe(2);
  });
});
