import { useEffect } from 'react'
import { decodeSettingsHash, encodeSettingsHash, type SimSettings } from '../core/presets'
import { useSettings } from '../store/settingsStore'

/**
 * On first load, read settings out of `#s=<base64url>` (a shared link) and
 * open the panel when the hash mentions `panel`. The hash is consumed once
 * and then cleared so reloads go back to the user's own saved settings.
 */
export function useShareHash(): void {
  useEffect(() => {
    const hash = window.location.hash
    if (!hash) return
    const store = useSettings.getState()
    const shared = decodeSettingsHash(hash)
    if (shared) store.replaceSettings(shared, null)
    if (/(^#|[&#])panel(=|&|$)/.test(hash)) store.setPanelOpen(true)
    if (shared) window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [])
}

/** Absolute URL that reproduces `settings` when opened. */
export function shareUrl(settings: SimSettings, base: string = window.location.href): string {
  const url = new URL(base)
  url.hash = encodeSettingsHash(settings)
  return url.toString()
}

/** Copy the share link; falls back to a hidden textarea when the async clipboard is unavailable. */
export async function copyShareLink(settings: SimSettings): Promise<string> {
  const url = shareUrl(settings)
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url)
    return url
  }
  const area = document.createElement('textarea')
  area.value = url
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  if (!ok) throw new Error('Clipboard unavailable')
  return url
}
