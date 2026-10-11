import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/** Fixes from the system check of 1.10.2026. */
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

describe('Admin: reset to the pilot structure keeps every staff member (owner, 11.10.2026)', () => {
  const store = src('application/useAdminStore.ts');
  const reset = store.slice(store.indexOf('resetInstitutionsToOfficialPilot: async'), store.indexOf('setGlobalStudentLimit: async'));

  it('removes no teacher and no login right', () => {
    expect(reset).not.toContain('removeAuthorizedTeacherFirestore');
    expect(reset).toContain('teachers: [cleanTeacher, ...keptTeachers]');
    expect(reset).not.toMatch(/teacherWipe|] = null/);
  });

  it('never removes an admin entry when a teacher is removed', () => {
    const auth = src('infrastructure/services/AuthService.ts');
    const fn = auth.slice(auth.indexOf('export async function removeAuthorizedTeacherFirestore'));
    expect(fn.slice(0, 900)).toContain('role === "admin"');
  });
});

describe('Admin: an empty system is not seeded with a made-up school', () => {
  it('has no seeding on the admin load', () => {
    const sync = src('infrastructure/services/FirebaseSyncService.ts');
    expect(sync).not.toContain('seedDefaultData');
    expect(sync).not.toContain("'teacher_mock_1'");
  });
});

describe('Radar: a help call from the chat can be taken back', () => {
  it('the chat call writes only helpRequested, and the take-back clears the old flags', () => {
    const chat = src('features/workspace/overlays/StudentChatOverlay.tsx');
    const call = chat.slice(chat.indexOf('const handleCallTeacher'), chat.indexOf('radar_alerts/'));
    expect(call).toContain('helpRequested: true');
    expect(call).not.toContain('handRaised: true');
    expect(call).not.toContain('isStruggling: true');

    const ws = src('application/useWorkspaceStore.ts');
    const start = ws.indexOf("'Student took back the silent help call'");
    const takeBack = ws.slice(start, ws.indexOf("'HELP_WITHDRAWN'", start));
    expect(takeBack).toContain('helpRequested: false');
    expect(takeBack).toContain('handRaised: false');
    expect(takeBack).toContain('isStruggling: false');
  });
});

describe('Meeting 2 reopened after the learner moved on', () => {
  it('waits instead of starting the diagnostic again', () => {
    const page = src('features/workspace/StudentWorkspacePage.tsx');
    const guard = page.indexOf("meeting === 2 &&\n          (myData?.completedMeeting2 === true ||");
    const guardCrlf = page.indexOf("meeting === 2 &&\r\n          (myData?.completedMeeting2 === true ||");
    const at = guard >= 0 ? guard : guardCrlf;
    expect(at).toBeGreaterThan(-1);
    const after = page.slice(at, at + 900);
    expect(after.indexOf('waitForApprovedPath();')).toBeGreaterThan(-1);
    expect(after.indexOf('waitForApprovedPath();')).toBeLessThan(after.indexOf('initSession(meeting'));
  });
});

describe('Fix round 3', () => {
  it('a conversion time nobody measured is not shown as "(0 שנ׳)"', () => {
    const svc = src('infrastructure/services/LearnerJourneyService.ts');
    expect(svc).toContain("typeof d.duration_ms === 'number' && d.duration_ms > 0");
  });

  it('the hesitation radar is off on the meeting-8 reflection board', () => {
    const page = src('features/workspace/StudentWorkspacePage.tsx');
    expect(page).toMatch(/isActive: !isOverlayActive && flowStatus !== 'choice_branch' && flowStatus !== 'reflection'/);
  });

  it('the class screens sit outside the inert workspace; no quiet-mode wrapper (owner, 11.10.2026)', () => {
    const page = src('features/workspace/StudentWorkspacePage.tsx');
    expect(page).not.toContain('data-quiet');
    const inertAt = page.indexOf('inert={isClassScreenUp || undefined}');
    const dragOverlayAt = page.indexOf('<DragOverlay');
    const overlaysAt = page.lastIndexOf('{classStateOverlays}', dragOverlayAt);
    expect(inertAt).toBeGreaterThan(-1);
    expect(overlaysAt).toBeGreaterThan(inertAt);
  });
});
