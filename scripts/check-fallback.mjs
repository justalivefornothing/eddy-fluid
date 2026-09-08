// Loads the built app with getContext('webgl2') forced to null and asserts the
// "WebGL2 not supported" fallback is rendered. Usage: node scripts/check-fallback.mjs [--port 5400]
import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(here, '..')
const { chromium } = await import('file:///C:/Users/Bhavy/portfolio-projects/.qa/node_modules/playwright/index.mjs')
const port = Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 5400)
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const waitForPort = (p, timeoutMs = 30000) =>
  new Promise((resolve, reject) => {
    const start = Date.now()
    const tryOnce = () => {
      const s = net.createConnection({ port: p, host: '127.0.0.1' })
      s.once('connect', () => (s.destroy(), resolve()))
      s.once('error', () => {
        s.destroy()
        Date.now() - start > timeoutMs ? reject(new Error(`port ${p} never opened`)) : setTimeout(tryOnce, 300)
      })
    }
    tryOnce()
  })
const killPort = (p) => {
  const txt = spawnSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' }).stdout || ''
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/)
    if (m && Number(m[1]) === p) spawnSync('taskkill', ['/pid', m[2], '/T', '/F'], { stdio: 'ignore' })
  }
}

const server = spawn('npx.cmd', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: projectDir, stdio: 'ignore', shell: true })
let browser
let ok = false
try {
  await waitForPort(port)
  browser = await chromium.launch({ executablePath: EDGE, headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (type === 'webgl2') return null
      return original.call(this, type, ...rest)
    }
  })
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  const fallback = await page.locator('[data-testid="webgl-fallback"]').count()
  const heading = await page.locator('[data-testid="webgl-fallback"] h2').textContent().catch(() => '')
  const canvases = await page.locator('canvas').count()
  if (out) await page.screenshot({ path: out })
  ok = fallback === 1 && /WebGL2 not supported/i.test(heading || '') && errors.length === 0
  console.log(JSON.stringify({ ok, fallbackElements: fallback, heading, canvases, errors }, null, 2))
} catch (e) {
  console.error(e)
} finally {
  if (browser) await browser.close().catch(() => {})
  killPort(port)
  try {
    spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {}
}
process.exit(ok ? 0 : 1)
