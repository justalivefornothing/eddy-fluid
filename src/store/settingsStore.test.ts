import { describe, expect, it } from 'vitest'
import { BUILT_IN_PRESETS, BUILT_IN_PRESET_LIST, DEFAULT_SETTINGS } from '../core/presets'
import { PRESETS_STORAGE_KEY, SETTINGS_STORAGE_KEY, STORAGE_NAMESPACE, createSettingsStore, selectActivePreset, selectIsDirty, type StorageLike } from './settingsStore'

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>()
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
}

describe('settings store', () => {
  it('namespaces every localStorage key under eddy:', () => {
    expect(STORAGE_NAMESPACE).toBe('eddy:v1')
    expect(PRESETS_STORAGE_KEY.startsWith(`${STORAGE_NAMESPACE}:`)).toBe(true)
    expect(SETTINGS_STORAGE_KEY.startsWith(`${STORAGE_NAMESPACE}:`)).toBe(true)
    const storage = new MemoryStorage()
    const store = createSettingsStore(storage)
    store.getState().saveUserPreset('Mine')
    for (const key of storage.map.keys()) expect(key.startsWith('eddy:')).toBe(true)
  })

  it('starts from defaults and the five built-in presets are typed constants', () => {
    const store = createSettingsStore(new MemoryStorage())
    expect(store.getState().settings).toEqual(DEFAULT_SETTINGS)
    expect(store.getState().userPresets).toEqual([])
    expect(BUILT_IN_PRESET_LIST).toHaveLength(5)
    expect(Object.keys(BUILT_IN_PRESETS)).toEqual(['silk', 'smoke', 'ink', 'plasma', 'glitch'])
  })

  it('applies built-in presets and tracks drift as dirty', () => {
    const store = createSettingsStore(new MemoryStorage())
    expect(store.getState().applyPreset('plasma')).toBe(true)
    expect(store.getState().settings).toEqual(BUILT_IN_PRESETS.plasma.values)
    expect(selectActivePreset(store.getState())?.name).toBe('Plasma')
    expect(selectIsDirty(store.getState())).toBe(false)
    store.getState().setSetting('curl', 10)
    expect(selectIsDirty(store.getState())).toBe(true)
    expect(store.getState().applyPreset('does-not-exist')).toBe(false)
  })

  it('persists user presets and reloads them from the same storage', () => {
    const storage = new MemoryStorage()
    const store = createSettingsStore(storage)
    store.getState().setSetting('curl', 3)
    store.getState().setSetting('palette', 'ocean')
    const saved = store.getState().saveUserPreset('  Calm   sea  ')
    expect(saved.name).toBe('Calm sea')
    expect(saved.values.curl).toBe(3)
    expect(store.getState().activePresetId).toBe(saved.id)

    const reloaded = createSettingsStore(storage)
    expect(reloaded.getState().userPresets).toEqual([saved])
    expect(reloaded.getState().activePresetId).toBe(saved.id)
    expect(reloaded.getState().settings.palette).toBe('ocean')
  })

  it('renames, updates and deletes user presets but never built-ins', () => {
    const storage = new MemoryStorage()
    const store = createSettingsStore(storage)
    const preset = store.getState().saveUserPreset('Draft')
    store.getState().renameUserPreset(preset.id, 'Final')
    expect(store.getState().userPresets[0].name).toBe('Final')

    store.getState().setSetting('bloomIntensity', 1.5)
    expect(selectIsDirty(store.getState())).toBe(true)
    store.getState().updateUserPreset(preset.id)
    expect(store.getState().userPresets[0].values.bloomIntensity).toBe(1.5)
    expect(selectIsDirty(store.getState())).toBe(false)

    store.getState().renameUserPreset('silk', 'Hacked')
    store.getState().deleteUserPreset('silk')
    expect(BUILT_IN_PRESETS.silk.name).toBe('Silk')

    store.getState().deleteUserPreset(preset.id)
    expect(store.getState().userPresets).toEqual([])
    expect(store.getState().activePresetId).toBeNull()
    expect(createSettingsStore(storage).getState().userPresets).toEqual([])
  })

  it('sanitises setSetting values and survives corrupt storage', () => {
    const storage = new MemoryStorage()
    storage.setItem(SETTINGS_STORAGE_KEY, '{"settings":{"curl":999,"palette":"nope"},"activePresetId":"ghost"}')
    storage.setItem(PRESETS_STORAGE_KEY, 'garbage{')
    const store = createSettingsStore(storage)
    expect(store.getState().settings.curl).toBe(60)
    expect(store.getState().settings.palette).toBe(DEFAULT_SETTINGS.palette)
    expect(store.getState().activePresetId).toBeNull()
    expect(store.getState().userPresets).toEqual([])
    store.getState().setSetting('pressureIterations', 1000)
    expect(store.getState().settings.pressureIterations).toBe(40)
  })

  it('works without any storage at all', () => {
    const store = createSettingsStore(null)
    store.getState().saveUserPreset('Volatile')
    expect(store.getState().userPresets).toHaveLength(1)
    store.getState().togglePaused()
    expect(store.getState().paused).toBe(true)
    store.getState().togglePanel()
    expect(store.getState().panelOpen).toBe(true)
    store.getState().dismissHint()
    expect(store.getState().hintDismissed).toBe(true)
  })
})
