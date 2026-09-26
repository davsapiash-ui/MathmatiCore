import { useLayoutEffect, useState, type RefObject } from 'react';
import { animate, useReducedMotion, type AnimationPlaybackControls } from 'framer-motion';
import type { Place } from '@/core/placeValue';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import {
  useRegroupAnimationStore,
  REGROUP_ANIMATION_MS,
  REGROUP_MERGE_MS,
  type RegroupAnimation,
} from '@/application/useRegroupAnimationStore';
import { BLOCK_SIZES, BLOCK_SVGS } from './DienesBlock';

/**
 * The grouping / decomposition animation (מסמך 03 §3.3–3.5, register row 17).
 *
 *  - group: the ten blocks gather into one spot in their column and merge into
 *    one block of the next place, which travels left to its column.
 *  - split: the block breaks into ten blocks of the previous place, which
 *    travel right, each to the exact spot where it now sits.
 *
 * The counts have already changed in the store; this layer only draws a ghost
 * of the move over the columns (pointer-events-none — every drop, click and
 * drag below it stays live), and PlaceColumn keeps the arriving blocks
 * invisible until the ghost lands on them.
 *
 * Driven by the imperative animate(): the board lives inside PlaceValueBoard's
 * <AnimatePresence initial={false}>, and framer-motion passes that initial=false
 * down to every motion component mounted later — declarative ghosts rendered
 * straight in their final state (measured on 26.9.2026: final positions from the
 * first frame). animate() on the DOM nodes ignores the presence context.
 *
 * Calm by design: under a second, opacity and position only — no flashing,
 * no bounce, no repeat. A learner whose device asks for reduced motion gets
 * the move instantly, as before. Quiet mode (the teacher's sensory flag) keeps
 * it: document 03 describes this motion as how the child sees ten become one,
 * which is the teaching motion index.css keeps in quiet mode (motion-essential).
 */

/** The regroup to draw right now — null when there is none, the learner asks
 *  for reduced motion, or the destination column changed since it started. */
export function useVisibleRegroup(): RegroupAnimation | null {
  const current = useRegroupAnimationStore((s) => s.current);
  const toCount = useWorkspaceStore((s) => (current ? s.counts?.[current.to] ?? 0 : -1));
  const reduceMotion = useReducedMotion();
  if (!current || reduceMotion) return null;
  if (toCount !== current.toCount) return null;
  return current;
}

/** How many blocks at the end of `place`'s column are still in flight. */
export function arrivingBlockCount(regroup: RegroupAnimation | null, place: Place): number {
  if (!regroup || regroup.to !== place) return 0;
  return regroup.kind === 'group' ? 1 : 10;
}

interface Point { x: number; y: number }

interface Geometry {
  /** Centre of the spot the move starts from (bottom of the source column). */
  source: Point;
  /** Top-left of each block the move lands on, in arrival order. */
  targets: Point[];
  /** Top-left of each of the ten gathered blocks (group only). */
  cluster: Point[];
}

const SEC = (ms: number) => ms / 1000;

function centreBottomOf(el: Element | null, box: DOMRect, lift: number): Point | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left - box.left + r.width / 2, y: r.bottom - box.top - lift };
}

function measure(container: HTMLElement, regroup: RegroupAnimation): Geometry | null {
  const box = container.getBoundingClientRect();
  const fromZone = container.querySelector(`#column-${regroup.from}-dropzone`);
  const toZone = container.querySelector(`#column-${regroup.to}-dropzone`);
  const low: Place = regroup.kind === 'group' ? regroup.from : regroup.to;
  const lowSize = BLOCK_SIZES[low];

  const source = centreBottomOf(fromZone, box, 40);
  if (!source) return null;

  // Where the real blocks now sit — the ghost lands exactly on them.
  const arriving = regroup.kind === 'group' ? 1 : 10;
  const toSize = BLOCK_SIZES[regroup.to];
  const targets: Point[] = [];
  for (let k = arriving; k >= 1; k--) {
    const idx = regroup.toCount - k;
    const el = idx >= 0 ? container.querySelector(`#column-${regroup.to}-${idx}`) : null;
    if (el) {
      const r = el.getBoundingClientRect();
      targets.push({ x: r.left - box.left + (r.width - toSize.w) / 2, y: r.top - box.top + (r.height - toSize.h) / 2 });
    } else {
      const fallback = centreBottomOf(toZone, box, 40);
      if (!fallback) return null;
      targets.push({ x: fallback.x - toSize.w / 2, y: fallback.y - toSize.h / 2 });
    }
  }

  // The ten blocks that are about to merge, laid out the way the column holds
  // them: bottom-anchored rows, as many per row as the column fits (max 5).
  const cluster: Point[] = [];
  if (regroup.kind === 'group') {
    const zoneWidth = fromZone ? fromZone.getBoundingClientRect().width : 120;
    const gap = 6;
    const perRow = Math.max(1, Math.min(5, Math.floor((zoneWidth - 16) / (lowSize.w + gap))));
    const rows = Math.ceil(10 / perRow);
    for (let i = 0; i < 10; i++) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const inRow = Math.min(perRow, 10 - row * perRow);
      const rowWidth = inRow * lowSize.w + (inRow - 1) * gap;
      cluster.push({
        x: source.x - rowWidth / 2 + col * (lowSize.w + gap),
        y: source.y + 20 - (rows - row) * (lowSize.h + gap),
      });
    }
  }

  return { source, targets, cluster };
}

function Ghost({ place }: { place: Place }) {
  const Svg = BLOCK_SVGS[place];
  const size = BLOCK_SIZES[place];
  return (
    <div style={{ width: size.w, height: size.h }} className="pointer-events-none select-none">
      <Svg />
    </div>
  );
}

const ghostStyle = (p: Point, opacity: number, scale: number) => ({
  position: 'absolute' as const,
  left: 0,
  top: 0,
  transform: `translateX(${p.x}px) translateY(${p.y}px) scale(${scale})`,
  opacity,
  willChange: 'transform, opacity',
});

export function RegroupAnimationLayer({ containerRef }: { containerRef: RefObject<HTMLElement | null> }) {
  const regroup = useVisibleRegroup();
  const [geometry, setGeometry] = useState<{ id: number; g: Geometry } | null>(null);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);

  // Measured after the columns have committed the new counts, so the landing
  // spots are the real blocks' positions.
  useLayoutEffect(() => {
    if (!regroup || !containerRef.current) return;
    const g = measure(containerRef.current, regroup);
    setGeometry(g ? { id: regroup.id, g } : null);
  }, [regroup, containerRef]);

  const ready = regroup && geometry && geometry.id === regroup.id ? geometry.g : null;

  useLayoutEffect(() => {
    if (!regroup || !ready || !layer) return;
    const { source, targets, cluster } = ready;
    const merge = SEC(REGROUP_MERGE_MS);
    const total = SEC(REGROUP_ANIMATION_MS);
    const mergeShare = REGROUP_MERGE_MS / REGROUP_ANIMATION_MS;
    const high: Place = regroup.kind === 'group' ? regroup.to : regroup.from;
    const low: Place = regroup.kind === 'group' ? regroup.from : regroup.to;
    const highSize = BLOCK_SIZES[high];
    const lowSize = BLOCK_SIZES[low];
    const highAtSource = { x: source.x - highSize.w / 2, y: source.y - highSize.h / 2 };
    const lowAtSource = { x: source.x - lowSize.w / 2, y: source.y - lowSize.h / 2 };
    const controls: AnimationPlaybackControls[] = [];
    const lows = layer.querySelectorAll<HTMLElement>('[data-ghost="low"]');
    const highEl = layer.querySelector<HTMLElement>('[data-ghost="high"]');
    if (regroup.kind === 'group') {
      lows.forEach((el, i) => {
        const p = cluster[i];
        controls.push(animate(el, { x: [p.x, lowAtSource.x], y: [p.y, lowAtSource.y], opacity: [1, 0], scale: [1, 0.6] }, { duration: merge, ease: 'easeIn', delay: i * 0.008 }));
      });
      if (highEl) controls.push(animate(highEl, {
        x: [highAtSource.x, highAtSource.x, targets[0].x],
        y: [highAtSource.y, highAtSource.y, targets[0].y],
        opacity: [0, 1, 1],
        scale: [0.85, 1, 1],
      }, { duration: total, times: [0, mergeShare, 1], ease: 'easeInOut' }));
    } else {
      if (highEl) controls.push(animate(highEl, { opacity: [1, 0], scale: [1, 0.9] }, { duration: merge * 0.8, ease: 'easeOut' }));
      lows.forEach((el, i) => {
        const t = targets[i];
        // Break apart: fan out a little around the block, then travel.
        const fan = { x: lowAtSource.x + (i - 4.5) * (lowSize.w * 0.35), y: lowAtSource.y - 10 };
        controls.push(animate(el, {
          x: [lowAtSource.x, fan.x, t.x],
          y: [lowAtSource.y, fan.y, t.y],
          opacity: [0, 1, 1],
          scale: [0.7, 1, 1],
        }, { duration: total - 0.12, delay: i * 0.012, times: [0, mergeShare, 1], ease: 'easeInOut' }));
      });
    }
    return () => controls.forEach((c) => c.stop());
  }, [regroup, ready, layer]);

  if (!regroup || !ready) return null;
  const { source, targets, cluster } = ready;
  const high: Place = regroup.kind === 'group' ? regroup.to : regroup.from;
  const low: Place = regroup.kind === 'group' ? regroup.from : regroup.to;
  const highSize = BLOCK_SIZES[high];
  const lowSize = BLOCK_SIZES[low];
  const highAtSource = { x: source.x - highSize.w / 2, y: source.y - highSize.h / 2 };
  const lowAtSource = { x: source.x - lowSize.w / 2, y: source.y - lowSize.h / 2 };

  return (
    <div
      key={regroup.id}
      ref={setLayer}
      aria-hidden="true"
      data-testid="regroup-animation-layer"
      data-kind={regroup.kind}
      className="absolute inset-0 pointer-events-none z-20 overflow-visible"
    >
      {regroup.kind === 'group' ? (
        <>
          {cluster.map((p, i) => (
            <div key={`low-${i}`} data-ghost="low" style={ghostStyle(p, 1, 1)}><Ghost place={low} /></div>
          ))}
          <div data-ghost="high" style={ghostStyle(highAtSource, 0, 0.85)}><Ghost place={high} /></div>
        </>
      ) : (
        <>
          <div data-ghost="high" style={ghostStyle(highAtSource, 1, 1)}><Ghost place={high} /></div>
          {targets.map((_, i) => (
            <div key={`low-${i}`} data-ghost="low" style={ghostStyle(lowAtSource, 0, 0.7)}><Ghost place={low} /></div>
          ))}
        </>
      )}
    </div>
  );
}
