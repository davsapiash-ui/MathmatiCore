/**
 * @vitest-environment jsdom
 *
 * Rule 6 of the owner's decisions of 28.9.2026 (register שהB.4), in the
 * component: only the exercise's conversion column is locked, a keystroke
 * into it emits KEYBOARD_LOCK_BLOCKED and shakes that box alone, and the
 * other boxes take digits.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const sent = vi.hoisted(() => ({ events: [] as any[] }));
vi.mock('@/infrastructure/services/FirebaseSyncService', async () => {
  const actual = await vi.importActual<any>('@/infrastructure/services/FirebaseSyncService');
  return { ...actual, emitTelemetry: (e: any) => (sent.events.push(e), Promise.resolve()) };
});

import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { getSessionTasks } from '@/data/sessionTasks';
import { EMPTY_COUNTS } from '@/core/placeValue';
import { RepresentationTask } from '../RepresentationTask';

// s3_r_t4: 85 → 7 tens and 15 units; the units receive the decomposition.
const task = getSessionTasks(3 as any, 'remediation_path').find((t) => t.id === 's3_r_t4')!;

beforeEach(() => {
  useWorkspaceStore.getState().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1, support_profile_id: 'enhanced_cognitive_support' } } as any);
  useWorkspaceStore.setState({
    activeSupportProfileId: 'enhanced_cognitive_support', // Module 19 §ב: the applied profile
    sessionNumber: 3, dynamicTasks: [task], standardTaskIdx: 0, flowStatus: 'task',
    counts: { ...EMPTY_COUNTS, tens: 8, units: 5 },
  } as any);
  sent.events.length = 0;
});

describe('RepresentationTask — the enhanced-support lock, per column', () => {
  it('a digit key in the locked box is rejected, logged with its column, and shakes that box only', () => {
    render(<RepresentationTask task={task} />);
    const units = screen.getByLabelText('ספרת היחידות בשורת התוצאה') as HTMLInputElement;
    const tens = screen.getByLabelText('ספרת העשרות בשורת התוצאה') as HTMLInputElement;
    expect(units.readOnly).toBe(true);
    expect(tens.readOnly).toBe(false);
    fireEvent.keyDown(units, { key: '5' });
    const blocked = sent.events.filter((e) => e.event_type === 'KEYBOARD_LOCK_BLOCKED');
    expect(blocked).toHaveLength(1);
    expect(blocked[0].column_index).toBe(0);
    expect(blocked[0].details.conversion_required).toBe('decomposition');
    expect(units.style.animation).toContain('shake');
    expect(tens.style.animation).toBe('');
  });

  it('the open box takes a digit, and the locked one opens after the decomposition', () => {
    render(<RepresentationTask task={task} />);
    const tens = screen.getByLabelText('ספרת העשרות בשורת התוצאה') as HTMLInputElement;
    fireEvent.change(tens, { target: { value: '8' } });
    expect(useWorkspaceStore.getState().answerDigits.tens).toBe('8');
    act(() => useWorkspaceStore.getState().splitBlockClick('tens'));
    const units = screen.getByLabelText('ספרת היחידות בשורת התוצאה') as HTMLInputElement;
    expect(units.readOnly).toBe(false);
  });
});
