import { describe, expect, it } from 'vitest'
import { PointerTracker } from './pointerTracker'

const RED = [1, 0, 0] as const
const BLUE = [0, 0, 1] as const

describe('PointerTracker (multi-pointer by pointerId)', () => {
  it('tracks two simultaneous pointers independently', () => {
    const t = new PointerTracker()
    t.down(1, 0.2, 0.2, RED)
    t.down(7, 0.8, 0.8, BLUE)
    expect(t.size).toBe(2)
    expect(t.has(1) && t.has(7)).toBe(true)

    t.move(1, 0.3, 0.2)
    t.move(7, 0.8, 0.6)

    const strokes = t.drain(1 / 60)
    expect(strokes).toHaveLength(2)
    const a = strokes.find((s) => s.id === 1)!
    const b = strokes.find((s) => s.id === 7)!
    expect(a.color).toEqual(RED)
    expect(b.color).toEqual(BLUE)
    expect(a.dx).toBeCloseTo(0.1)
    expect(a.dy).toBeCloseTo(0)
    expect(b.dx).toBeCloseTo(0)
    expect(b.dy).toBeCloseTo(-0.2)
    expect(a.fresh && b.fresh).toBe(true)
  })

  it('lifting one finger leaves the other painting', () => {
    const t = new PointerTracker()
    t.down(1, 0.5, 0.5, RED)
    t.down(2, 0.1, 0.1, BLUE)
    t.drain(0.016)
    t.up(1)
    expect(t.size).toBe(1)
    expect(t.move(1, 0.6, 0.6)).toBe(false) // gone
    expect(t.move(2, 0.2, 0.1)).toBe(true)
    const strokes = t.drain(0.016)
    expect(strokes.map((s) => s.id)).toEqual([2])
    expect(strokes[0].fresh).toBe(false)
  })

  it('a tap with no movement still produces one zero-velocity stroke, then nothing', () => {
    const t = new PointerTracker()
    t.down(3, 0.4, 0.4, RED)
    const first = t.drain(0.016)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ x: 0.4, y: 0.4, dx: 0, dy: 0, fresh: true })
    expect(t.drain(0.016)).toHaveLength(0)
  })

  it('accumulates several moves between frames into a single stroke', () => {
    const t = new PointerTracker()
    t.down(1, 0, 0, RED)
    t.drain(0.016)
    t.move(1, 0.1, 0)
    t.move(1, 0.2, 0)
    t.move(1, 0.25, 0.05)
    const [stroke] = t.drain(0.016)
    expect(stroke.dx).toBeCloseTo(0.25)
    expect(stroke.dy).toBeCloseTo(0.05)
    expect(stroke.x).toBeCloseTo(0.25)
  })

  it('scales deltas into world units where the short side is 1', () => {
    const t = new PointerTracker()
    t.setWorldScale(16 / 9, 1) // landscape canvas
    t.down(1, 0, 0, RED)
    t.drain(0.016)
    t.move(1, 0.5, 0.5)
    const [stroke] = t.drain(0.016)
    expect(stroke.dx).toBeCloseTo(0.5 * (16 / 9))
    expect(stroke.dy).toBeCloseTo(0.5)
  })

  it('ignores moves for unknown ids (hover) and supports colour updates and clear()', () => {
    const t = new PointerTracker()
    expect(t.move(99, 0.5, 0.5)).toBe(false)
    t.down(1, 0, 0, RED)
    t.setColor(1, BLUE)
    expect(t.get(1)?.color).toEqual(BLUE)
    t.clear()
    expect(t.size).toBe(0)
    expect(t.drain(0.016)).toEqual([])
  })

  it('ages pointers by dt on every drain', () => {
    const t = new PointerTracker()
    t.down(1, 0, 0, RED)
    t.drain(0.5)
    t.drain(0.25)
    expect(t.get(1)?.age).toBeCloseTo(0.75)
  })
})
