/**
 * Eddy benchmark — `npm run bench`
 *
 * Node has no GPU, so this measures two things that CAN be measured here and
 * that drive the GPU frame budget:
 *
 *  1. The CPU reference solver (identical discretisation to the GLSL passes)
 *     at a few grid sizes, per pass, so the relative cost of each stage and
 *     of every extra Jacobi iteration is visible.
 *  2. The GPU work each built-in preset asks for per frame: draw calls,
 *     texels written by the pressure loop, and the total texel throughput
 *     for a 1080p canvas — the numbers that decide whether a phone holds 60 fps.
 *
 * Also runs the pure-TS hot paths the render loop calls every frame
 * (colour cycling, pointer drain) to make sure they stay negligible.
 */
import { performance } from 'node:perf_hooks'
import { ColorCycler } from '../src/core/cycler.ts'
import { BUILT_IN_PRESET_LIST, DEFAULT_SETTINGS, type SimSettings } from '../src/core/presets.ts'
import { mulberry32, randomSplat } from '../src/core/random.ts'
import { computeGridSize } from '../src/core/resolution.ts'
import { ReferenceFluid } from '../src/core/referenceSolver.ts'
import { PointerTracker } from '../src/input/pointerTracker.ts'
import { BLOOM_BASE_RESOLUTION, BLOOM_LEVELS, drawCallsPerFrame } from '../src/gl/pipeline.ts'

const CANVAS = { width: 1920, height: 1080 }

function fmt(n: number, digits = 2): string {
  return n.toFixed(digits).padStart(9)
}

function timeIt(label: string, iterations: number, fn: () => void): number {
  // Warm up the JIT, then take the median of a few batches.
  fn()
  const samples: number[] = []
  for (let batch = 0; batch < 5; batch++) {
    const t0 = performance.now()
    for (let i = 0; i < iterations; i++) fn()
    samples.push((performance.now() - t0) / iterations)
  }
  samples.sort((a, b) => a - b)
  const median = samples[Math.floor(samples.length / 2)]
  console.log(`  ${label.padEnd(34)} ${fmt(median, 3)} ms`)
  return median
}

function seedFluid(width: number, height: number, iterations: number): ReferenceFluid {
  const f = new ReferenceFluid({ width, height, velocityDissipation: 0.2, dyeDissipation: 0.9, pressure: 0.8, pressureIterations: iterations, curl: 28 })
  const rng = mulberry32(1)
  for (let i = 0; i < 6; i++) {
    const s = randomSplat(rng, 5)
    f.splat(s.x * width, s.y * height, s.dx, s.dy, [rng(), rng(), rng()], width / 24)
  }
  return f
}

console.log('\nEddy bench — CPU reference solver (same maths as the GLSL passes)\n')
console.log(`  node ${process.version} · ${process.arch} · ${process.platform}`)

const gridSummaries: { grid: string; stepMs: number; jacobiMs: number }[] = []
for (const short of [64, 128, 256]) {
  const size = computeGridSize(short, CANVAS.width, CANVAS.height)
  const cells = size.width * size.height
  console.log(`\n  grid ${size.width}×${size.height} (${(cells / 1000).toFixed(0)}k cells, 16:9)`)
  const f = seedFluid(size.width, size.height, 24)
  const dt = 1 / 60
  const reps = short >= 256 ? 2 : short >= 128 ? 5 : 20
  timeIt('advect velocity', reps, () => f.advectVelocity(dt))
  timeIt('curl', reps, () => f.computeCurl())
  timeIt('vorticity confinement', reps, () => f.applyVorticity(dt))
  timeIt('divergence', reps, () => f.computeDivergence())
  const jacobiOne = timeIt('one Jacobi sweep', reps, () => {
    f.config.pressureIterations = 1
    f.solvePressure()
  })
  f.config.pressureIterations = 24
  timeIt('gradient subtract', reps, () => f.subtractGradient())
  timeIt('advect dye (3 ch)', reps, () => f.advectDye(dt))
  const step = timeIt('full step (24 Jacobi)', Math.max(1, Math.floor(reps / 2)), () => f.step(dt))
  console.log(`  ${'-> per-cell cost'.padEnd(34)} ${fmt((step * 1e6) / cells, 1)} ns/cell/frame`)
  gridSummaries.push({ grid: `${size.width}×${size.height}`, stepMs: step, jacobiMs: jacobiOne })
}

console.log('\nGPU work per frame, per built-in preset (1920×1080 canvas, DPR 1)\n')
console.log(`  ${'preset'.padEnd(10)} ${'sim grid'.padEnd(10)} ${'dye grid'.padEnd(11)} ${'jacobi'.padStart(6)} ${'draws'.padStart(6)} ${'Mtexels/frame'.padStart(14)}`)

function texelsPerFrame(s: SimSettings): number {
  const sim = computeGridSize(s.simResolution, CANVAS.width, CANVAS.height)
  const dye = computeGridSize(s.dyeResolution, CANVAS.width, CANVAS.height)
  const simCells = sim.width * sim.height
  const dyeCells = dye.width * dye.height
  // advect v, curl, vorticity, divergence, clear, N jacobi, gradient  (all at sim res)
  let texels = simCells * (6 + s.pressureIterations)
  // advect dye (dye res) + display (canvas res)
  texels += dyeCells + CANVAS.width * CANVAS.height
  if (s.bloom) {
    const base = computeGridSize(Math.min(BLOOM_BASE_RESOLUTION, s.dyeResolution / 2), CANVAS.width, CANVAS.height)
    let w = base.width
    let h = base.height
    let bloom = w * h // prefilter
    for (let i = 1; i < BLOOM_LEVELS; i++) {
      w = Math.floor(w / 2)
      h = Math.floor(h / 2)
      bloom += w * h * 2 // down + up
    }
    bloom += base.width * base.height // final
    texels += bloom
  }
  return texels
}

const presetRows = [{ id: 'default', name: 'Default', values: DEFAULT_SETTINGS }, ...BUILT_IN_PRESET_LIST]
for (const p of presetRows) {
  const s = p.values
  const sim = computeGridSize(s.simResolution, CANVAS.width, CANVAS.height)
  const dye = computeGridSize(s.dyeResolution, CANVAS.width, CANVAS.height)
  const draws = drawCallsPerFrame({ pressureIterations: s.pressureIterations, bloom: s.bloom }, 0)
  console.log(
    `  ${p.name.padEnd(10)} ${`${sim.width}×${sim.height}`.padEnd(10)} ${`${dye.width}×${dye.height}`.padEnd(11)} ${String(s.pressureIterations).padStart(6)} ${String(draws).padStart(6)} ${(texelsPerFrame(s) / 1e6).toFixed(1).padStart(14)}`,
  )
}

console.log('\nPer-frame TypeScript hot paths (must stay far below 1 ms)\n')
const cycler = new ColorCycler('nebula', mulberry32(3))
timeIt('ColorCycler.next() ×1000', 20, () => {
  for (let i = 0; i < 1000; i++) cycler.next()
})
const tracker = new PointerTracker()
tracker.setWorldScale(16 / 9, 1)
timeIt('PointerTracker 10 fingers ×60 moves', 50, () => {
  for (let id = 0; id < 10; id++) tracker.down(id, 0.5, 0.5, [1, 0, 0])
  for (let m = 0; m < 60; m++) for (let id = 0; id < 10; id++) tracker.move(id, (m % 10) / 10, (id % 10) / 10)
  tracker.drain(1 / 60)
  for (let id = 0; id < 10; id++) tracker.up(id)
})

console.log('\nSummary')
for (const g of gridSummaries) {
  console.log(`  CPU ${g.grid.padEnd(9)} full step ${fmt(g.stepMs, 2)} ms · one Jacobi sweep ${fmt(g.jacobiMs, 3)} ms`)
}
console.log('  (The GPU runs each of these passes as one full-screen draw; see README for measured GPU frame times.)\n')
