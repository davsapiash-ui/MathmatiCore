/**
 * PRD v7.1 — Modules 9, 10, 19: canonical support-profile contract.
 *
 * The server-side source of truth is `support_profile_id` on the student
 * record (Appendix A §1). The teacher toggle writes it; the student
 * keyboard lock (Module 9) and adaptive addition grid (Module 10) read it.
 * Legacy boolean fields written by older clients are still honored on read
 * so live classrooms keep working during the transition.
 */

export const ENHANCED_SUPPORT_PROFILE_ID = 'enhanced_cognitive_support' as const;

export type SupportProfileId = typeof ENHANCED_SUPPORT_PROFILE_ID | null;

/** Read-side: resolve enhanced support from a student RTDB/store record. */
export function hasEnhancedSupport(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  if (data.support_profile_id === ENHANCED_SUPPORT_PROFILE_ID) return true;
  // Legacy boolean from pre-v7.1 clients / existing live records.
  // Deliberately NOT falling back to physicalOverride/physicalOverrideActive:
  // live records carry stale `true` values from a legacy drawer write, and
  // honoring them would silently lock keyboards for unaffected students.
  return Boolean((data as { enhanced_support_profile?: unknown }).enhanced_support_profile);
}

/** Write-side: the exact payload the teacher toggle persists (Module 19 §B). */
export function buildSupportProfilePayload(
  enabled: boolean,
  teacherId: string | null,
  previousVersion?: number
): {
  support_profile_id: SupportProfileId;
  support_profile_version: number;
  support_profile_updated_at: number;
  support_profile_updated_by: string | null;
  enhanced_support_profile: boolean;
} {
  return {
    support_profile_id: enabled ? ENHANCED_SUPPORT_PROFILE_ID : null,
    support_profile_version: (typeof previousVersion === 'number' ? previousVersion : 0) + 1,
    support_profile_updated_at: Date.now(),
    support_profile_updated_by: teacherId,
    // Legacy mirror kept in sync so older readers keep working
    enhanced_support_profile: enabled,
  };
}
