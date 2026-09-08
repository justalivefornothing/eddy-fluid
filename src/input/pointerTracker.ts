import type { RGB } from '../core/color'

/**
 * Tracks any number of simultaneous pointers (mouse, touches, pens) by their
 * pointerId. Positions are normalised to [0,1] with the origin bottom-left so
 * they map straight onto texture coordinates. Pure data structure: the React
 * layer feeds it Pointer Events, the render loop drains the accumulated
 * strokes once per frame.
 */
export interface TrackedPointer {
  readonly id: number
  /** Latest position, normalised. */
  x: number
  y: number
  /** Position at the previous drain, normalised. */
  prevX: number
  prevY: number
  /** Accumulated displacement since the last drain (world units, short side = 1). */
  dx: number
  dy: number
  /** True when a move has happened since the last drain. */
  moved: boolean
  color: RGB
  /** Seconds this pointer has been held down. */
  age: number
}

export interface Stroke {
  readonly id: number
  readonly x: number
  readonly y: number
  /** World-unit displacement accumulated over the frame. */
  readonly dx: number
  readonly dy: number
  readonly color: RGB
  /** True on the frame the pointer landed (used to drop a dye dot with no velocity). */
  readonly fresh: boolean
}

export class PointerTracker {
  private readonly pointers = new Map<number, TrackedPointer>()
  private readonly fresh = new Set<number>()
  private scaleX = 1
  private scaleY = 1

  /**
   * World scale of the viewport (width/short, height/short) so normalised
   * deltas become world units where the short side is 1.
   */
  setWorldScale(scaleX: number, scaleY: number): void {
    this.scaleX = scaleX > 0 ? scaleX : 1
    this.scaleY = scaleY > 0 ? scaleY : 1
  }

  get size(): number {
    return this.pointers.size
  }

  has(id: number): boolean {
    return this.pointers.has(id)
  }

  get(id: number): TrackedPointer | undefined {
    return this.pointers.get(id)
  }

  down(id: number, x: number, y: number, color: RGB): void {
    this.pointers.set(id, { id, x, y, prevX: x, prevY: y, dx: 0, dy: 0, moved: false, color, age: 0 })
    this.fresh.add(id)
  }

  /** Returns false when the pointer is not currently down (hover moves are ignored). */
  move(id: number, x: number, y: number): boolean {
    const p = this.pointers.get(id)
    if (!p) return false
    p.dx += (x - p.x) * this.scaleX
    p.dy += (y - p.y) * this.scaleY
    p.x = x
    p.y = y
    p.moved = true
    return true
  }

  up(id: number): void {
    this.pointers.delete(id)
    this.fresh.delete(id)
  }

  setColor(id: number, color: RGB): void {
    const p = this.pointers.get(id)
    if (p) p.color = color
  }

  clear(): void {
    this.pointers.clear()
    this.fresh.clear()
  }

  /** Iterate live pointers (for per-frame colour drift etc.). */
  forEach(fn: (p: TrackedPointer) => void): void {
    for (const p of this.pointers.values()) fn(p)
  }

  /**
   * Collect one stroke per pointer that needs a splat this frame and reset
   * the accumulators. A pointer that just landed produces a zero-velocity
   * stroke so a tap leaves a dot of dye.
   */
  drain(dt: number): Stroke[] {
    const out: Stroke[] = []
    for (const p of this.pointers.values()) {
      p.age += dt
      const isFresh = this.fresh.has(p.id)
      if (p.moved || isFresh) {
        out.push({ id: p.id, x: p.x, y: p.y, dx: p.dx, dy: p.dy, color: p.color, fresh: isFresh })
      }
      p.prevX = p.x
      p.prevY = p.y
      p.dx = 0
      p.dy = 0
      p.moved = false
    }
    this.fresh.clear()
    return out
  }
}
