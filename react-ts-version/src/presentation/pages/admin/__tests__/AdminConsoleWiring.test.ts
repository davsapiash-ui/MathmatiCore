import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Three admin-console defects that are invisible from the UI — each control
 * looked functional and reported success while doing nothing. They are pinned
 * here at their source because all three live in Firebase/HTTP paths that have
 * no seam to unit-test without standing up a live backend.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8');

describe('Admin console — wiring that silently did nothing', () => {
  it('addTeacher sanitizes the RTDB key instead of using a raw email', () => {
    // A raw email contains '.', which RTDB rejects as a key segment: ref()
    // threw, the caller's .catch swallowed it, and the teacher was never
    // persisted despite appearing in local state.
    const sync = read('../../../../infrastructure/services/FirebaseSyncService.ts');
    const addTeacher = sync.slice(sync.indexOf('public async addTeacher'));
    const body = addTeacher.slice(0, addTeacher.indexOf('public async deleteTeacher'));

    expect(body.includes('const id = ssoEmail;')).toBe(false);
    expect(body.includes("replace(/[@.#$[\\]]/g, '_')")).toBe(true);
  });

  it('does not let the admin batch-activate a session for every class', () => {
    // Module 14: a session opens only through an explicit, per-class teacher
    // confirmation. The removed control also wrote active_session_id to
    // Firestore paths no client reads, so it was a no-op that toasted success.
    const view = read('../AdminCurriculumView.tsx');

    expect(view.includes('handleBatchDistribute')).toBe(false);
    expect(view.includes('active_batch_session')).toBe(false);
    expect(view.includes('active_session_id')).toBe(false);
    // The legitimate Module 26 action — publishing the exercise banks the
    // client actually reads from curriculum_catalog — must survive.
    expect(view.includes('handlePublishCatalog')).toBe(true);
    expect(view.includes('curriculum_catalog')).toBe(true);
  });

  it('clamps the student limit to the ceiling the server rules enforce', () => {
    // firestore.rules pins student_id to 1..12 and student_count <= 12, so a
    // saved limit above 12 could never be honored.
    const view = read('../AdminSchoolsView.tsx');

    expect(view.includes('MAX_STUDENTS_PER_CLASS = 12')).toBe(true);
    expect(view.includes('num <= MAX_STUDENTS_PER_CLASS')).toBe(true);
    expect(view.includes('!isNaN(num) && num > 0')).toBe(false);
  });

  it('the settings screen no longer renders controls with no handler', () => {
    const view = read('../AdminSettingsView.tsx');

    // A <select> with no onChange and a checkbox with defaultChecked and no
    // onChange were the entire screen; nothing persisted and no theme
    // mechanism exists (nothing ever sets Tailwind's `dark` class).
    expect(view.includes('defaultChecked')).toBe(false);
    expect(view.includes('<select')).toBe(false);
    expect(view.includes('type="checkbox"')).toBe(false);
  });
});
