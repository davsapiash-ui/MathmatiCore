import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { radarLegendItems, tileInlineMetricsHe } from '@/presentation/pages/TeacherDashboard/components/HeatmapGrid';
import { ROUTE_COLOR } from '@/core/routeColors';

/**
 * The teacher's lesson screen, round three (owner, 11.10.2026, after the
 * 1366×768 screenshots): the side menu is an icon rail below 1600px, the bar is
 * one line, the action buttons are even, the colour map fits one line per row,
 * the normal tile is quiet and only the exceptions stand out, and the teacher
 * screens use one Hebrew face. Measured in a browser at 768×1024, 1366×768,
 * 1600×900 and 1920×1080: no page scroll, no horizontal scroll.
 */
const read = (p: string) => readFileSync(resolve(__dirname, '..', '..', p), 'utf-8');
const dash = read('presentation/pages/TeacherDashboard.tsx');
const heat = read('presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx');
const queue = read('presentation/pages/TeacherDashboard/components/MediationQueue.tsx');
const css = read('index.css');

describe('the side menu', () => {
  it('starts as the icon rail below 1600px; the teacher’s own choice wins and is remembered, guarded', () => {
    expect(dash).toContain("window.matchMedia('(max-width: 1599px)')");
    expect(dash).toContain('const sidebarCollapsed = sidebarChoice ?? isNarrowScreen;');
    expect(dash).toMatch(/try \{ localStorage\.setItem\('teacher_sidebar_collapsed', next \? '1' : '0'\); \} catch/);
  });
  it('labels stay on one line, and the unread badges stay visible on the rail', () => {
    expect(dash).toContain("<span className={sidebarCollapsed ? 'md:sr-only' : 'truncate'}>הרדאר הפדגוגי השקט</span>");
    expect(dash.match(/md:absolute md:top-0\.5 md:left-1\.5/g)?.length).toBe(3);
  });
});

describe('the bar', () => {
  it('one line from 1024px, the open meeting named once (the picker), the short line with the full text as a tooltip', () => {
    expect(dash).toMatch(/data-testid="live-session-bar-row" className="[^"]*lg:flex-nowrap/);
    expect(dash).toContain('{`${onlineCount}/12 מחוברים${elapsedMinutes === null ? \'\' : ` · ${elapsedMinutes} מתוך ${getSessionDurationMinutes(selectedSessionNum)} דק׳`}`}');
    expect(dash).toContain('title={`${onlineCount} מתוך 12 מחוברים');
    // Module 14 §ב0: the picker stays.
    expect(dash).toContain('value={pickedSessionNum}');
  });
  it('"הפעילו מפגש" is shown only when it can be used', () => {
    expect(dash).toContain('{!(isClassSessionActive && pickedSessionNum === selectedSessionNum) && (');
  });
});

describe('the radar', () => {
  it('the action buttons are an even grid: 2×2 in a queue under 360px, one row of four from 360px', () => {
    expect(queue).toContain('[container-type:inline-size]');
    expect(queue).toContain('grid grid-cols-2 [@container(min-width:360px)]:grid-cols-4 gap-1.5');
  });
  it('the colour map rows fit one line; the full sentence is the tooltip', () => {
    const items = radarLegendItems(45);
    expect(items.map((i) => i.short)).toEqual(['עובד', 'היסוס: 45 שנ׳ בלי פעולה', 'כרטיס החניכה פתוח', 'קרא למורה', 'לא מחובר / לא התחיל']);
  });
  it('the normal tile is quiet: no chip, no bar, no shadow; the bar only on blue/red/yellow; a 2px muted level stripe; the help tile keeps a 2px blue ring without glow', () => {
    expect(heat).toContain("(['BLUE', 'RED', 'YELLOW'] as RadarColor[]).includes(tileColourOf(student)) && (");
    expect(ROUTE_COLOR.green_path.stripe).toContain('bg-emerald-300');
    expect(ROUTE_COLOR.remediation_path.stripe).toContain('bg-stone-300');
    expect(ROUTE_COLOR.graded_path.stripe).toContain('bg-violet-400');
    expect(ROUTE_COLOR.graded_foundation_path.stripe).toContain('bg-violet-200');
    expect(heat).toContain('<span className="sr-only">פעיל</span>');
    expect(heat).toContain('absolute inset-x-0 top-0 h-[3px]');
    expect(heat).toContain('absolute inset-y-0 right-0 w-[2px]');
    expect(heat).toContain("' ring-2 ring-blue-500 dark:ring-blue-400'");
    expect(heat).not.toMatch(/hover:shadow-md hover:-translate-y-px/);
  });
});

describe('the inline metrics', () => {
  it('only the ones that are not zero; none at all when every one is zero', () => {
    expect(tileInlineMetricsHe({ hesitationSeconds: 0, undoCount: 0, mistakeCount: 0 })).toEqual([]);
    expect(tileInlineMetricsHe({ hesitationSeconds: 51, undoCount: 0, mistakeCount: 2 })).toEqual(['היסוס: 51 שנ׳', 'טעויות: 2']);
  });
});

describe('the teacher screens’ type', () => {
  it('one Hebrew face, no 800/900, tabular figures, nothing under 12px, set only while the dashboard is mounted', () => {
    expect(css).toContain("font-family: 'Heebo'");
    expect(css).toContain('.teacher-ui .font-black, .teacher-ui .font-extrabold { font-weight: 700; }');
    expect(css).toContain('font-variant-numeric: tabular-nums;');
    expect(css).toContain(".teacher-ui .text-\\[10px\\], .teacher-ui .text-\\[11px\\] { font-size: 12px; }");
    expect(dash).toContain("document.documentElement.classList.add('teacher-ui');");
    expect(dash).toContain("return () => document.documentElement.classList.remove('teacher-ui');");
  });
});
