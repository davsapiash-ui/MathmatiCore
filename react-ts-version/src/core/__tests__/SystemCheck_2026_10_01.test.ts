import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/** Fixes from the system check of 1.10.2026. */
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

describe('Admin: reset to the pilot structure removes the added teachers', () => {
  const store = src('application/useAdminStore.ts');
  const reset = store.slice(store.indexOf('resetInstitutionsToOfficialPilot: async'), store.indexOf('setGlobalStudentLimit: async'));

  it('reads the teachers to remove before the store is replaced', () => {
    expect(reset.indexOf('const removedTeachers = get().teachers')).toBeGreaterThan(-1);
    expect(reset.indexOf('const removedTeachers = get().teachers')).toBeLessThan(reset.indexOf('set({'));
    expect(reset).not.toContain('for (const teacher of get().teachers)');
  });

  it('also removes their login right (whitelist entry)', () => {
    expect(reset).toContain('removeAuthorizedTeacherFirestore(t.ssoEmail)');
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
