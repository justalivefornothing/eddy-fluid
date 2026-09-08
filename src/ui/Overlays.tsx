import { useEffect } from 'react'
import { useRuntime } from '../store/runtimeStore'
import { useSettings } from '../store/settingsStore'

/** Top-left wordmark + FPS pill. */
export function Hud() {
  const stats = useRuntime((s) => s.stats)
  const paused = useSettings((s) => s.paused)
  const ready = stats.fps > 0
  return (
    <div className="pointer-events-none absolute top-4 left-4 z-20 flex items-center gap-3 sm:top-5 sm:left-5">
      <h1 className="font-display flex items-baseline gap-1.5 text-[22px] leading-none font-medium tracking-[-0.03em] text-white">
        eddy
        <span className="mb-[3px] inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)', boxShadow: '0 0 10px var(--accent-glow)' }} aria-hidden="true" />
      </h1>
      <output
        className="glass !rounded-full px-2.5 py-1 text-[10.5px] tracking-wide text-white/70 tabular-nums"
        aria-live="off"
        aria-label="Frame rate"
        title={`${stats.drawCalls} draw calls / frame · ${stats.formatLabel}`}
      >
        {paused ? <span className="text-white/90">paused</span> : ready ? `${stats.fps} fps · ${stats.frameMs.toFixed(1)} ms` : '— fps'}
      </output>
    </div>
  )
}

/** Bottom-centre hint that fades after the first drag. */
export function Hint() {
  const dismissed = useSettings((s) => s.hintDismissed)
  return (
    <p
      aria-hidden={dismissed}
      className="label pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2 text-center whitespace-nowrap !text-white/55 transition-opacity duration-700"
      style={{ opacity: dismissed ? 0 : 1 }}
    >
      drag to paint · space to pause
    </p>
  )
}

/** Top-right button that opens the panel; fades out while the panel is open. */
export function PanelToggle() {
  const open = useSettings((s) => s.panelOpen)
  const setPanelOpen = useSettings((s) => s.setPanelOpen)
  return (
    <button
      type="button"
      onClick={() => setPanelOpen(true)}
      aria-label="Open controls"
      aria-expanded={open}
      title="Controls (c)"
      tabIndex={open ? -1 : 0}
      className="glass focus-ring absolute top-4 right-4 z-20 flex items-center gap-2 !rounded-full px-3.5 py-2 text-[11px] tracking-wide text-white/80 transition-[opacity,transform,background-color] duration-300 hover:bg-white/10 hover:text-white sm:top-5 sm:right-5"
      style={{ opacity: open ? 0 : 1, pointerEvents: open ? 'none' : 'auto', transform: open ? 'translateY(-6px)' : 'translateY(0)' }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
        <path d="M1 3.5h12M1 10.5h12" />
        <circle cx="5" cy="3.5" r="1.6" fill="#000" />
        <circle cx="9" cy="10.5" r="1.6" fill="#000" />
      </svg>
      controls
    </button>
  )
}

/** Transient status message. */
export function Toast() {
  const toast = useRuntime((s) => s.toast)
  const clearToast = useRuntime((s) => s.clearToast)
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(clearToast, 2600)
    return () => window.clearTimeout(id)
  }, [toast, clearToast])
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute bottom-14 left-1/2 z-20 -translate-x-1/2 transition-[opacity,transform] duration-300"
      style={{ opacity: toast ? 1 : 0, transform: `translate(-50%, ${toast ? 0 : 8}px)`, transitionTimingFunction: 'var(--ease-spring)' }}
    >
      {toast ? <span className="glass block !rounded-full px-3.5 py-1.5 text-[11px] text-white/85">{toast}</span> : null}
    </div>
  )
}

/** Shown in place of the fluid when WebGL2 is missing or the GPU failed. */
export function GpuFallback() {
  const status = useRuntime((s) => s.gpuStatus)
  const error = useRuntime((s) => s.gpuError)
  if (status !== 'unsupported' && status !== 'error') return null
  const unsupported = status === 'unsupported'
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black p-6" data-testid="webgl-fallback" role="alert">
      <div className="glass max-w-md p-7">
        <h2 className="font-display text-xl font-medium tracking-tight text-white">{unsupported ? 'WebGL2 not supported' : 'The GPU stopped responding'}</h2>
        <p className="mt-3 text-[12.5px] leading-relaxed text-white/65">
          {unsupported
            ? 'Eddy runs a Navier–Stokes solver on your graphics card through WebGL2, and this browser did not hand one out. Hardware acceleration may be disabled, or the browser may be too old.'
            : error}
        </p>
        {unsupported ? (
          <ul className="mt-4 space-y-1.5 text-[11.5px] text-white/50">
            <li>· Try a current version of Chrome, Edge, Firefox or Safari 15+.</li>
            <li>· Check that hardware acceleration is turned on in the browser settings.</li>
            <li>· On Linux, some drivers need WebGL enabled from about:config / chrome://flags.</li>
          </ul>
        ) : null}
      </div>
    </div>
  )
}
