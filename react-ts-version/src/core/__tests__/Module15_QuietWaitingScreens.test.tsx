// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({ UdlSpeechButton: () => null }));
vi.mock('@/presentation/components/ui/LogoutButton', () => ({ LogoutButton: () => null }));
// The real MotionConfig and reduced-motion hooks; motion.div shows what it was asked to animate.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Div = ({ animate, className, children }: { animate?: unknown; className?: string; children?: React.ReactNode }) => (
    <div className={className} data-animate={animate ? JSON.stringify(animate) : ''}>
      {children}
    </div>
  );
  return { ...actual, motion: { div: Div } };
});

import { MotionConfig } from 'framer-motion';
import { ProjectorWaitingScreen } from '@/presentation/components/student/ProjectorWaitingScreen';
import { SessionPausedOverlay } from '@/presentation/components/student/SessionPausedOverlay';
import { SessionClosedOverlay } from '@/presentation/components/student/SessionClosedOverlay';

/**
 * The waiting screens are calm for every child (ASD and special education):
 * no looping animation — no breathing dots, no bobbing or pulsing icon — with
 * or without the teacher's quiet marking. Their texts stay as they were. The
 * only motion left is the screen's own one-time fade in.
 */
const SCREENS: Array<[string, () => React.ReactElement, RegExp]> = [
  ['projector', () => <ProjectorWaitingScreen />, /הקשיבו להסבר של המורה על גבי המקרן/],
  ['paused', () => <SessionPausedOverlay />, /המורה עצרה את הפעילות לרגע/],
  ['closed', () => <SessionClosedOverlay />, /המורה סגרה את התחנה/],
];
/** Every animation a screen asked for that repeats: a keyframe list. */
const loops = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>('[data-animate]')].map((el) => el.getAttribute('data-animate') || '').filter((a) => a.includes('['));

afterEach(() => cleanup());

describe('the waiting screens keep still, for every child', () => {
  for (const [name, screen, text] of SCREENS) {
    for (const reducedMotion of ['always', 'never'] as const) {
      it(`${name} (reducedMotion="${reducedMotion}"): no loop, no breathing dots, the text stays`, () => {
        const { container } = render(<MotionConfig reducedMotion={reducedMotion}>{screen()}</MotionConfig>);
        expect(loops(container)).toEqual([]);
        expect(container.querySelectorAll('.rounded-full.w-2\\.5.h-2\\.5')).toHaveLength(0);
        expect(container.textContent).toMatch(text);
      });
    }
  }
});

describe('PRD Module 15 (v7.15): the projector screen is its one sentence, with no heading above it', () => {
  it('no "הדגמה על גבי המקרן"', () => {
    const { container } = render(<ProjectorWaitingScreen />);
    expect(container.textContent).not.toContain('הדגמה על גבי המקרן');
    expect(container.querySelector('h1, h2, h3')).toBeNull();
    expect(container.textContent?.trim()).toBe('הקשיבו להסבר של המורה על גבי המקרן');
  });
});
