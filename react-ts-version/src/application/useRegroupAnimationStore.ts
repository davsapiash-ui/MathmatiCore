/**
 * The grouping / decomposition animation on the number house — view state only.
 *
 * מסמך 03 §3.4: לחיצה על "הקבץ 10" מפעילה "אנימציה שבה 10 יחידות מתמזגות
 * ללבנת עשרת ארוכה אחת הנודדת שמאלה אל טור העשרות"; §3.5: "לבנת העשרת
 * מתפרקת פיזית לעשר יחידות בודדות הנודדות ימינה אל טור היחידות" (ו-§3.3 מאה
 * לעשרות). Register row 17 (25.9.2026): the owner decided these are built as
 * document 03 describes. PRD Module 8 §א: both decomposition paths (click and
 * drag right) "run the identical animation".
 *
 * This store never touches the board. useWorkspaceStore changes the counts,
 * the undo stack and the telemetry exactly as before, instantly, and then only
 * *announces* what happened here. The board draws a short ghost of the move on
 * top of the columns and keeps the newly arrived blocks invisible until the
 * ghost lands on them — nothing is locked, and the next click or drag works at
 * once (it simply cancels the ghost, see `toCount`).
 */
import { create } from 'zustand';
import type { Place } from '@/core/placeValue';

export type RegroupAnimationKind = 'group' | 'split';

export interface RegroupAnimation {
  /** Increments on every announcement, so a new move always restarts the ghost. */
  id: number;
  /** 'group' = ten blocks merge into one of the next place (travels left in RTL);
   *  'split' = one block breaks into ten of the previous place (travels right). */
  kind: RegroupAnimationKind;
  from: Place;
  to: Place;
  /**
   * How many blocks the destination column holds right after the move. If the
   * learner changes that column before the ghost lands (another drop, undo,
   * trash), the numbers no longer match and the board drops the ghost at once
   * and shows the real blocks — the animation never hides the board's truth.
   */
  toCount: number;
}

/** Merge / break-apart phase, then the travel to the next column. Short and calm. */
export const REGROUP_MERGE_MS = 300;
export const REGROUP_TRAVEL_MS = 450;
export const REGROUP_ANIMATION_MS = REGROUP_MERGE_MS + REGROUP_TRAVEL_MS;
/** A brief hold on the landed ghost, so the swap to the real block has no gap. */
const REGROUP_HOLD_MS = 50;

interface RegroupAnimationState {
  current: RegroupAnimation | null;
  play: (move: Omit<RegroupAnimation, 'id'>) => void;
  finish: (id: number) => void;
}

let nextId = 1;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

export const useRegroupAnimationStore = create<RegroupAnimationState>((set, get) => ({
  current: null,

  play: (move) => {
    const id = nextId++;
    set({ current: { ...move, id } });
    // The store ends the animation itself, so the hidden blocks come back even
    // when nothing on screen is drawing the ghost (board collapsed, reduced
    // motion, projector page).
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => get().finish(id), REGROUP_ANIMATION_MS + REGROUP_HOLD_MS);
  },

  finish: (id) => {
    if (get().current?.id !== id) return;
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    set({ current: null });
  },
}));

/** Called by useWorkspaceStore after a successful grouping or decomposition. */
export function announceRegroup(move: Omit<RegroupAnimation, 'id'>): void {
  useRegroupAnimationStore.getState().play(move);
}
