/**
 * The shared drawing canvas.
 *
 * Rendering model: the canvas has a fixed logical resolution (1280×800) and
 * scales via CSS, so the protocol's normalized `[0,1]` coordinates paint
 * identically on every screen. Remote strokes live in `strokesRef` (owned by
 * use-room.ts) and trigger a full repaint via `strokesVersion`; the stroke
 * being drawn locally paints incrementally on pointer moves and is streamed
 * to the room in chunks sharing one stroke id.
 */
import { ROOM_LIMITS } from '@shared/rooms/room';
import type { Stroke, StrokePoint } from '@shared/rooms/protocol';
import { useEffect, useRef, type RefObject } from 'react';

const LOGICAL_WIDTH = 1280;
const LOGICAL_HEIGHT = 800;
/** The canvas is always white regardless of theme, so the eraser is a brush. */
const CANVAS_BACKGROUND = '#ffffff';
/** Stream a chunk once this many points buffered (latency vs. frame count). */
const CHUNK_POINTS = 12;
/** Ignore pointer moves closer than this (logical px) to the previous point. */
const MIN_DISTANCE = 2;

export interface BrushSettings {
  color: string;
  /** Protocol units: 1/1000 of the canvas height. */
  size: number;
}

interface RoomCanvasProps {
  strokesRef: RefObject<Stroke[]>;
  strokesVersion: number;
  brush: BrushSettings;
  /** False while someone else's quiz drawing is in progress. */
  canDraw: boolean;
  onStrokeChunk: (chunk: Omit<Stroke, 'userId'>) => void;
  testId: string;
  'aria-label': string;
}

function strokeWidth(size: number): number {
  return (size / 1000) * LOGICAL_HEIGHT;
}

function paintStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Pick<Stroke, 'color' | 'size' | 'points'>,
): void {
  const points = stroke.points;
  const first = points[0];
  if (!first) return;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = strokeWidth(stroke.size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (points.length === 1) {
    // A tap: paint a dot, since a zero-length path draws nothing.
    ctx.beginPath();
    ctx.arc(first.x * LOGICAL_WIDTH, first.y * LOGICAL_HEIGHT, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(first.x * LOGICAL_WIDTH, first.y * LOGICAL_HEIGHT);
  for (const point of points.slice(1)) {
    ctx.lineTo(point.x * LOGICAL_WIDTH, point.y * LOGICAL_HEIGHT);
  }
  ctx.stroke();
}

export function RoomCanvas({
  strokesRef,
  strokesVersion,
  brush,
  canDraw,
  onStrokeChunk,
  testId,
  'aria-label': ariaLabel,
}: RoomCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The in-progress local stroke: `all` repaints it after remote repaints,
  // `pending` is the tail not yet streamed to the room.
  const liveRef = useRef<{ id: string; all: StrokePoint[]; pending: StrokePoint[] } | null>(null);
  // Pointer handlers are bound once; they read the latest brush/permission
  // through refs, mirrored after every commit.
  const brushRef = useRef(brush);
  const canDrawRef = useRef(canDraw);
  useEffect(() => {
    brushRef.current = brush;
    canDrawRef.current = canDraw;
  }, [brush, canDraw]);

  // Full repaint whenever the shared stroke list changed (welcome snapshot,
  // remote strokes, canvas cleared). The in-progress local stroke is painted
  // on top so a remote repaint never erases what is being drawn.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = CANVAS_BACKGROUND;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    for (const stroke of strokesRef.current ?? []) paintStroke(ctx, stroke);
    const live = liveRef.current;
    if (live) paintStroke(ctx, { ...brushRef.current, points: live.all });
  }, [strokesVersion, strokesRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const toPoint = (event: PointerEvent): StrokePoint => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
        y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
      };
    };

    const flush = (done: boolean) => {
      const live = liveRef.current;
      if (!live || (live.pending.length === 0 && !done)) return;
      if (live.pending.length > 0) {
        onStrokeChunk({
          id: live.id,
          color: brushRef.current.color,
          size: brushRef.current.size,
          points: live.pending.slice(0, ROOM_LIMITS.strokePointsMax),
        });
        live.pending = [];
      }
      if (done) liveRef.current = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!canDrawRef.current || event.button !== 0) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      const point = toPoint(event);
      liveRef.current = { id: crypto.randomUUID(), all: [point], pending: [point] };
      const ctx = canvas.getContext('2d');
      if (ctx) paintStroke(ctx, { ...brushRef.current, points: [point] });
    };

    const onPointerMove = (event: PointerEvent) => {
      const live = liveRef.current;
      if (!live) return;
      const point = toPoint(event);
      const previous = live.all[live.all.length - 1];
      if (!previous) return;
      const dx = (point.x - previous.x) * LOGICAL_WIDTH;
      const dy = (point.y - previous.y) * LOGICAL_HEIGHT;
      if (dx * dx + dy * dy < MIN_DISTANCE * MIN_DISTANCE) return;

      const ctx = canvas.getContext('2d');
      if (ctx) paintStroke(ctx, { ...brushRef.current, points: [previous, point] });
      live.all.push(point);
      live.pending.push(point);
      if (live.pending.length >= CHUNK_POINTS) flush(false);
    };

    const onPointerEnd = () => flush(true);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerEnd);
      canvas.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [onStrokeChunk]);

  return (
    <canvas
      ref={canvasRef}
      className="room-canvas"
      width={LOGICAL_WIDTH}
      height={LOGICAL_HEIGHT}
      data-testid={testId}
      role="img"
      aria-label={ariaLabel}
      data-can-draw={canDraw || undefined}
    />
  );
}
