import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { ENHANCED_SUPPORT_PROFILE_ID } from '@/core/supportProfile';

/**
 * Whether the learner has the enhanced cognitive support profile ("פרופיל תמיכה
 * קוגניטיבי מוגבר"), which the teacher sets by hand (PRD Module 19 §B).
 *
 * The profile is `support_profile_id === 'enhanced_cognitive_support'` on the
 * learner's RTDB record (core/supportProfile.ts; the legacy boolean
 * `enhanced_support_profile` is honoured on read). FirebaseSyncService copies
 * the resolved value into the workspace store live, so a change by the teacher
 * reaches the screen without a reload. Read exactly as the keyboard lock
 * (Module 9) and the addition grid (Module 10) read it.
 */
export function useEnhancedSupport(): boolean {
  const fromAuth = useAuthStore((s) => (s.user as { support_profile_id?: string | null } | null)?.support_profile_id);
  const fromWorkspace = useWorkspaceStore((s) => (s as unknown as { support_profile_id?: string | null }).support_profile_id);
  return (fromAuth ?? fromWorkspace) === ENHANCED_SUPPORT_PROFILE_ID;
}
