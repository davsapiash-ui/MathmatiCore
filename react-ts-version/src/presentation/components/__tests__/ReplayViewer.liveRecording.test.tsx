/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act, screen } from '@testing-library/react';

/**
 * PRD 7.3 Module 21 §ב: the table and the player are linked both ways, and the
 * timeline is split into exercise segments "בדומה לפרקים בנגן וידאו".
 *
 * A learner who is still working writes a chunk about every 2 s, and each one
 * hands the player a new events array. These tests drive the real component
 * against a recording fake of rrweb's Replayer and check what a teacher sees
 * when that happens: the player is not rebuilt from 0:00, is not thrown back
 * to the row she clicked, and stays paused when she paused it.
 */

const instances: FakeReplayer[] = [];
class FakeReplayer {
  calls: Array<[string, number | undefined]> = [];
  private offset = 0;
  events: any[];
  config: any;
  constructor(events: any[], config?: any) {
    this.events = events;
    this.config = config;
    instances.push(this);
  }
  play(t = 0) { this.offset = t; this.calls.push(['play', t]); }
  pause(t?: number) { if (typeof t === 'number') this.offset = t; this.calls.push(['pause', t]); }
  getCurrentTime() { return this.offset; }
  on() {}
  setConfig() {}
}
vi.mock('rrweb', () => ({ Replayer: vi.fn().mockImplementation((events: any[], config?: any) => new FakeReplayer(events, config)) }));
vi.mock('rrweb-player/dist/style.css', () => ({}));

class NoopResizeObserver { observe() {} disconnect() {} }

import { ReplayViewer } from '../ReplayViewer';

const ev = (n: number, start = 1_000_000) =>
  Array.from({ length: n }, (_, i) => ({ type: i === 0 ? 4 : 3, timestamp: start + i * 1000, data: {} }));

beforeEach(() => {
  instances.length = 0;
  (globalThis as any).ResizeObserver = NoopResizeObserver;
});
afterEach(cleanup);

describe('ReplayViewer — a recording that is still being written', () => {
  it('a new chunk resumes where the player was; the last clicked row is not re-applied', () => {
    const first = ev(10);
    const { rerender } = render(<ReplayViewer events={first} seekToTime={1_000_000 + 4000} seekNonce={1} />);
    const a = instances[instances.length - 1];
    // The click on the row: one seek to 0:04.
    expect(a.calls.filter(([k, t]) => k === 'play' && t === 4000)).toHaveLength(1);

    // The teacher lets it run on to 0:07.
    a.play(7000);

    // A chunk arrives: the same recording, two events longer.
    rerender(<ReplayViewer events={ev(12)} seekToTime={1_000_000 + 4000} seekNonce={1} />);
    const b = instances[instances.length - 1];
    expect(b).not.toBe(a);
    expect(b.calls[0]).toEqual(['play', 7000]); // resumed, not 0:00
    expect(b.calls.some(([k, t]) => k === 'play' && t === 4000)).toBe(false); // not thrown back to the row
  });

  it('a chunk that changes nothing keeps the very same player', () => {
    const events = ev(10);
    const { rerender } = render(<ReplayViewer events={events} />);
    const count = instances.length;
    rerender(<ReplayViewer events={[...events]} />); // a new array, same content
    expect(instances.length).toBe(count);
  });

  it('a paused player stays paused when a chunk arrives', () => {
    const { rerender } = render(<ReplayViewer events={ev(10)} />);
    const a = instances[instances.length - 1];
    a.play(3000);
    fireEvent.click(screen.getByRole('button', { name: 'השהו את השחזור' }));
    rerender(<ReplayViewer events={ev(12)} />);
    const b = instances[instances.length - 1];
    expect(b.calls[0]).toEqual(['pause', 3000]);
    expect(screen.getByRole('button', { name: 'הפעילו את השחזור' })).toBeTruthy();
  });

  it('a new click on a row still seeks', () => {
    const { rerender } = render(<ReplayViewer events={ev(10)} seekToTime={1_002_000} seekNonce={1} />);
    rerender(<ReplayViewer events={ev(10)} seekToTime={1_005_000} seekNonce={2} />);
    const a = instances[instances.length - 1];
    expect(a.calls.filter(([k]) => k === 'play').map(([, t]) => t)).toEqual([0, 2000, 5000]);
  });

  it('another meeting starts from its own beginning', () => {
    const { rerender } = render(<ReplayViewer events={ev(10)} />);
    instances[instances.length - 1].play(6000);
    rerender(<ReplayViewer events={ev(10, 5_000_000)} />);
    expect(instances[instances.length - 1].calls[0]).toEqual(['play', 0]);
  });
});

describe('ReplayViewer — the timeline is split into the exercises (Module 21 §ב)', () => {
  it('draws one segment per chapter on the timeline, and a click selects it', () => {
    const onChapterSelect = vi.fn();
    render(
      <ReplayViewer
        events={ev(11)}
        chapters={[
          { start: 1_000_000, end: 1_004_000, label: 'תרגיל 1 — קפיצה לתחילת התרגיל' },
          { start: 1_004_000, end: 1_010_000, label: 'תרגיל 2 — קפיצה לתחילת התרגיל' },
        ]}
        onChapterSelect={onChapterSelect}
      />
    );
    const group = screen.getByRole('group', { name: 'התרגילים במפגש על ציר הזמן' });
    const segments = group.querySelectorAll('button');
    expect(segments).toHaveLength(2);
    expect((segments[0] as HTMLElement).style.left).toBe('0%');
    expect((segments[0] as HTMLElement).style.width).toBe('40%');
    expect((segments[1] as HTMLElement).style.left).toBe('40%');
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'תרגיל 2 — קפיצה לתחילת התרגיל' })); });
    expect(onChapterSelect).toHaveBeenCalledWith(1);
  });
});

describe('ReplayViewer — teacher-dashboard audit, batch F', () => {
  it('the replay does not take the keyboard focus from the teacher\'s page', () => {
    render(<ReplayViewer events={ev(10)} />);
    expect(instances[instances.length - 1].config.triggerFocus).toBe(false);
  });

  it('the recording-event count is not called "פעולות"', () => {
    const { container } = render(<ReplayViewer events={ev(10)} />);
    expect(container.textContent).toContain('10 אירועי הקלטה');
    expect(container.textContent).not.toContain('פעולות');
  });

  it('events without a time are left out: the length is real, and the teacher is told', () => {
    const { container } = render(<ReplayViewer events={[{ type: 99 }, ...ev(10)]} />);
    expect(instances[instances.length - 1].events).toHaveLength(10);
    expect(container.textContent).toContain('00:09');
    expect((container.querySelector('input[type="range"]') as HTMLInputElement).max).toBe('9000');
    expect(screen.getByRole('status').textContent).toBe('חלק מההקלטה פגום ואינו מוצג.');
  });

  it('a whole recording says nothing about broken parts', () => {
    render(<ReplayViewer events={ev(10)} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a recording with no usable event says so instead of a dead player', () => {
    const count = instances.length;
    render(<ReplayViewer events={[{ type: 99 }, { type: 99 }, { type: 99 }]} />);
    expect(instances.length).toBe(count);
    expect(screen.getByRole('alert').textContent).toBe('ההקלטה של המפגש הזה פגומה, ואי אפשר להציג אותה.');
  });

  describe('a meeting that was opened twice', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });
    const DAY = 86_400_000;

    it('the time between the two openings is not played', () => {
      render(<ReplayViewer events={[...ev(5), ...ev(5, 1_000_000 + DAY)]} />);
      const a = instances[instances.length - 1];
      a.play(4500); // just past the last event of the first opening
      act(() => { vi.advanceTimersByTime(250); });
      expect(a.calls[a.calls.length - 1]).toEqual(['play', DAY]);
    });

    it('a pause of the learner inside a lesson plays as it was', () => {
      const events = [...ev(5), ...ev(5, 1_000_000 + 64_000)]; // one minute with nothing recorded
      render(<ReplayViewer events={events} />);
      const a = instances[instances.length - 1];
      a.play(10_000);
      const calls = a.calls.length;
      act(() => { vi.advanceTimersByTime(1000); });
      expect(a.calls.length).toBe(calls);
    });
  });
});
