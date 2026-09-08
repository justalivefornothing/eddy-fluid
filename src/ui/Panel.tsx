import { useEffect, useRef, type ReactNode } from 'react'
import { SETTING_RANGES } from '../core/presets'
import { DYE_RESOLUTIONS, SIM_RESOLUTIONS } from '../core/resolution'
import { useRuntime } from '../store/runtimeStore'
import { useSettings } from '../store/settingsStore'
import { PalettePicker } from './controls/PalettePicker'
import { PresetSection } from './controls/PresetSection'
import { Slider, SteppedSlider } from './controls/Slider'
import { Toggle } from './controls/Toggle'
import { copyShareLink } from './useShareHash'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-white/[0.07] pt-4 first:border-t-0 first:pt-0">
      <h3 className="label mb-3 !text-white/35">{title}</h3>
      <div className="space-y-3.5">{children}</div>
    </section>
  )
}

/** Frosted-glass side sheet with every control. Slides in from the right. */
export function Panel() {
  const open = useSettings((s) => s.panelOpen)
  const settings = useSettings((s) => s.settings)
  const paused = useSettings((s) => s.paused)
  const { setSetting, setPanelOpen, setPaused } = useSettings.getState()
  const handle = useRuntime((s) => s.handle)
  const showToast = useRuntime((s) => s.showToast)
  const stats = useRuntime((s) => s.stats)
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) closeRef.current?.focus({ preventScroll: true })
  }, [open])

  const R = SETTING_RANGES

  const screenshot = async () => {
    if (!handle) return
    try {
      await handle.screenshot()
      showToast('Screenshot saved as PNG')
    } catch (error) {
      showToast(`Screenshot failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const share = async () => {
    try {
      await copyShareLink(settings)
      showToast('Share link copied to clipboard')
    } catch {
      showToast('Could not access the clipboard')
    }
  }

  return (
    <aside
      ref={panelRef}
      aria-label="Controls"
      aria-hidden={!open}
      className="glass fixed top-3 right-3 bottom-3 z-30 flex w-[min(340px,calc(100vw-24px))] flex-col overflow-hidden transition-transform duration-[560ms]"
      style={{
        transform: open ? 'translateX(0)' : 'translateX(calc(100% + 24px))',
        transitionTimingFunction: open ? 'var(--ease-spring)' : 'cubic-bezier(0.4, 0, 0.6, 1)',
        visibility: open ? 'visible' : 'hidden',
        transitionProperty: 'transform, visibility',
        transitionDelay: open ? '0ms, 0ms' : '0ms, 560ms',
      }}
    >
      <header className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
        <div>
          <h2 className="font-display text-[15px] font-medium tracking-tight text-white">controls</h2>
          <p className="mt-0.5 text-[10.5px] text-white/40 tabular-nums">
            {stats.simWidth > 0 ? `${stats.simWidth}×${stats.simHeight} sim · ${stats.dyeWidth}×${stats.dyeHeight} dye` : 'initialising…'}
          </p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={() => setPanelOpen(false)}
          aria-label="Close controls"
          title="Close (Esc)"
          className="focus-ring flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </button>
      </header>

      <div className="thin-scroll flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <Section title="presets">
          <PresetSection />
        </Section>

        <Section title="palette">
          <PalettePicker value={settings.palette} onChange={(id) => setSetting('palette', id)} />
        </Section>

        <Section title="simulation">
          <SteppedSlider label="sim resolution" value={settings.simResolution} options={SIM_RESOLUTIONS} onChange={(v) => setSetting('simResolution', v)} hint="Cells along the short side of the velocity grid" />
          <SteppedSlider label="dye resolution" value={settings.dyeResolution} options={DYE_RESOLUTIONS} onChange={(v) => setSetting('dyeResolution', v)} hint="Texels along the short side of the colour texture" />
          <Slider label="velocity dissipation" value={settings.velocityDissipation} {...R.velocityDissipation} onChange={(v) => setSetting('velocityDissipation', v)} hint="How quickly motion dies away (per second)" />
          <Slider label="dye dissipation" value={settings.dyeDissipation} {...R.dyeDissipation} onChange={(v) => setSetting('dyeDissipation', v)} hint="How quickly colour fades (per second)" />
          <Slider label="pressure" value={settings.pressure} {...R.pressure} onChange={(v) => setSetting('pressure', v)} hint="Fraction of last frame's pressure reused as the solver's starting guess" />
          <Slider label="pressure iterations" value={settings.pressureIterations} {...R.pressureIterations} onChange={(v) => setSetting('pressureIterations', v)} hint="Jacobi sweeps per frame: more = more incompressible, slower" />
          <Slider label="curl" value={settings.curl} {...R.curl} onChange={(v) => setSetting('curl', v)} hint="Vorticity confinement strength" />
          <Slider label="splat radius" value={settings.splatRadius} {...R.splatRadius} onChange={(v) => setSetting('splatRadius', v)} format={(v) => `${(v * 100).toFixed(1)}%`} hint="Brush size as a fraction of the short side" />
          <Slider label="splat force" value={settings.splatForce} {...R.splatForce} onChange={(v) => setSetting('splatForce', v)} hint="How much of the pointer's speed is transferred to the fluid" />
        </Section>

        <Section title="look">
          <Toggle label="shading" checked={settings.shading} onChange={(v) => setSetting('shading', v)} hint="Light the dye as a soft height field" />
          <Toggle label="bloom" checked={settings.bloom} onChange={(v) => setSetting('bloom', v)} shortcut="b" hint="Glow around bright dye" />
          <Slider label="bloom intensity" value={settings.bloomIntensity} {...R.bloomIntensity} onChange={(v) => setSetting('bloomIntensity', v)} />
          <Slider label="bloom threshold" value={settings.bloomThreshold} {...R.bloomThreshold} onChange={(v) => setSetting('bloomThreshold', v)} hint="Brightness above which dye starts to glow" />
        </Section>

        <Section title="behaviour">
          <Toggle label="idle splats" checked={settings.autoSplats} onChange={(v) => setSetting('autoSplats', v)} hint="Fire random splats after 3 s without input" />
          <Toggle label="paused" checked={paused} onChange={setPaused} shortcut="space" />
        </Section>

        <Section title="actions">
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" className="btn focus-ring" onClick={() => handle?.randomSplats()} disabled={!handle} title="Random splats (r)">
              splats
            </button>
            <button type="button" className="btn focus-ring" onClick={screenshot} disabled={!handle} title="Save a PNG (s)">
              screenshot
            </button>
            <button type="button" className="btn focus-ring" onClick={() => handle?.clear()} disabled={!handle} title="Clear the canvas (x)">
              clear
            </button>
            <button type="button" className="btn focus-ring" onClick={share} title="Copy a link that reproduces these settings">
              share link
            </button>
          </div>
        </Section>
      </div>

      <footer className="border-t border-white/[0.07] px-5 py-3 text-[10px] leading-relaxed tracking-wide text-white/35">
        <span className="text-white/55">space</span> pause · <span className="text-white/55">c</span> panel · <span className="text-white/55">r</span> splats · <span className="text-white/55">s</span> screenshot · <span className="text-white/55">x</span> clear · <span className="text-white/55">b</span> bloom
        <span className="mt-1 block truncate text-white/25" title={stats.formatLabel}>
          {stats.formatLabel || ' '}
        </span>
      </footer>
    </aside>
  )
}
