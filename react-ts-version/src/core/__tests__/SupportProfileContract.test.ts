import { describe, it, expect } from 'vitest';
import {
  hasEnhancedSupport,
  buildSupportProfilePayload,
  ENHANCED_SUPPORT_PROFILE_ID,
} from '../supportProfile';

/**
 * PRD v7.1 Modules 9/10/19 — the teacher toggle and the student readers must
 * agree on one contract: support_profile_id === 'enhanced_cognitive_support'.
 * Regression guard for the broken bridge where the teacher wrote a legacy
 * boolean while the student read a string field nobody wrote.
 */
describe('Modules 9/10/19: support profile contract (PRD v7.1)', () => {
  it('write side emits the authoritative support_profile_id field', () => {
    const on = buildSupportProfilePayload(true, 'teacher_1', 3);
    expect(on.support_profile_id).toBe(ENHANCED_SUPPORT_PROFILE_ID);
    expect(on.support_profile_version).toBe(4);
    expect(on.support_profile_updated_by).toBe('teacher_1');
    expect(on.support_profile_updated_at).toBeGreaterThan(0);
    expect(on.enhanced_support_profile).toBe(true);

    const off = buildSupportProfilePayload(false, null);
    expect(off.support_profile_id).toBeNull();
    expect(off.support_profile_version).toBe(1);
    expect(off.support_profile_updated_by).toBeNull();
    expect(off.enhanced_support_profile).toBe(false);
  });

  it('read side resolves what the write side produced (round-trip)', () => {
    expect(hasEnhancedSupport(buildSupportProfilePayload(true, 't'))).toBe(true);
    expect(hasEnhancedSupport(buildSupportProfilePayload(false, 't'))).toBe(false);
  });

  it('read side honors the legacy boolean from pre-v7.1 records', () => {
    expect(hasEnhancedSupport({ enhanced_support_profile: true })).toBe(true);
    expect(hasEnhancedSupport({ enhanced_support_profile: false })).toBe(false);
  });

  it('read side ignores stale physicalOverride flags from legacy drawer writes', () => {
    expect(hasEnhancedSupport({ physicalOverride: true, physicalOverrideActive: true })).toBe(false);
  });

  it('handles null/undefined/empty records safely', () => {
    expect(hasEnhancedSupport(null)).toBe(false);
    expect(hasEnhancedSupport(undefined)).toBe(false);
    expect(hasEnhancedSupport({})).toBe(false);
  });
});
