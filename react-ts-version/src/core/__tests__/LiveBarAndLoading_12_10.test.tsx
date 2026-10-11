/**
 * @vitest-environment jsdom
 *
 * Owner's decisions of 12.10.2026 on the teacher's live bar, the activation
 * window and the learner's loading screens (PRD Modules 14 and 24 / UDL).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render, screen, cleanup } from '@testing-library/react';
import { SessionActivationModal } from '@/presentation/pages/TeacherDashboard/components/SessionActivationModal';
import { buildSessionRows } from '@/core/sessionPicker';

const read = (p: string) => readFileSync(resolve(__dirname, '..', '..', p), 'utf-8');
const dash = read('presentation/pages/TeacherDashboard.tsx');

afterEach(cleanup);

describe('the live bar', () => {
  it("shows the open meeting's full name, not only as a tooltip and not cut off", () => {
    const at = dash.indexOf('data-testid="live-session-meeting"');
    expect(at).toBeGreaterThan(0);
    const span = dash.slice(dash.lastIndexOf('<span', at), dash.indexOf('</span>', at));
    expect(span).toContain('{meetingLabelHe(selectedSessionNum)}');
    expect(span).not.toMatch(/truncate|sr-only|whitespace-nowrap/);
    // While the meeting is open or paused.
    expect(dash).toContain("{(classSessionStatus === 'active' || classSessionStatus === 'paused') && (\n                  <span data-testid=\"live-session-meeting\"");
  });

  it('the connected learners and the minutes show while the meeting is paused too (PRD 14 §ב)', () => {
    const line = dash.slice(dash.indexOf('data-testid="live-session-line"'), dash.indexOf('</p>', dash.indexOf('data-testid="live-session-line"')));
    expect(line).toContain("{classSessionStatus === 'active' || classSessionStatus === 'paused'");
    expect(line).toContain('data-testid="live-session-status"');
    expect(line).toContain("{classSessionStatus === 'paused' && <>{' · '}{PAUSED_BAR_LINE_HE}</>}");
  });

  it('a meeting opened from the reasons dialog lands on the radar, as from the activation window', () => {
    const start = dash.indexOf('const handleCatchUpChoice');
    const body = dash.slice(start, dash.indexOf('const catchUpNotSavedHe', start));
    expect(body).toContain("const openedMeeting = action === 'reopen' || (d.trigger !== 'close' && d.nextMeeting !== null);");
    expect(body).toContain('if (ok && openedMeeting) handleTabChange("heatmap");');
  });
});

describe('the activation window', () => {
  it('says how long the meeting stays open (PRD 14 §ב0, 45 minutes at most)', () => {
    render(<SessionActivationModal isOpen sessionNumber={4} sessions={buildSessionRows([], null)} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText('המפגש יישאר פעיל עד שתעצרו אותו, תסגרו אותו או תפתחו מפגש אחר, ולכל היותר 45 דקות מההפעלה.')).toBeTruthy();
  });
});

describe("the learner's loading screens are still", () => {
  it('no spinning indicator while the tasks load or the station changes', () => {
    const page = read('features/workspace/StudentWorkspacePage.tsx');
    expect(page).not.toContain('animate-spin text-4xl');
    expect(page).toContain('<div className="text-4xl mb-4" aria-hidden="true">⏳</div>\n        <h2 className="text-xl font-bold">טוענים את המשימות שלכם...</h2>');
  });
});
