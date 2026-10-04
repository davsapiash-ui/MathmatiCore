/**
 * Joins the sentences a read-aloud button says in one go: a question and its
 * options, a hint and the lock sentence. A sentence that already ends with
 * its own mark keeps it — a question was said as "…מה ישתנה?." before
 * (audit 4.10.2026, A6-101) — and one without a mark gets a period, so the
 * voice pauses between them.
 */
export function joinSpokenSentences(sentences: string[]): string {
  return sentences
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s, i, all) => (i < all.length - 1 && !/[.?!:]$/.test(s) ? `${s}.` : s))
    .join(' ');
}
