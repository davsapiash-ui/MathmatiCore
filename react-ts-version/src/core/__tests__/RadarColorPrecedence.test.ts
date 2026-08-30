import { describe, it, expect } from 'vitest';
import { resolveRadarColor, RADAR_CELL_CLASSES, type RadarColor } from '../radarColor';

/**
 * PRD v7.1 Module 18 §B — Silent Radar colour precedence:
 * BLUE > RED > GREY > YELLOW > GREEN.
 */
describe('Module 18: Silent Radar colour precedence (PRD v7.1)', () => {
  it('BLUE (help call) wins over every other state, including disconnected', () => {
    expect(resolveRadarColor({ helpRequested: true, socraticActive: true, isOnline: true, hesitationSeconds: 60 })).toBe('BLUE');
    expect(resolveRadarColor({ helpRequested: true, socraticActive: false, isOnline: false, hesitationSeconds: 0 })).toBe('BLUE');
  });

  it('RED (active Socratic card) wins over GREY, YELLOW and GREEN', () => {
    expect(resolveRadarColor({ helpRequested: false, socraticActive: true, isOnline: false, hesitationSeconds: 0 })).toBe('RED');
    expect(resolveRadarColor({ helpRequested: false, socraticActive: true, isOnline: true, hesitationSeconds: 60 })).toBe('RED');
  });

  it('GREY (disconnected) wins over YELLOW and GREEN', () => {
    expect(resolveRadarColor({ helpRequested: false, socraticActive: false, isOnline: false, hesitationSeconds: 60 })).toBe('GREY');
  });

  it('YELLOW at 45 continuous hesitation seconds, GREEN otherwise', () => {
    expect(resolveRadarColor({ helpRequested: false, socraticActive: false, isOnline: true, hesitationSeconds: 45 })).toBe('YELLOW');
    expect(resolveRadarColor({ helpRequested: false, socraticActive: false, isOnline: true, hesitationSeconds: 44 })).toBe('GREEN');
    expect(resolveRadarColor({ helpRequested: false, socraticActive: false, isOnline: true, hesitationSeconds: 0 })).toBe('GREEN');
  });

  it('every colour has a cell class for both themes', () => {
    const colors: RadarColor[] = ['BLUE', 'RED', 'GREY', 'YELLOW', 'GREEN'];
    for (const c of colors) {
      expect(RADAR_CELL_CLASSES[c]).toBeTruthy();
      expect(RADAR_CELL_CLASSES[c]).toContain('border-2');
    }
  });
});
