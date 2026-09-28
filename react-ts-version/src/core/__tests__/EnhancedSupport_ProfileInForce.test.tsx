// @vitest-environment jsdom
/**
 * Meeting 2's place colours and headings follow the support profile IN FORCE
 * (register decision יב): the workspace store's activeSupportProfileId, which
 * FirebaseSyncService sets through receiveSupportProfile. Since #139 nothing
 * writes the old `support_profile_id` store field, so a hook that read it left
 * the enhanced profile without its cues.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useEnhancedSupport } from '@/features/workspace/tasks/useEnhancedSupport';
import { ENHANCED_SUPPORT_PROFILE_ID } from '@/core/supportProfile';

describe('useEnhancedSupport reads the profile in force', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.setState({ activeSupportProfileId: null, pendingSupportProfileId: null, hasPendingSupportProfile: false, supportProfileApplied: false, flowStatus: 'lobby' } as never);
  });

  it('the enhanced profile received from the learner record turns the cues on', () => {
    useWorkspaceStore.getState().receiveSupportProfile(ENHANCED_SUPPORT_PROFILE_ID);
    const { result } = renderHook(() => useEnhancedSupport());
    expect(result.current).toBe(true);
  });

  it('no profile: no cues', () => {
    useWorkspaceStore.getState().receiveSupportProfile(null);
    const { result } = renderHook(() => useEnhancedSupport());
    expect(result.current).toBe(false);
  });

  it('a stale support_profile_id field alone does not decide it', () => {
    useWorkspaceStore.setState({ support_profile_id: ENHANCED_SUPPORT_PROFILE_ID } as never);
    const { result } = renderHook(() => useEnhancedSupport());
    expect(result.current).toBe(false);
  });
});
