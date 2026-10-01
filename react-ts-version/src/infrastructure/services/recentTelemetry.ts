import type { TelemetryEventType, TelemetryPayload } from '@/types/telemetry';

/**
 * The learner's own recent telemetry, kept in memory for the Socratic engine.
 *
 * PRD Module 13 §א: "מנוע הבינה המלאכותית מקבל כקלט את מטען הטלמטריה ומצב
 * מרחב העבודה של התלמיד"; Appendix A §6 types recent_actions as
 * TelemetryPayload[]. The engine used to receive a list rebuilt from the
 * store's counters, with made-up digits (digit_value 0, is_correct false) and
 * every timestamp "now". Every event the workspace emits passes through
 * FirebaseSyncService.emitTelemetry, which records it here; the engine reads
 * the real events of the exercise the card is about.
 */
const MAX_KEPT = 120;
export const MAX_RECENT_FOR_ENGINE = 30;

let recent: TelemetryPayload<TelemetryEventType>[] = [];

export function recordRecentTelemetry(event: TelemetryPayload<TelemetryEventType>): void {
  recent.push(event);
  if (recent.length > MAX_KEPT) recent = recent.slice(-MAX_KEPT);
}

/**
 * This learner's events in this exercise, oldest first, since the exercise was
 * last loaded (a second attempt does not carry the first one's steps). At most
 * the last MAX_RECENT_FOR_ENGINE.
 */
export function recentTelemetryFor(studentId: number, exerciseId: string): TelemetryPayload<TelemetryEventType>[] {
  const mine = recent.filter((e) => e.student_id === studentId && e.exercise_id === exerciseId);
  let from = 0;
  for (let i = mine.length - 1; i >= 0; i--) {
    if (mine[i].event_type === 'PROBLEM_LOAD') {
      from = i;
      break;
    }
  }
  return mine.slice(from).slice(-MAX_RECENT_FOR_ENGINE);
}

/** For tests. (Another learner on the same device never reads these: the filter is by student_id.) */
export function clearRecentTelemetry(): void {
  recent = [];
}
