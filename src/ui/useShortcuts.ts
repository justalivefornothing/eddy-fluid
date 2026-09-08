import { useEffect } from 'react'
import { PALETTES } from '../core/palette'
import { useRuntime } from '../store/runtimeStore'
import { useSettings } from '../store/settingsStore'

const INTERACTIVE = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'])

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

/** Global keyboard shortcuts. Never steals keys from text inputs or focused buttons. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const settings = useSettings.getState()
      if (event.key === 'Escape') {
        if (settings.panelOpen) settings.setPanelOpen(false)
        return
      }
      if (isTyping(event.target)) return
      // Space/Enter on a focused control should do the control's own thing.
      const onControl = event.target instanceof HTMLElement && INTERACTIVE.has(event.target.tagName)
      const handle = useRuntime.getState().handle
      switch (event.key) {
        case ' ':
          if (onControl) return
          event.preventDefault()
          settings.togglePaused()
          break
        case 'c':
        case 'C':
          settings.togglePanel()
          break
        case 'r':
        case 'R':
          handle?.randomSplats()
          break
        case 'x':
        case 'X':
          handle?.clear()
          break
        case 'b':
        case 'B':
          settings.setSetting('bloom', !settings.settings.bloom)
          break
        case 's':
        case 'S':
          if (handle) {
            void handle.screenshot().then(
              () => useRuntime.getState().showToast('Screenshot saved as PNG'),
              (error: unknown) => useRuntime.getState().showToast(`Screenshot failed: ${error instanceof Error ? error.message : String(error)}`),
            )
          }
          break
        default:
          return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

/** Mirror the active palette's accent into the CSS variable the whole UI glows with. */
export function useAccentSync(): void {
  const palette = useSettings((s) => s.settings.palette)
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', PALETTES[palette].accent)
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (meta) meta.content = '#000000'
  }, [palette])
}
