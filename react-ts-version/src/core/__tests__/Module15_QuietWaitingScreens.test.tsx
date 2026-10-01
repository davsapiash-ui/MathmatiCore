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
 * Register, quiet profile (מסמך העיצוב §1.3 "מצב שקט חזותי"): the breathing
 * dots of the waiting screens stop for a child the teacher marked quiet. The
 * marking reaches these screens only as <MotionConfig reducedMotion="always">,
 * and the screens read useReducedMotion(), which looks at the device setting
 * alone — so on a device without it the dots went on pulsing in opacity.
 */
const SCREENS: Array<[string, () => React.ReactElement]> = [
  ['projector', () => <ProjectorWaitingScreen />],
  ['paused', () => <SessionPausedOverlay />],
  ['closed', () => <SessionClosedOverlay />],
];
const dots = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.rounded-full.w-2\\.5.h-2\\.5')];

afterEach(() => cleanup());

describe('the waiting screens keep still for a quiet child', () => {
  for (const [name, screen] of SCREENS) {
    it(`${name}: no pulse under the teacher's quiet marking`, () => {
      const { container } = render(<MotionConfig reducedMotion="always">{screen()}</MotionConfig>);
      const found = dots(container);
      expect(found).toHaveLength(3);
      for (const d of found) expect(d.getAttribute('data-animate'), 'no loop').toBe('');
    });

    it(`${name}: the dots still breathe for every other child`, () => {
      const { container } = render(<MotionConfig reducedMotion="never">{screen()}</MotionConfig>);
      const found = dots(container);
      expect(found).toHaveLength(3);
      for (const d of found) expect(d.getAttribute('data-animate')).toContain('opacity');
    });
  }
});
