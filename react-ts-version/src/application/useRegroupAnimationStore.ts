/**
 * The grouping / decomposition animation on the number house — view state only.
 *
 * מסמך 03 §3.4: לחיצה על "קבצו 10" מפעילה "אנימציה שבה 10 יחידות מתמזגות
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
  /** How long this move plays: the full tempo, or the brief one once the
   *  learner has made the same trade a few times this meeting. */
  durationMs: number;
  /** Where the block was let go, in viewport coordinates — a drag right that
   *  breaks a block starts there, not in the column it came from. */
  origin?: { x: number; y: number };
  /** Centres of the blocks that leave the source column, in viewport
   *  coordinates, measured before the board redraws: the ten that group, or
   *  the one that breaks apart — the move starts where the child saw them. */
  fromBlocks?: { x: number; y: number }[];
}

/**
 * The tempo (owner, 7.10.2026). The trade is shown slowly enough to be seen —
 * the seams of the block, the ten pieces in their order, the move one column
 * over — the first times the learner makes it in a meeting; after
 * BRIEF_AFTER_TRADES of the same trade (same kind, same column) it plays
 * briefly: a learner who has understood it no longer waits for it. Nothing is
 * locked either way; the next click or drag cancels the ghost (`toCount`).
 */
export const REGROUP_ANIMATION_MS = 1200;
export const REGROUP_BRIEF_MS = 700;
export const BRIEF_AFTER_TRADES = 3;
/** A brief hold on the landed ghost, so the swap to the real block has no gap. */
const REGROUP_HOLD_MS = 50;
/** The caption stays a moment after the blocks land, long enough to read. */
export const REGROUP_CAPTION_EXTRA_MS = 900;

export interface RegroupCaption {
  id: number;
  kind: RegroupAnimationKind;
  from: Place;
  to: Place;
}

interface RegroupAnimationState {
  current: RegroupAnimation | null;
  /** The trade in words ("עשרת אחת = 10 יחידות"), shown a little longer than the move. */
  caption: RegroupCaption | null;
  play: (move: Omit<RegroupAnimation, 'id'>) => void;
  finish: (id: number) => void;
}

let nextId = 1;
let clearTimer: ReturnType<typeof setTimeout> | null = null;
let captionTimer: ReturnType<typeof setTimeout> | null = null;

export const useRegroupAnimationStore = create<RegroupAnimationState>((set, get) => ({
  current: null,
  caption: null,
  play: (move) => {
    const id = nextId++;
    set({ current: { ...move, id }, caption: { id, kind: move.kind, from: move.from, to: move.to } });
    // The store ends the animation itself, so the hidden blocks come back even
    // when nothing on screen is drawing the ghost (board collapsed, reduced
    // motion, projector page).
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => get().finish(id), move.durationMs + REGROUP_HOLD_MS);
    if (captionTimer) clearTimeout(captionTimer);
    captionTimer = setTimeout(() => {
      captionTimer = null;
      if (get().caption?.id === id) set({ caption: null });
    }, move.durationMs + REGROUP_CAPTION_EXTRA_MS);
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

/** Trades made this meeting, by kind and column — the tempo's memory. */
const tradesThisMeeting = new Map<string, number>();
/** A drop point waiting for the move it causes (set by the board's drag end). */
let pendingOrigin: { x: number; y: number } | null = null;

/** A new meeting starts with the full tempo again (called by initSession). */
export function resetRegroupTempo(): void {
  tradesThisMeeting.clear();
}

/** The board's drag end: where the block was let go, for the move it may cause; null after. */
export function setRegroupOrigin(point: { x: number; y: number } | null): void {
  pendingOrigin = point;
}

/** Called by useWorkspaceStore after a successful grouping or decomposition. */
/**
 * The blocks about to leave `from`, read from the board as it still is: the
 * store has changed the counts, but React has not redrawn the columns yet (the
 * announcement runs in the same event). The last blocks of a column are the
 * ones that go — they are the top of its pile.
 */
function leavingBlocks(from: Place, how: number): { x: number; y: number }[] | undefined {
  if (typeof document === 'undefined') return undefined;
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[id^="column-${from}-"]`))
    .filter((el) => /^column-[a-z]+-\d+$/.test(el.id))
    .sort((a, b) => Number(a.id.split('-').pop()) - Number(b.id.split('-').pop()));
  const leaving = els.slice(-how).map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  if (leaving.length !== how) return undefined;
  return leaving.map((r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }));
}

export function announceRegroup(move: Omit<RegroupAnimation, 'id' | 'durationMs' | 'origin' | 'fromBlocks'>): void {
  const key = `${move.kind}:${move.from}`;
  const before = tradesThisMeeting.get(key) ?? 0;
  tradesThisMeeting.set(key, before + 1);
  const durationMs = before >= BRIEF_AFTER_TRADES ? REGROUP_BRIEF_MS : REGROUP_ANIMATION_MS;
  // Only a split starts where the block was let go: a grouping always starts
  // in its own column (the button at the top of the column, PRD Module 8 §א).
  const origin = move.kind === 'split' && pendingOrigin ? pendingOrigin : undefined;
  pendingOrigin = null;
  const fromBlocks = origin ? undefined : leavingBlocks(move.from, move.kind === 'group' ? 10 : 1);
  useRegroupAnimationStore.getState().play({ ...move, durationMs, ...(origin ? { origin } : {}), ...(fromBlocks ? { fromBlocks } : {}) });
}
