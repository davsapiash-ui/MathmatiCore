// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { TRAIL_STYLES, mouseTailFor, loadTrailStyle, saveTrailStyle } from '../replayTrail';

describe('replay mouse trail options', () => {
  beforeEach(() => localStorage.clear());

  it('offers off, soft, standard and long, in that order', () => {
    expect(TRAIL_STYLES.map((t) => t.id)).toEqual(['off', 'soft', 'standard', 'long']);
  });

  it('"סמן בלבד" turns the trail off and keeps the cursor', () => {
    expect(mouseTailFor('off')).toBe(false);
  });

  it('standard is rrweb\'s red trail; soft is thinner and shorter; long stays longer', () => {
    const standard = mouseTailFor('standard');
    const soft = mouseTailFor('soft');
    const long = mouseTailFor('long');
    expect(standard).toMatchObject({ strokeStyle: 'red', lineWidth: 3, duration: 500 });
    expect(soft && standard && soft.lineWidth < standard.lineWidth && soft.duration < standard.duration).toBe(true);
    expect(long && standard && long.duration > standard.duration).toBe(true);
  });

  it('remembers the teacher\'s choice; defaults to standard', () => {
    expect(loadTrailStyle()).toBe('standard');
    saveTrailStyle('soft');
    expect(loadTrailStyle()).toBe('soft');
    localStorage.setItem('replay_trail_style', 'nonsense');
    expect(loadTrailStyle()).toBe('standard');
  });
});
