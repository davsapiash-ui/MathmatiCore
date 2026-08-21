import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { 
  evaluateDeviceOwnership, 
  canWriteWorkspaceData 
} from '@/features/workspace/StudentWorkspacePage';

describe('Device Lock Regression Suite: Direct Ownership & Data Write Blocking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().setSupersededByOtherDevice(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Directly imports evaluateDeviceOwnership from StudentWorkspacePage and verifies lock evaluation', () => {
    const myDevId = 'dev_local_123';
    
    // Case A: Remote device took over ownership in DB
    const resultRemote = evaluateDeviceOwnership('dev_remote_999', myDevId);
    expect(resultRemote.isSuperseded).toBe(true);

    // Case B: Local device is the current owner in DB
    const resultMine = evaluateDeviceOwnership('dev_local_123', myDevId);
    expect(resultMine.isSuperseded).toBe(false);

    // Case C: No remote active device id yet
    const resultEmpty = evaluateDeviceOwnership(null, myDevId);
    expect(resultEmpty.isSuperseded).toBe(false);

    // Case D: Fail-safe lock if myDevId is missing/undefined/null/empty when remote device is recorded in DB
    expect(evaluateDeviceOwnership('dev_remote_999', undefined).isSuperseded).toBe(true);
    expect(evaluateDeviceOwnership('dev_remote_999', null).isSuperseded).toBe(true);
    expect(evaluateDeviceOwnership('dev_remote_999', '').isSuperseded).toBe(true);
  });

  it('2. Directly imports canWriteWorkspaceData from StudentWorkspacePage and verifies guard behavior', () => {
    // Superseded device must NEVER write
    expect(canWriteWorkspaceData('student_user1', true)).toBe(false);

    // Active device is permitted to write
    expect(canWriteWorkspaceData('student_user1', false)).toBe(true);

    // Missing UID must never write
    expect(canWriteWorkspaceData('', false)).toBe(false);
    expect(canWriteWorkspaceData(undefined, false)).toBe(false);
    expect(canWriteWorkspaceData(null, false)).toBe(false);
  });

  it('3. Simulates device lock takeover and verifies write blocking via canWriteWorkspaceData', () => {
    const myDevId = 'dev_local_123';
    let isSupersededRef = false;
    const updateSpy = vi.fn();
    const pushSpy = vi.fn();

    // 1. Remote takeover occurs
    const ownership = evaluateDeviceOwnership('dev_remote_999', myDevId);
    if (ownership.isSuperseded) {
      isSupersededRef = true;
      useWorkspaceStore.getState().setSupersededByOtherDevice(true);
    }

    expect(isSupersededRef).toBe(true);
    expect(useWorkspaceStore.getState().isSupersededByOtherDevice).toBe(true);

    // 2. Attempt workspace state write
    const uid = 'student_user1';
    if (canWriteWorkspaceData(uid, isSupersededRef)) {
      updateSpy('users/students/student_user1', { 'workspaceState/counts': { units: 5 } });
      pushSpy('users/students/student_user1/vector_replays', { actionType: 'BLOCK_DRAG' });
    }

    // Must be completely blocked
    expect(updateSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('4. Simulates heartbeat interval execution and verifies presence write blocking via canWriteWorkspaceData', () => {
    vi.useFakeTimers();
    let isSupersededRef = false;
    const updatePresenceSpy = vi.fn();
    const myDevId = 'dev_local_123';

    // Set up heartbeat interval exactly as structured in StudentWorkspacePage
    const interval = setInterval(() => {
      if (!canWriteWorkspaceData('student_user1', isSupersededRef)) return;

      updatePresenceSpy('users/students/student_user1', {
        isOnline: true,
        lastPing: Date.now(),
      });
    }, 4000);

    // 1. While active: interval fires
    vi.advanceTimersByTime(4000);
    expect(updatePresenceSpy).toHaveBeenCalledTimes(1);

    // 2. Remote device claims ownership
    const takeover = evaluateDeviceOwnership('dev_other_888', myDevId);
    if (takeover.isSuperseded) {
      isSupersededRef = true;
      useWorkspaceStore.getState().setSupersededByOtherDevice(true);
    }
    updatePresenceSpy.mockClear();

    // 3. Advance timers by 12 seconds while superseded
    vi.advanceTimersByTime(12000);

    // Must NOT fire any updates to presence
    expect(updatePresenceSpy).not.toHaveBeenCalled();

    clearInterval(interval);
    vi.useRealTimers();
  });

  it('5. Presence Teardown: active owner writes isOnline:false on exit, but superseded device is blocked', () => {
    const updatePresenceSpy = vi.fn();

    const handleExit = (studentUid: string, isSuperseded: boolean) => {
      if (canWriteWorkspaceData(studentUid, isSuperseded)) {
        updatePresenceSpy(`users/students/${studentUid}`, { isOnline: false, lastPing: 0 });
      }
    };

    // Scenario A: Active owner closes tab -> must write isOnline:false
    handleExit('student_user1', false);
    expect(updatePresenceSpy).toHaveBeenCalledTimes(1);
    expect(updatePresenceSpy).toHaveBeenCalledWith('users/students/student_user1', { isOnline: false, lastPing: 0 });

    updatePresenceSpy.mockClear();

    // Scenario B: Superseded device closes tab -> must NOT write isOnline:false
    handleExit('student_user1', true);
    expect(updatePresenceSpy).not.toHaveBeenCalled();
  });

  it('6. OnDisconnect cancellation: cancels server disconnect hooks when superseded to avoid false offline trigger', () => {
    const cancelDisconnectSpy = vi.fn();
    const setDisconnectSpy = vi.fn();
    const myDevId = 'dev_local_123';

    const handleOwnershipChange = (remoteDevId: string) => {
      const ownership = evaluateDeviceOwnership(remoteDevId, myDevId);
      if (ownership.isSuperseded) {
        cancelDisconnectSpy();
      } else {
        setDisconnectSpy();
      }
    };

    // 1. Remote device takes ownership -> must cancel onDisconnect
    handleOwnershipChange('dev_remote_takeover');
    expect(cancelDisconnectSpy).toHaveBeenCalledTimes(1);
    expect(setDisconnectSpy).not.toHaveBeenCalled();

    cancelDisconnectSpy.mockClear();

    // 2. Local device is owner again -> re-arms onDisconnect
    handleOwnershipChange('dev_local_123');
    expect(setDisconnectSpy).toHaveBeenCalledTimes(1);
    expect(cancelDisconnectSpy).not.toHaveBeenCalled();
  });
});
