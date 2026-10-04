import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { getSessionTasks } from '@/data/sessionTasks';

/**
 * Meeting 8 has neither blocks nor a board (מסמך 03 §3.8; PRD Module 14 §ב).
 * A wrong missing digit in its skeleton tasks (s8_r_t7, s8_g_t6, s8_g_t7) used
 * to send the child to check "בעזרת הלבנים בבית המספרים" — two things that
 * are not on that screen. Review of PR #125, item 5.
 */
const ids = ['s8_r_t7', 's8_g_t6', 's8_g_t7'];
const bank = [...getSessionTasks(8, 'green_path'), ...getSessionTasks(8, 'remediation_path')];

describe('meeting 8 skeleton tasks: the feedback names nothing that is not on the screen', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(8, false);
  });

  it.each(ids)('%s — a wrong missing digit', (id) => {
    const task = bank.find((t) => t.id === id)!;
    expect(task, id).toBeDefined();
    useWorkspaceStore.setState({ dynamicTasks: [task], standardTaskIdx: 0 });
    const hidden = [...(task.hiddenDigits?.a ?? []), ...(task.hiddenDigits?.b ?? [])];
    expect(hidden.length).toBeGreaterThan(0);
    const side = task.hiddenDigits?.a ? 'a' : 'b';
    const value = side === 'a' ? task.numberA! : task.numberB!;
    const placeValue = { units: 1, tens: 10, hundreds: 100, thousands: 1000 } as const;
    for (const place of hidden) {
      const right = Math.floor(value / placeValue[place as keyof typeof placeValue]) % 10;
      useWorkspaceStore.getState().setOperandDigit(side, place as any, String((right + 1) % 10));
    }
    useWorkspaceStore.getState().proceed();
    const fb = useWorkspaceStore.getState().feedback;
    expect(fb, id).not.toBeNull();
    // one digit missing in s8_r_t7, two in s8_g_t6, three in s8_g_t7
    expect(fb!.sub).toBe(hidden.length > 1 ? 'לא כל הספרות שכתבתם נכונות. בדקו שוב.' : 'הספרה החסרה שכתבתם אינה נכונה. בדקו שוב.');
    expect(fb!.sub).not.toMatch(/לבנ|בית המספרים/);
  });
});
