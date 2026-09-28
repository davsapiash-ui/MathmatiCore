import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { ENHANCED_SUPPORT_PROFILE_ID } from '@/core/supportProfile';

/**
 * Whether the learner has the enhanced cognitive support profile ("פרופיל תמיכה
 * קוגניטיבי מוגבר"), which the teacher sets by hand (PRD Module 19 §B).
 *
 * The profile in force is the workspace store's `activeSupportProfileId`:
 * FirebaseSyncService hands the learner record's profile to
 * `receiveSupportProfile`, which applies it at the next exercise. It is the
 * same field the keyboard lock (Module 9), the addition grid (Module 10) and
 * the hesitation radar read, so meeting 2's boxes follow the same switch.
 * (Until #139 the service also copied the profile into a `support_profile_id`
 * store field; that copy is gone, and reading it left every learner — the
 * enhanced profile included — without the place colours and headings.)
 */
export function useEnhancedSupport(): boolean {
  return useWorkspaceStore((s) => s.activeSupportProfileId) === ENHANCED_SUPPORT_PROFILE_ID;
}
