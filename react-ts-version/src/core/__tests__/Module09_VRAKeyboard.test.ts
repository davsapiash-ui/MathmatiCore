import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';

describe('Module 09: מודול מקלדת דינמית וגשר VRA (Canonical PRD v7.0)', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
    useAuthStore.setState({ user: null });
  });

  it('remains fully UNLOCKED for standard learners without enhanced_cognitive_support', () => {
    const store = useWorkspaceStore.getState();
    store.initSession(3, false);
    useWorkspaceStore.setState({ support_profile_id: null } as any);
    useAuthStore.setState({ user: { uid: 'student_user1', role: 'STUDENT', support_profile_id: null } as any });

    // 47 + 28 -> Units require regrouping (7 + 8 = 15 >= 10)
    // For standard learners, isColumnInputLocked MUST be false
    const isLockedUnits = useWorkspaceStore.getState().isColumnInputLocked('units', 47, 28, false);
    expect(isLockedUnits).toBe(false);
  });

  it('locks column requiring regrouping strictly when support_profile_id === "enhanced_cognitive_support"', () => {
    const store = useWorkspaceStore.getState();
    store.initSession(3, false);
    useWorkspaceStore.setState({
      support_profile_id: 'enhanced_cognitive_support',
      hasGrouped: false,
      carryDigits: {},
    } as any);

    // 47 + 28 -> Units require regrouping
    const isLockedUnits = useWorkspaceStore.getState().isColumnInputLocked('units', 47, 28, false);
    expect(isLockedUnits).toBe(true);

    // After regrouping is performed in the number house, column unlocks
    useWorkspaceStore.setState({ hasGrouped: true } as any);
    const isUnlockedAfterRegroup = useWorkspaceStore.getState().isColumnInputLocked('units', 47, 28, false);
    expect(isUnlockedAfterRegroup).toBe(false);
  });

  it('completely disables keyboard locking in Session 2 regardless of profile', () => {
    const store = useWorkspaceStore.getState();
    store.initSession(2, false);
    useWorkspaceStore.setState({
      support_profile_id: 'enhanced_cognitive_support',
      hasGrouped: false,
      carryDigits: {},
    } as any);

    const isLockedInS2 = useWorkspaceStore.getState().isColumnInputLocked('units', 47, 28, false);
    expect(isLockedInS2).toBe(false);
  });

  it('completely disables keyboard locking in Session 8 (Independence / Assessment) regardless of profile', () => {
    const store = useWorkspaceStore.getState();
    store.initSession(8, false);
    useWorkspaceStore.setState({
      support_profile_id: 'enhanced_cognitive_support',
      hasGrouped: false,
      carryDigits: {},
    } as any);

    const isLockedInS8 = useWorkspaceStore.getState().isColumnInputLocked('units', 47, 28, false);
    expect(isLockedInS8).toBe(false);
  });
});
