/**
 * PRD Module 5 §ב: "סדר האירועים בכל קריאה, חישוב ותצוגה: לפי client_timestamp
 * בסדר עולה, ובשוויון לפי sequence_number."
 *
 * One comparator for every reader of telemetry_logs. An event stored before
 * sequence_number existed has none; with equal times it keeps the order it
 * came in (Array.prototype.sort is stable) relative to other such events, and
 * goes before an event that has a number.
 *
 * Import-free on purpose, like researchTelemetryRow.ts.
 */

type Ordered = { client_timestamp?: unknown; sequence_number?: unknown } | null | undefined;

const time = (e: Ordered): number => {
  const t = e?.client_timestamp;
  return typeof t === "number" && Number.isFinite(t) ? t : 0;
};

const seq = (e: Ordered): number => {
  const n = e?.sequence_number;
  return typeof n === "number" && Number.isFinite(n) ? n : -1;
};

/** client_timestamp ascending, ties by sequence_number ascending. */
export function compareTelemetryOrder(a: Ordered, b: Ordered): number {
  return time(a) - time(b) || seq(a) - seq(b);
}
