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
  constructor(events: any[]) {
    this.events = events;
    instances.push(this);
  }
  play(t = 0) { this.offset = t; this.calls.push(['play', t]); }
  pause(t?: number) { if (typeof t === 'number') this.offset = t; this.calls.push(['pause', t]); }
  getCurrentTime() { return this.offset; }
  on() {}
  setConfig() {}
}
vi.mock('rrweb', () => ({ Replayer: vi.fn().mockImplementation((events: any[]) => new FakeReplayer(events)) }));
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
