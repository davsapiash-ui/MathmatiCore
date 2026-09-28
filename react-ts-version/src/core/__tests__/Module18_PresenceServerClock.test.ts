import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('@/infrastructure/firebase', () => ({ serverNow: () => 1_000_000 }));

import { isHeartbeatFresh, readLastPing, PRESENCE_FRESH_WINDOW_MS } from '@/core/presence';

/**
 * PRD 18 §ג: "זיהוי ניתוק מבוצע בצד השרת דרך מנגנון Presence Heartbeat (חלון זיהוי מרבי: 15 שניות)".
 * The heartbeat is the server's stamp, and every reader compares it with the
 * server clock.
 */
const src = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf-8');

describe('Module 18 §ג — presence on the server clock', () => {
  it('fresh within 12 seconds either way, on the server clock by default', () => {
    expect(PRESENCE_FRESH_WINDOW_MS).toBe(12_000);
    expect(isHeartbeatFresh(1_000_000 - 3_000)).toBe(true);
    expect(isHeartbeatFresh(1_000_000 - 12_000)).toBe(true);
    expect(isHeartbeatFresh(1_000_000 - 12_001)).toBe(false);
    expect(isHeartbeatFresh(1_000_000 + 2_000)).toBe(true);
  });

  it('0, missing and non-numbers are "no heartbeat"; a pending server-timestamp placeholder is a ping made now', () => {
    expect(readLastPing(0)).toBe(0);
    expect(readLastPing(undefined)).toBe(0);
    expect(readLastPing('123')).toBe(0);
    expect(readLastPing(Number.NaN)).toBe(0);
    expect(isHeartbeatFresh(null)).toBe(false);
    expect(readLastPing({ '.sv': 'timestamp' })).toBe(1_000_000);
    expect(isHeartbeatFresh({ '.sv': 'timestamp' })).toBe(true);
  });

  it('learners stamp lastPing with the server time — never their own clock', () => {
    for (const file of ['features/workspace/StudentWorkspacePage.tsx', 'presentation/pages/StudentHub.tsx', 'infrastructure/services/FirebaseSyncService.ts']) {
      expect(src(file), file).not.toMatch(/lastPing:\s*Date\.now\(\)/);
      expect(src(file), file).toMatch(/lastPing:\s*serverTimestamp\(\)/);
    }
  });

  it('every reader of a learner heartbeat goes through the shared server-clock check', () => {
    for (const file of ['presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx', 'presentation/pages/TeacherDashboard.tsx', 'application/useStore.ts']) {
      expect(src(file), file).toMatch(/isHeartbeatFresh\(/);
      expect(src(file), file).not.toMatch(/Date\.now\(\) - (row|data)\.lastPing|now - lastPing/);
    }
  });
});
