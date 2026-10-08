/**
 * PRD Module 2 §א (v7.9): not signed in → /login; a teacher or admin whose
 * address is not on the authorized list → signed out → /login; a signed-in
 * user on another role's route → own home (learner /hub, teacher /dashboard,
 * admin /admin); an unknown address → /; after a reset the learner → /hub.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { decideRoute, ROLE_HOME, type AppRole } from '@/core/routeAccess';

const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');
const ALL: AppRole[] = ['student', 'teacher', 'admin'];

describe('Module 2 §א — the route guard', () => {
  it('not signed in: every protected route goes to /login, nobody is signed out', () => {
    for (const allowed of [['student'], ['teacher'], ['admin']] as AppRole[][]) {
      expect(decideRoute({ isAuthenticated: false, role: null, staffAuthorized: false, allowedRoles: allowed }))
        .toEqual({ kind: 'redirect', to: '/login', logout: false });
    }
  });

  it('staff not on the authorized list: signed out and sent to /login, on any route', () => {
    for (const role of ['teacher', 'admin'] as const) {
      for (const allowed of [['student'], ['teacher'], ['admin']] as AppRole[][]) {
        expect(decideRoute({ isAuthenticated: true, role, staffAuthorized: false, allowedRoles: allowed }))
          .toEqual({ kind: 'redirect', to: '/login', logout: true });
      }
    }
  });

  it('a signed-in user on another role\'s route goes to their own home', () => {
    expect(ROLE_HOME).toEqual({ student: '/hub', teacher: '/dashboard', admin: '/admin' });
    for (const role of ALL) {
      for (const other of ALL.filter((r) => r !== role)) {
        expect(decideRoute({ isAuthenticated: true, role, staffAuthorized: true, allowedRoles: [other] }), `${role} on ${other}`)
          .toEqual({ kind: 'redirect', to: ROLE_HOME[role], logout: false });
      }
      expect(decideRoute({ isAuthenticated: true, role, staffAuthorized: true, allowedRoles: [role] })).toEqual({ kind: 'allow' });
    }
  });

  it('a learner needs no staff list', () => {
    expect(decideRoute({ isAuthenticated: true, role: 'student', staffAuthorized: false, allowedRoles: ['student'] }))
      .toEqual({ kind: 'allow' });
  });

  it('a role that is none of the three is never let through', () => {
    expect(decideRoute({ isAuthenticated: true, role: 'integrator', staffAuthorized: true, allowedRoles: ['teacher'] }).kind)
      .toBe('redirect');
  });

  it('App.tsx: the lobby and the workspace are learner-only, every route is guarded, and an unknown path goes to /', () => {
    const app = src('App.tsx');
    const guardOf = (path: string) => {
      const at = app.indexOf(`path="${path}"`);
      expect(at, path).toBeGreaterThan(-1);
      return /allowedRoles=\{([^}]+)\}/.exec(app.slice(at))?.[1];
    };
    for (const p of ['/hub', '/student/lobby', '/workspace']) expect(guardOf(p), p).toBe('STUDENT_ONLY');
    for (const p of ['/dashboard', '/teacher/dashboard', '/reports/student/:id', '/projector']) expect(guardOf(p), p).toBe('TEACHER_ONLY');
    expect(guardOf('/admin')).toBe('["admin"]');
    expect(app).toContain('const STUDENT_ONLY: readonly AppRole[] = ["student"];');
    expect(app).not.toContain('allowedRoles={["student", "teacher"]}');
    expect(app).toContain('<Route path="*" element={<Navigate to="/" replace />} />');
    expect(app).toContain('decideRoute({');
  });

  it('after a reset the learner returns to the lobby', () => {
    const ws = src('features/workspace/StudentWorkspacePage.tsx');
    expect(ws).toMatch(/forceReload === true\)[\s\S]{0,300}window\.location\.href = '\/hub'/);
  });
});
