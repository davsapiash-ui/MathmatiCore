import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';
import { animate, useReducedMotion, type AnimationPlaybackControls } from 'framer-motion';
import type { Place } from '@/core/placeValue';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import {
  useRegroupAnimationStore,
  type RegroupAnimation,
} from '@/application/useRegroupAnimationStore';
import { BLOCK_SIZES, BLOCK_SVGS } from './DienesBlock';

/**
 * The grouping / decomposition animation (מסמך 03 §3.3–3.5, register row 17;
 * redrawn with the owner, 7.10.2026). What the child has to see is a trade:
 * one block for exactly ten of the next place down, the amount unchanged, one
 * column over. So the move shows the block's own structure — the unit lines
 * drawn on every ten, hundred and thousand (DienesBlock):
 *
 *  - split (a click, or a drag right — the same animation, PRD Module 8 §א):
 *    the block's seams strengthen for a moment where it is (where it was let
 *    go, for a drag), it opens along them into its ten pieces, which spread a
 *    little in their order — five and five, so ten is seen, not counted — and
 *    travel right, each to the exact spot where it now sits.
 *  - group (the "קבצו 10" button only): the ten blocks leave the column's
 *    pile and line up in the order they will have inside the new block, five
 *    and five, close up seam to seam into it — its lines are the gaps that
 *    closed — and the new block travels left to its column.
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
 * Calm by design: position, size and opacity only, the seams once — no
 * flashing, no bounce, no repeat, no sound. The full tempo is 1.2 seconds; the
 * same trade made again and again in a meeting plays in 0.7
 * (useRegroupAnimationStore). A learner whose device asks for reduced motion
 * gets the move instantly. Quiet mode (the teacher's sensory flag) keeps the
 * move without the seams' emphasis:
 * document 03 describes this motion as how the child sees ten become one,
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
  /** Rendered block size per place right now — columns shrink their blocks to
   *  fit (core/blockLayout.ts), and the ghost is drawn at the same size. */
  sizes: Record<Place, { w: number; h: number }>;
  /** Centre of the block that breaks apart or forms. */
  centre: Point;
  /** Centre of each of the ten pieces inside that block, in the block's order. */
  slices: Point[];
  /** The same ten pieces spread a little apart, five and five. */
  spread: Point[];
  /** A piece's size inside the block, relative to its own drawn size. */
  sliceScale: number;
  /** Where the ten pieces line up before they close into one block (group). */
  frame: Point[];
  /** Their size there: whole units on the ten frame, block-sized pieces otherwise. */
  frameScale: number;
  /** Top-left of each block the move lands on, in arrival order. */
  targets: Point[];
  /** Top-left of each of the ten blocks in their column before they group (group only). */
  cluster: Point[];
}

const SEC = (ms: number) => ms / 1000;

function centreBottomOf(el: Element | null, box: DOMRect, lift: number): Point | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left - box.left + r.width / 2, y: r.bottom - box.top - lift };
}

/** A column's rendered block size, read from its first block (DienesBlock sets
 *  data-block-w/h); the drawn size when the column is empty. */
function renderedBlockSize(container: HTMLElement, place: Place): { w: number; h: number } {
  const el = container.querySelector<HTMLElement>(`#column-${place}-0`);
  const w = Number(el?.dataset.blockW);
  const h = Number(el?.dataset.blockH);
  return w > 0 && h > 0 ? { w, h } : BLOCK_SIZES[place];
}

/**
 * Where the ten pieces sit inside a block, as fractions of its drawn box —
 * read from the SVGs' view boxes in DienesBlock:
 *  - a ten (view box −5 −5 1110 700): ten unit cubes along the rod, centres
 *    (100 + 100k, 115 + 50k);
 *  - a hundred (−5 −5 2010 1110): ten rods side by side, parallel to the rod
 *    drawing, centres (1450 − 100k, 300 + 50k);
 *  - a thousand (−5 −5 2010 2010): ten flats stacked, top to bottom, centres
 *    (1000, 550 + 100k).
 * The scale: how long a piece is inside the block over how long it is drawn
 * on its own (the blocks are not drawn to one scale, so pieces grow on the way).
 */
function sliceLayout(high: Place, highSize: { w: number; h: number }, lowSize: { w: number; h: number }): { fractions: Point[]; scale: number; spreadFactor: number } | null {
  const k = Array.from({ length: 10 }, (_, i) => i);
  if (high === 'tens') {
    return {
      fractions: k.map((i) => ({ x: (105 + 100 * i) / 1110, y: (120 + 50 * i) / 700 })),
      scale: ((200 / 1110) * highSize.w) / lowSize.w,
      spreadFactor: 1.4,
    };
  }
  if (high === 'hundreds') {
    return {
      fractions: k.map((i) => ({ x: (1455 - 100 * i) / 2010, y: (305 + 50 * i) / 1110 })),
      scale: ((1000 / 2010) * highSize.w) / ((1000 / 1110) * lowSize.w),
      spreadFactor: 2.2,
    };
  }
  if (high === 'thousands') {
    return {
      fractions: k.map((i) => ({ x: 1005 / 2010, y: (555 + 100 * i) / 2010 })),
      scale: highSize.w / lowSize.w,
      spreadFactor: 3,
    };
  }
  return null;
}

function measure(container: HTMLElement, regroup: RegroupAnimation): Geometry | null {
  const box = container.getBoundingClientRect();
  const sizes = {
    units: renderedBlockSize(container, 'units'),
    tens: renderedBlockSize(container, 'tens'),
    hundreds: renderedBlockSize(container, 'hundreds'),
    thousands: renderedBlockSize(container, 'thousands'),
  };
  const fromZone = container.querySelector(`#column-${regroup.from}-dropzone`);
  const toZone = container.querySelector(`#column-${regroup.to}-dropzone`);
  const high: Place = regroup.kind === 'group' ? regroup.to : regroup.from;
  const low: Place = regroup.kind === 'group' ? regroup.from : regroup.to;
  const highSize = sizes[high];
  const lowSize = sizes[low];

  const source = centreBottomOf(fromZone, box, 40);
  if (!source) return null;
  const inBoard = (p: Point): Point => ({
    x: Math.min(Math.max(p.x - box.left, highSize.w / 2), box.width - highSize.w / 2),
    y: Math.min(Math.max(p.y - box.top, highSize.h / 2), box.height - highSize.h / 2),
  });
  // The ten leave from where the child saw them (measured before the redraw).
  const before = regroup.fromBlocks?.map((p) => ({ x: p.x - box.left, y: p.y - box.top }));
  // Where the block breaks apart or forms: where it was let go (a drag right),
  // where it stood (a click), or amid the ten that group — else, as a last
  // resort, the bottom of the source column.
  const centre: Point = regroup.origin
    ? inBoard(regroup.origin)
    : before && before.length > 0
      ? inBoard({
          x: before.reduce((a, p) => a + p.x, 0) / before.length + box.left,
          y: before.reduce((a, p) => a + p.y, 0) / before.length + box.top,
        })
      : source;

  const layout = sliceLayout(high, highSize, lowSize);
  if (!layout) return null;
  const topLeft = { x: centre.x - highSize.w / 2, y: centre.y - highSize.h / 2 };
  const slices = layout.fractions.map((f) => ({ x: topLeft.x + f.x * highSize.w, y: topLeft.y + f.y * highSize.h }));
  // Spread along the block's own axis, with one more step between the fifth
  // and the sixth piece: five and five.
  const axis = { x: slices[9].x - slices[0].x, y: slices[9].y - slices[0].y };
  const step = { x: axis.x / 9, y: axis.y / 9 };
  const spread = slices.map((p, i) => ({
    x: centre.x + (p.x - centre.x) * layout.spreadFactor + step.x * layout.spreadFactor * (i < 5 ? -0.5 : 0.5),
    y: centre.y + (p.y - centre.y) * layout.spreadFactor + step.y * layout.spreadFactor * (i < 5 ? -0.5 : 0.5),
  }));

  // Where the real blocks now sit — the ghost lands exactly on them.
  const arriving = regroup.kind === 'group' ? 1 : 10;
  const toSize = sizes[regroup.to];
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

  // The ten blocks that are about to group, where they stood; failing that,
  // laid out the way the column holds them: bottom-anchored rows, as many per
  // row as the column fits (max 5).
  const cluster: Point[] = [];
  if (regroup.kind === 'group') {
    if (before && before.length === 10) {
      for (const p of before) cluster.push(at(p, lowSize));
    } else {
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
  }

  // Ten units line up as two rows of five before they close into a ten — ten
  // seen at a glance, as on a ten frame. Larger pieces line up along the new
  // block's own axis (the spread), five and five.
  const frame: Point[] =
    regroup.kind === 'group' && low === 'units'
      ? Array.from({ length: 10 }, (_, i) => {
          const col = i % 5;
          const row = Math.floor(i / 5);
          const gap = Math.max(4, lowSize.w * 0.25);
          return {
            x: centre.x + (col - 2) * (lowSize.w + gap),
            y: centre.y + (row - 0.5) * (lowSize.h + gap) - highSize.h,
          };
        })
      : spread;

  return { sizes, centre, slices, spread, frame, frameScale: regroup.kind === 'group' && low === 'units' ? 1 : layout.scale, sliceScale: layout.scale, targets, cluster };
}

function Ghost({ place, size }: { place: Place; size: { w: number; h: number } }) {
  const Svg = BLOCK_SVGS[place];
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

/** Top-left of a block of `size` whose centre is `c`. */
const at = (c: Point, size: { w: number; h: number }): Point => ({ x: c.x - size.w / 2, y: c.y - size.h / 2 });

/** The landing: quick, then settling softly into place. */
const LAND = [0.22, 1, 0.36, 1] as const;

/**
 * The phases, as shares of the move's duration.
 *  split: seams 0–.22, opens .22–.30, spreads .30–.48, travels .48–1
 *         (each piece leaves a little after the one before it);
 *  group: lines up .0–.26, closes up .26–.44, becomes one .44–.52, travels .52–1.
 */
const SPLIT_T = { cut: 0.22, open: 0.3, spread: 0.48, stagger: 0.022 };
const GROUP_T = { lineUp: 0.26, close: 0.44, one: 0.52 };

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
    const { sizes, centre, slices, spread, frame, frameScale, sliceScale, targets, cluster } = ready;
    const total = SEC(regroup.durationMs);
    const high: Place = regroup.kind === 'group' ? regroup.to : regroup.from;
    const low: Place = regroup.kind === 'group' ? regroup.from : regroup.to;
    const highSize = sizes[high];
    const lowSize = sizes[low];
    const highAt = at(centre, highSize);
    const controls: AnimationPlaybackControls[] = [];
    const lows = layer.querySelectorAll<HTMLElement>('[data-ghost="low"]');
    const highEl = layer.querySelector<HTMLElement>('[data-ghost="high"]');
    if (regroup.kind === 'split') {
      if (highEl) controls.push(animate(highEl, { opacity: [1, 1, 0] }, { duration: total * SPLIT_T.open, times: [0, SPLIT_T.cut / SPLIT_T.open, 1], ease: 'linear' }));
      lows.forEach((el, i) => {
        const s = at(slices[i], lowSize);
        const sp = at(spread[i], lowSize);
        const t = targets[i];
        const leave = Math.min(SPLIT_T.spread + i * SPLIT_T.stagger, 0.8);
        controls.push(animate(el, {
          x: [s.x, s.x, s.x, sp.x, sp.x, t.x],
          y: [s.y, s.y, s.y, sp.y, sp.y, t.y],
          scale: [sliceScale, sliceScale, sliceScale, sliceScale, sliceScale, 1],
          opacity: [0, 0, 1, 1, 1, 1],
        }, {
          duration: total,
          times: [0, SPLIT_T.cut, SPLIT_T.open, SPLIT_T.spread, leave, 1],
          ease: ['linear', 'easeOut', 'easeInOut', 'linear', LAND],
        }));
      });
    } else {
      lows.forEach((el, i) => {
        const c = cluster[i];
        const f = at(frame[i], lowSize);
        const s = at(slices[i], lowSize);
        controls.push(animate(el, {
          x: [c.x, f.x, s.x, s.x],
          y: [c.y, f.y, s.y, s.y],
          scale: [1, frameScale, sliceScale, sliceScale],
          opacity: [1, 1, 1, 0],
        }, {
          duration: total * GROUP_T.one,
          times: [0, GROUP_T.lineUp / GROUP_T.one, GROUP_T.close / GROUP_T.one, 1],
          ease: ['easeInOut', 'easeIn', 'linear'],
        }));
      });
      if (highEl) controls.push(animate(highEl, {
        x: [highAt.x, highAt.x, highAt.x, targets[0].x],
        y: [highAt.y, highAt.y, highAt.y, targets[0].y],
        opacity: [0, 0, 1, 1],
      }, { duration: total, times: [0, GROUP_T.close, GROUP_T.one, 1], ease: ['linear', 'linear', LAND] }));
    }
    return () => controls.forEach((c) => c.stop());
  }, [regroup, ready, layer]);

  if (!regroup || !ready) return null;
  return <GhostLayer regroup={regroup} geometry={ready} onLayer={setLayer} />;
}

function GhostLayer({ regroup, geometry, onLayer }: { regroup: RegroupAnimation; geometry: Geometry; onLayer: (el: HTMLDivElement | null) => void }) {
  const { sizes, centre, slices, cluster } = geometry;
  const high: Place = regroup.kind === 'group' ? regroup.to : regroup.from;
  const low: Place = regroup.kind === 'group' ? regroup.from : regroup.to;
  const highSize = sizes[high];
  const lowSize = sizes[low];
  const ms = regroup.durationMs;
  // The seams strengthen while the block opens (split) or once it has closed (group).
  const seams = (regroup.kind === 'split'
    ? { ['--seam-glow-ms']: `${Math.round(ms * SPLIT_T.open)}ms`, ['--seam-glow-delay']: '0ms' }
    : { ['--seam-glow-ms']: `${Math.round(ms * 0.36)}ms`, ['--seam-glow-delay']: `${Math.round(ms * GROUP_T.close)}ms` }) as CSSProperties;

  return (
    <div
      key={regroup.id}
      ref={onLayer}
      aria-hidden="true"
      data-testid="regroup-animation-layer"
      data-kind={regroup.kind}
      data-tempo={regroup.durationMs}
      className="absolute inset-0 pointer-events-none z-20 overflow-visible"
    >
      {regroup.kind === 'group' ? (
        <>
          {cluster.map((p, i) => (
            <div key={`low-${i}`} data-ghost="low" style={ghostStyle(p, 1, 1)}><Ghost place={low} size={lowSize} /></div>
          ))}
          <div data-ghost="high" className="regroup-seam-glow" style={{ ...ghostStyle(at(centre, highSize), 0, 1), ...seams }}><Ghost place={high} size={highSize} /></div>
        </>
      ) : (
        <>
          <div data-ghost="high" className="regroup-seam-glow" style={{ ...ghostStyle(at(centre, highSize), 1, 1), ...seams }}><Ghost place={high} size={highSize} /></div>
          {slices.map((p, i) => (
            <div key={`low-${i}`} data-ghost="low" style={ghostStyle(at(p, lowSize), 0, geometry.sliceScale)}><Ghost place={low} size={lowSize} /></div>
          ))}
        </>
      )}
    </div>
  );
}
