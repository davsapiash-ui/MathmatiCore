import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';

describe('Module 10: מודול לוח חיבור אדפטיבי מבוקר (Canonical PRD v7.0)', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
    useAuthStore.setState({ user: null });
  });

  it('triggers adaptive addition helper at 30s hesitation strictly for enhanced_cognitive_support', () => {
    const store = useWorkspaceStore.getState();
    store.initSession(3, false);
    useWorkspaceStore.setState({ support_profile_id: 'enhanced_cognitive_support' } as any);

    expect(useWorkspaceStore.getState().isAdditionHelperOpen).toBe(false);

    // 29 seconds of hesitation
    for (let i = 0; i < 29; i++) {
      useWorkspaceStore.getState().tickHesitationTimer();
    }
    expect(useWorkspaceStore.getState().isAdditionHelperOpen).toBe(false);

    // 30th second -> opens addition helper
    useWorkspaceStore.getState().tickHesitationTimer();
    expect(useWorkspaceStore.getState().isAdditionHelperOpen).toBe(true);
  });

  it('does NOT open adaptive addition grid for standard learners without enhanced support', () => {
    const store = useWorkspaceStore.getState();
    store.initSession(3, false);
    useWorkspaceStore.setState({ support_profile_id: null } as any);
    useAuthStore.setState({ user: { uid: 'student_user2', role: 'STUDENT', support_profile_id: null } as any });

    for (let i = 0; i < 35; i++) {
      useWorkspaceStore.getState().tickHesitationTimer();
    }
    expect(useWorkspaceStore.getState().isAdditionHelperOpen).toBe(false);
  });

  it('resets hesitation timer upon cognitive user interaction', () => {
    const store = useWorkspaceStore.getState();
    store.initSession(3, false);
    useWorkspaceStore.setState({ support_profile_id: 'enhanced_cognitive_support' } as any);

    for (let i = 0; i < 20; i++) {
      useWorkspaceStore.getState().tickHesitationTimer();
    }
    expect(useWorkspaceStore.getState().hesitationTimerSeconds).toBe(20);

    // Cognitive interaction recorded (e.g. disk movement, keyboard press)
    store.recordUserInteraction();
    expect(useWorkspaceStore.getState().hesitationTimerSeconds).toBe(0);
  });
});
