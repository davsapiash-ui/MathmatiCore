import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative } from 'path';
import {
  CARD_OPEN_HE,
  ERROR_CATEGORY_HE,
  ROUTE_APPROVE_HE,
  ROUTE_NAME_HE,
  TEACHER_GATE_HE,
  routeNameHe,
  radarPathLabelHe,
} from '@/core/routeLabels';
import { getCognitiveGlyph } from '@/presentation/pages/TeacherDashboard/components/HeatmapGrid';

/**
 * Owner decision, 27.9.2026: one wording for the teacher. The routes are
 * "המסלול הירוק" and "מסלול צמצום פערי קדם", the gate is "שער אישור המורה",
 * a learner's open card is "כרטיס החניכה פתוח", and the error categories are
 * "טעות חישוב", "טעות בשלבי הפתרון", "טעות בהבנת ערך המקום". No "צהוב", no
 * "מואץ", no "מאבק", no "שער מעבר" anywhere the teacher reads, and the
 * teacher is addressed in the plural. Labels only: the stored values
 * ('green_path', 'remediation_path', 'calculation' …) and the radar's own
 * internal path values do not change.
 */

const SRC = resolve(__dirname, '../..');
const REPO = resolve(SRC, '../..');
const read = (abs: string) => readFileSync(abs, 'utf-8').replace(/\r\n/g, '\n');
/** Code without comments: comments may quote the old wording on purpose. */
const stripComments = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string) => {
    for (const name of readdirSync(abs)) {
      const full = join(abs, name);
      if (statSync(full).isDirectory()) {
        if (name !== '__tests__') walk(full);
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        out.push(relative(SRC, full).replace(/\\/g, '/'));
      }
    }
  };
  walk(resolve(SRC, dir));
  return out;
}

/** Everything a teacher reads: the dashboard, its components and the teacher's projector and replay. */
const TEACHER_FILES = [
  'presentation/pages/TeacherDashboard.tsx',
  ...filesUnder('presentation/pages/TeacherDashboard'),
  'presentation/pages/ProjectorSandboxPage.tsx',
  'presentation/components/ReplayViewer.tsx',
  'infrastructure/services/LearnerJourneyService.ts',
  'core/catalogFreshness.ts',
];
/** Screens the admin reads that show the same labels. */
const ADMIN_FILES = filesUnder('presentation/pages/admin');
/** The reports the server writes for the teacher. */
const REPORT_FILES = ['pedagogicalReport.ts', 'classReport.ts', 'reportHtml.ts', 'reportAnalysis.ts', 'exportDriveReport.ts'];

const code = (p: string) => stripComments(read(resolve(SRC, p)));
const fnCode = (f: string) => stripComments(read(resolve(REPO, 'functions/src', f)));

function hits(texts: Array<[string, string]>, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const [name, text] of texts) {
    for (const m of text.matchAll(new RegExp(pattern.source, 'g'))) {
      const at = m.index ?? 0;
      out.push(`${name}: …${text.slice(Math.max(0, at - 30), at + 30).replace(/\s+/g, ' ')}…`);
    }
  }
  return out;
}

const teacherTexts = (): Array<[string, string]> => [
  ...TEACHER_FILES.map((f) => [f, code(f)] as [string, string]),
  ...ADMIN_FILES.map((f) => [f, code(f)] as [string, string]),
  ...REPORT_FILES.map((f) => [`functions/src/${f}`, fnCode(f)] as [string, string]),
];

describe('the names, one wording', () => {
  it('the two routes, the approval buttons, the gate, the open card', () => {
    expect(ROUTE_NAME_HE).toEqual({ green_path: 'המסלול הירוק', remediation_path: 'מסלול צמצום פערי קדם' });
    expect(ROUTE_APPROVE_HE).toEqual({ green_path: 'אישור המסלול הירוק', remediation_path: 'אישור מסלול צמצום פערי קדם' });
    expect(TEACHER_GATE_HE).toBe('שער אישור המורה');
    expect(CARD_OPEN_HE).toBe('כרטיס החניכה פתוח');
    expect(routeNameHe('green_path')).toBe('המסלול הירוק');
    expect(routeNameHe('remediation_path')).toBe('מסלול צמצום פערי קדם');
    expect(routeNameHe('x')).toBeNull();
  });

  it('the three error categories; the radar keeps its tile letters', () => {
    expect(ERROR_CATEGORY_HE).toEqual({
      calculation: 'טעות חישוב',
      procedural: 'טעות בשלבי הפתרון',
      conceptual: 'טעות בהבנת ערך המקום',
    });
    expect(getCognitiveGlyph('calculation')).toEqual({ glyph: 'ח', title: 'טעות חישוב (ח)' });
    expect(getCognitiveGlyph('procedural')).toEqual({ glyph: 'ר', title: 'טעות בשלבי הפתרון (ר)' });
    expect(getCognitiveGlyph('conceptual')).toEqual({ glyph: 'מ', title: 'טעות בהבנת ערך המקום (מ)' });
  });

  it('the radar keeps its internal path values and shows the route names', () => {
    expect(radarPathLabelHe('ירוק')).toBe('המסלול הירוק');
    expect(radarPathLabelHe('צמצום פערים')).toBe('מסלול צמצום פערי קדם');
    expect(radarPathLabelHe('טרם נקבעה')).toBe('טרם נקבעה');
  });

  it('the gate tabs, the gate drawer and the approval buttons use them', () => {
    const dash = code('presentation/pages/TeacherDashboard.tsx');
    expect(dash.split('{TEACHER_GATE_HE}').length - 1).toBeGreaterThanOrEqual(4);
    expect(dash).toContain("'ניהול המפגש בזמן אמת'");
    expect(dash).toContain('>המסך של המורה</span>');
    const heat = code('presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx');
    expect(heat).toContain('<span>{ROUTE_APPROVE_HE.green_path}</span>');
    expect(heat).toContain('<span>{ROUTE_APPROVE_HE.remediation_path}</span>');
    expect(heat).toContain('<span>{CARD_OPEN_HE}</span>');
    const cm = code('presentation/pages/TeacherDashboard/ClassManagement.tsx');
    expect(cm).toContain('{ROUTE_APPROVE_HE.green_path}');
    expect(cm).toContain('{ROUTE_APPROVE_HE.remediation_path}');
    for (const f of ['presentation/pages/TeacherDashboard/components/TeacherGateApprovalDrawer.tsx', 'presentation/pages/TeacherDashboard/components/TeacherApprovalGate.tsx']) {
      const text = code(f);
      expect(text, f).toContain('{TEACHER_GATE_HE}');
      expect(text, f).toContain('{ROUTE_NAME_HE.green_path}');
      expect(text, f).toContain('{ROUTE_NAME_HE.remediation_path}');
    }
  });
});

describe('what the teacher no longer reads', () => {
  it('no "צהוב", "מואץ", "מאבק" or "שער מעבר" in any teacher or admin screen or report', () => {
    expect(hits(teacherTexts(), /צהוב|מואץ|מואצ|מאבק|שער מעבר|שער אישור מעבר/)).toEqual([]);
  });

  it('no old name of the open card, no "(PII)", no "בלייב", no "אדמיניסטרטיבית"', () => {
    expect(hits(teacherTexts(), /כרטיס חניכה סוקרטי|חניכה סוקרטית|כרטיס סוקרטי|\(PII\)|בלייב|אדמיניסטרטיבית|מסכי דשבורד המורה/)).toEqual([]);
  });

  it('no old route name on screen — only the radar’s internal values, which are not shown', () => {
    const visible = teacherTexts().map(([n, t]) => [n, t.replace(/'צמצום פערים'|'ירוק'|'צמצום פערי קדם'/g, '')] as [string, string]);
    expect(hits(visible, /מסלול ירוק|מסלול ביסוס|העמקה \(ירוק\)|צמצום פערים|אישור צמצום|אשר ירוק|אשר צמצום/)).toEqual([]);
  });

  it('no old name of an error category', () => {
    expect(hits(teacherTexts(), /מיומנות רכיב|טעות מושגית|שגיאת חישוב|שגיאת מבנה|טעות חישוב בסיסי/)).toEqual([]);
  });
});

describe('the teacher is addressed in the plural', () => {
  const texts = () => TEACHER_FILES.map((f) => [f, code(f)] as [string, string]);

  it('no singular instruction, placeholder, button or question', () => {
    const SINGULAR = /(^|[>"'`( ])(ודא|הקלד|בחר|לחץ|חפש|סמן|בדוק|סגור|נקה|פתח|הפק|הפעל|עצור|בצע|כווץ|הצג|התחל|השהה|נגן)([ .,!:<"'`)]|$)|בדקי|תוכל[ .]|שקלת[ ?]|תרצה|בחרת[ ?]|שקיבלת(?![א-ת])|שלך(?![א-ת])|עליך|ברצונך|החלטתך|אשר\/י|שתפתחי/;
    expect(hits(texts(), SINGULAR)).toEqual([]);
  });

  it('the questions the teacher may ask a learner are plural too', () => {
    const heat = code('presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx');
    expect(heat).toContain('איזה צעד ראשון שקלתם לבצע? מה גורם לכם להתלבט בטור הפעיל?');
    expect(heat).toContain('האם תרצו שנבדוק יחד דוגמה פשוטה יותר במספרים קטנים?');
    expect(heat).toContain('איך תוכלו להסביר את תהליך הפתרון לחבר בכיתה?');
  });
});
