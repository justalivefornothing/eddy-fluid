// Measures real frame times of the built app in headless Edge, once per built-in preset.
// Usage: node scripts/measure-fps.mjs [--port 5400] [--gpu hardware|swiftshader] [--seconds 4] [--width 1920] [--height 1080]
// Requires `npm run build` first. Uses the Playwright install from the sibling .qa folder.
import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(here, '..')
const { chromium } = await import('file:///C:/Users/Bhavy/portfolio-projects/.qa/node_modules/playwright/index.mjs')

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true'])
    return acc
  }, []),
)
const port = Number(args.port || 5400)
const gpu = args.gpu || 'hardware'
const seconds = Number(args.seconds || 4)
const width = Number(args.width || 1920)
const height = Number(args.height || 1080)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

function waitForPort(p, timeoutMs = 30000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const s = net.createConnection({ port: p, host: '127.0.0.1' })
      s.once('connect', () => {
        s.destroy()
        resolve()
      })
      s.once('error', () => {
        s.destroy()
        if (Date.now() - start > timeoutMs) reject(new Error(`port ${p} never opened`))
        else setTimeout(tryOnce, 300)
      })
    }
    tryOnce()
  })
}

function killPort(p) {
  const out = spawnSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' }).stdout || ''
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/)
    if (m && Number(m[1]) === p) spawnSync('taskkill', ['/pid', m[2], '/T', '/F'], { stdio: 'ignore' })
  }
}

const row = (label, r, note = '') =>
  console.log(
    `  ${label.padEnd(10)} ${r.fps.toFixed(1).padStart(6)} ${r.ms.toFixed(2).padStart(9)} ${r.median.toFixed(2).padStart(8)} ${r.p95.toFixed(2).padStart(8)}${note ? '   ' + note : ''}`,
  )

const server = spawn('npx.cmd', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
  cwd: projectDir,
  stdio: 'ignore',
  shell: true,
})

const gpuArgs =
  gpu === 'swiftshader'
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']

let browser
try {
  await waitForPort(port)
  browser = await chromium.launch({ executablePath: EDGE, headless: true, args: gpuArgs })
  const page = await browser.newPage({ viewport: { width, height } })
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)

  const info = await page.evaluate(() => {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    if (!gl) return { renderer: 'no webgl2', linear: false }
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return {
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      linear: gl.getExtension('OES_texture_half_float_linear') !== null,
      cbf: gl.getExtension('EXT_color_buffer_float') !== null,
    }
  })
  console.log(`\nrenderer: ${info.renderer}`)
  console.log(`EXT_color_buffer_float: ${info.cbf} · OES_texture_half_float_linear: ${info.linear}`)
  console.log(`viewport: ${width}×${height} (DPR 1) · ${seconds}s per preset · continuous synthetic drag\n`)
  console.log(`  ${'preset'.padEnd(10)} ${'fps'.padStart(6)} ${'mean ms'.padStart(9)} ${'median'.padStart(8)} ${'p95 ms'.padStart(8)}`)

  const measure = (ms) =>
    page.evaluate(
      (ms) =>
        new Promise((resolve) => {
          const frames = []
          let last = performance.now()
          const start = last
          const tick = (now) => {
            frames.push(now - last)
            last = now
            if (now - start < ms) requestAnimationFrame(tick)
            else resolve(frames.slice(5))
          }
          requestAnimationFrame(tick)
        }),
      ms,
    )
  const summarise = (sample) => {
    if (sample.length === 0) return { fps: 0, ms: 0, p95: 0, median: 0, n: 0 }
    const sorted = [...sample].sort((a, b) => a - b)
    const mean = sample.reduce((a, b) => a + b, 0) / sample.length
    const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
    return { fps: 1000 / mean, ms: mean, median: at(0.5), p95: at(0.95), n: sample.length }
  }

  // Baseline: paused, so only the display (+bloom) pass and browser compositing run.
  await page.keyboard.press(' ')
  await page.waitForTimeout(300)
  row('(paused)', summarise(await measure(2000)), 'display + bloom + compositing only')
  await page.keyboard.press(' ')

  for (const id of ['silk', 'smoke', 'ink', 'plasma', 'glitch']) {
    await page.keyboard.press('c')
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: new RegExp(`^${id}$`, 'i') }).click()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // Keep the fluid busy with a synthetic drag so the measurement includes splats.
    const drag = (async () => {
      const end = Date.now() + seconds * 1000
      let t = 0
      await page.mouse.move(width / 2, height / 2)
      await page.mouse.down()
      while (Date.now() < end) {
        t += 0.15
        await page.mouse.move(width / 2 + Math.cos(t) * width * 0.26, height / 2 + Math.sin(t * 1.3) * height * 0.28, { steps: 2 })
      }
      await page.mouse.up()
    })()
    const sample = await measure(seconds * 1000)
    await drag
    row(id, summarise(sample))
  }
  console.log('')
} catch (e) {
  console.error(e)
  process.exitCode = 1
} finally {
  if (browser) await browser.close().catch(() => {})
  killPort(port)
  try {
    spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {}
}
