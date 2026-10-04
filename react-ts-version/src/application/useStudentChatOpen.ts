import { create } from 'zustand';

/**
 * Whether the learner's chat panel is open (StudentChatOverlay). Shared so
 * that the coaching card can fold into a small tab while the chat is open
 * (owner, 4.10.2026, A7-002): the chat panel is fixed to the bottom-left
 * corner and on a 585–768px-high screen it covered the card's answers.
 * Not workspace state: nothing here is saved, restored or sent.
 */
export const useStudentChatOpen = create<{ open: boolean }>(() => ({ open: false }));

/** Close the learner's chat (the folded card's tab: the card comes back as the chat goes). */
export function closeStudentChat(): void {
  useStudentChatOpen.setState({ open: false });
}
