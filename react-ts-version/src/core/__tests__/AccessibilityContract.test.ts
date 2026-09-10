import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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
});

describe('מסמך העיצוב §2.3 — אפס מונחי פיתוח בממשק', () => {
  const SURFACES = [
    'src/presentation/pages/TeacherDashboard/ClassManagement.tsx',
    'src/presentation/pages/TeacherDashboard/components/ResetConfirmationModal.tsx',
    'src/presentation/pages/TeacherDashboard/components/SilentAdaptationPanel.tsx',
    'src/features/workspace/WorkspaceTopbar.tsx',
  ];

  it.each(SURFACES)('%s אינו מציג מספרי מודולים או מונחי פיתוח למשתמש', (file) => {
    const src = read(file);
    // רק טקסט שמוצג בפועל; הערות בקוד מותרות ורצויות.
    const visible = src
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    expect(visible).not.toMatch(/>[^<]*\(Module \d+\)/);
    expect(visible).not.toMatch(/>[^<]*Audit Trail/);
    expect(visible).not.toMatch(/'[^']*\((?:Online|Offline)\)'/);
  });
});
