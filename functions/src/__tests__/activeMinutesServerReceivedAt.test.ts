import { describe, it, expect } from 'vitest';
import { activeMinutesOfEvents, eventArrivalMs, noteEventArrival, serverReceivedAtMs } from '../meetingMetrics';

/**
 * PRD 14 §ב0 / 23 §ב: "דקות פעילות = מספר הדקות השלמות שבהן הגיע מהלומד לפחות
 * אירוע טלמטריה אחד במפגש". PRD Module 5 §ב: the server stamps every event with
 * server_received_at (firestore.rules: == request.time). The minute an event
 * arrived is read from that stamp; createTime and client_timestamp are
 * fallbacks for events stored before the stamp existed.
 */

const ts = (ms: number) => ({ toMillis: () => ms });
const MIN = 60_000;
const T0 = 1_790_000_000_000 - (1_790_000_000_000 % MIN);

describe('active minutes read server_received_at (scoring S11)', () => {
  it('reads a Firestore Timestamp, a Date and a number; anything else is unknown', () => {
    expect(serverReceivedAtMs({ server_received_at: ts(T0) })).toBe(T0);
    expect(serverReceivedAtMs({ server_received_at: new Date(T0) })).toBe(T0);
    expect(serverReceivedAtMs({ server_received_at: T0 })).toBe(T0);
    expect(serverReceivedAtMs({ server_received_at: 'soon' })).toBeNull();
    expect(serverReceivedAtMs({})).toBeNull();
    expect(serverReceivedAtMs(null)).toBeNull();
  });

  it('the stamp wins over the noted createTime and over the device clock', () => {
    const e = { client_timestamp: T0 - 30 * MIN, server_received_at: ts(T0 + 5 * MIN) };
    noteEventArrival(e, T0 + 9 * MIN);
    expect(eventArrivalMs(e)).toBe(T0 + 5 * MIN);
  });

  it('an event without the stamp falls back to createTime, then to client_timestamp', () => {
    const noted = { client_timestamp: T0 };
    noteEventArrival(noted, T0 + 2 * MIN);
    expect(eventArrivalMs(noted)).toBe(T0 + 2 * MIN);
    expect(eventArrivalMs({ client_timestamp: T0 + 3 * MIN })).toBe(T0 + 3 * MIN);
  });

  it('counts the minutes the events reached the server, not the minutes on a wrong tablet clock', () => {
    // A tablet clock that runs an hour behind and sent everything in one burst
    // after reconnecting: its client_timestamps span three minutes, but every
    // event reached the server within one minute.
    const events = [0, 1, 2].map((i) => ({
      client_timestamp: T0 - 60 * MIN + i * MIN,
      server_received_at: ts(T0 + i * 1000),
    }));
    expect(activeMinutesOfEvents(events)).toBe(1);
  });
});
