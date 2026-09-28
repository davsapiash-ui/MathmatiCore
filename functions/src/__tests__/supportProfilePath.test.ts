import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Audit finding X15 (PRD Module 19): the pedagogical report reads the support
 * profile where the teacher's switch writes it — the live learner record
 * users/students/{id} (ClassManagement → buildSupportProfilePayload), which
 * the report already loads as `studentVal`. It used to read Firestore
 * students/{digits}, a document the switch never writes, so every report
 * said "default".
 */
const src = readFileSync(resolve(__dirname, '..', 'pedagogicalReport.ts'), 'utf-8');

describe('the report reads the support profile from the record the teacher writes', () => {
  it('no longer reads Firestore students/{digits}', () => {
    expect(src).not.toMatch(/collection\("students"\)/);
    expect(src).not.toMatch(/studentData\?\.support_profile/);
  });

  it('takes the profile and its version from the live learner record', () => {
    expect(src).toMatch(/studentVal\.support_profile_id === "enhanced_cognitive_support"/);
    expect(src).toMatch(/studentVal\.enhanced_support_profile === true/);
    expect(src).toMatch(/studentVal\.support_profile_version/);
    expect(src).toMatch(/support_profile_id: supportProfileId,/);
  });
});
