/**
 * Which memory circle the child stands in — view state only, for the column
 * dimming (core/columnFocus.ts).
 *
 * It is kept apart from useWorkspaceStore on purpose: the telemetry reads
 * `focusedPlace` and `activeColumnIndex` there, and the memory circle never set
 * either of them. Lighting its column must not change what the research
 * records (owner's decision, 28.9.2026, register gap יט).
 */
import { create } from 'zustand';
import type { Place } from '@/core/placeValue';

interface BoardFocusState {
  focusedMemoryCircle: Place | null;
  setFocusedMemoryCircle: (place: Place | null) => void;
}

export const useBoardFocusStore = create<BoardFocusState>((set) => ({
  focusedMemoryCircle: null,
  setFocusedMemoryCircle: (place) => set({ focusedMemoryCircle: place }),
}));
