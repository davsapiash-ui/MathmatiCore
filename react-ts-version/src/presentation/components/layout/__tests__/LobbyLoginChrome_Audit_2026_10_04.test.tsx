/**
 * @vitest-environment jsdom
 *
 * Student-journey audit, 4.10.2026 — group G1 (lobby, sign-in, chrome, end screens).
 * Each block names the verified finding it holds in place.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render, cleanup, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Topbar } from '../Topbar';
import { TeacherWillOpenWaitingScreen } from '@/presentation/components/student/TeacherWillOpenWaitingScreen';
import { Meeting2WaitingScreen } from '@/presentation/components/student/Meeting2WaitingScreen';
import { useAuthStore } from '@/application/useAuthStore';

afterEach(cleanup);

const src = (p: string) => readFileSync(resolve(__dirname, '../../../../', p), 'utf-8');

function topbarAs(role: 'student' | 'teacher', path = '/hub') {
  useAuthStore.setState({
    user: role === 'student'
      ? { uid: 'student_user5', student_id: 5, role: 'student', class_name: 'המבקרים' }
      : { uid: 'teacher_t', email: 't@school.edu', role: 'teacher' },
    role,
    isAuthenticated: true,
  } as any);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Topbar />
    </MemoryRouter>
  );
}

describe('A1-038 — the lobby has one name', () => {
  it('no "בית" subtitle on /hub (the badge says "מרחב הלמידה האישי שלכם")', () => {
    const { container } = topbarAs('student');
    expect(container.textContent).not.toContain('בית');
    expect(src('presentation/pages/StudentHub.tsx')).toContain('<span>מרחב הלמידה האישי שלכם</span>');
  });
});

describe('A1-040 — the cloud on every child screen (PRD 17 §ד)', () => {
  it('the lobby top bar shows the cloud to a learner', () => {
    topbarAs('student');
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('a teacher who opens /hub gets no learner cloud', () => {
    topbarAs('teacher');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('the "המורה תפתח את הפעילות בקרוב." wait shows the cloud in the corner', () => {
    render(<TeacherWillOpenWaitingScreen />);
    const cloud = screen.getByRole('status');
    expect(cloud.className).toContain('fixed');
  });
});

describe('A1-037 / UX-010 — the top bar is 80px everywhere and its class name is readable', () => {
  const topbar = src('presentation/components/layout/Topbar.tsx');
  it('no undefined "h-18" class', () => {
    expect(topbar).not.toContain('h-18');
    expect(topbar).toContain('<header className="h-20 ');
  });
  it('the class name is at least 12px', () => {
    expect(topbar).not.toContain('text-[10px]');
    const { container } = topbarAs('student');
    const name = [...container.querySelectorAll('span')].find((s) => s.textContent === 'המבקרים');
    expect(name?.className).toContain('text-xs');
  });
});

describe('A1-037 — the lobby screens fill the area under the top bar, not 100vh − 72px', () => {
  it('no hard-coded 72px anywhere in the lobby screens', () => {
    expect(src('presentation/pages/StudentHub.tsx')).not.toContain('100vh-72px');
    expect(src('presentation/components/student/Meeting2WaitingScreen.tsx')).not.toContain('100vh-72px');
    expect(src('presentation/pages/StudentHub.tsx')).toContain('<Meeting2WaitingScreen inAppShell ');
  });

  it('in the lobby the meeting-2 wait fills <main>; in the workspace it fills the viewport', () => {
    const lobby = render(<Meeting2WaitingScreen inAppShell />);
    expect((lobby.container.firstChild as HTMLElement).className).toContain('min-h-full');
    cleanup();
    const workspace = render(<Meeting2WaitingScreen />);
    expect((workspace.container.firstChild as HTMLElement).className).toContain('min-h-[100dvh]');
  });
});

describe('UX-013 — the choice screen fits its real container (the viewport)', () => {
  it('no 80px bar subtracted, spacing follows the window height', () => {
    const choice = src('features/workspace/overlays/ReinforcementOrChallengeScreen.tsx');
    expect(choice).not.toContain('100vh-80px');
    expect(choice).toContain('min-h-[100dvh]');
  });
});

describe('A1-075 — the loading gate speaks in the neutral plural', () => {
  it('"מתחברים…", never "מתחבר…"', () => {
    const app = src('App.tsx');
    expect(app).toContain('מתחברים…');
    expect(app).not.toMatch(/מתחבר…/);
  });
});

describe('A1-016 — the public page calls the coaching card by its one name', () => {
  it('"כרטיס החניכה", not "חונך סוקרטי"', () => {
    const landing = src('presentation/pages/LandingPage.tsx');
    expect(landing).toContain('title: "כרטיס החניכה"');
    expect(landing).toContain('desc: "כרטיס ששואל שאלה מכוונת במקום לתת תשובה, וכך התובנה נשארת של התלמידים."');
    expect(landing).not.toContain('חונך');
  });
});
