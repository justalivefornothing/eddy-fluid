import { create } from 'zustand'
import {
  BUILT_IN_PRESETS,
  DEFAULT_SETTINGS,
  cleanPresetName,
  deserializePresets,
  isBuiltInPresetId,
  makePresetId,
  sanitizeSettings,
  serializePresets,
  settingsEqual,
  type Preset,
  type SimSettings,
} from '../core/presets'

/** Every key this app writes starts with this namespace. */
export const STORAGE_NAMESPACE = 'eddy:v1'
export const PRESETS_STORAGE_KEY = `${STORAGE_NAMESPACE}:presets`
export const SETTINGS_STORAGE_KEY = `${STORAGE_NAMESPACE}:settings`

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface SettingsState {
  settings: SimSettings
  /** Built-in or user preset id the current settings were loaded from; null = custom. */
  activePresetId: string | null
  userPresets: Preset[]
  paused: boolean
  panelOpen: boolean
  hintDismissed: boolean

  setSetting: <K extends keyof SimSettings>(key: K, value: SimSettings[K]) => void
  replaceSettings: (settings: SimSettings, presetId?: string | null) => void
  applyPreset: (id: string) => boolean
  saveUserPreset: (name: string) => Preset
  updateUserPreset: (id: string) => void
  renameUserPreset: (id: string, name: string) => void
  deleteUserPreset: (id: string) => void
  setPaused: (paused: boolean) => void
  togglePaused: () => void
  setPanelOpen: (open: boolean) => void
  togglePanel: () => void
  dismissHint: () => void
}

interface PersistedSettings {
  settings: SimSettings
  activePresetId: string | null
}

function readPersistedSettings(storage: StorageLike | null): PersistedSettings {
  const fallback: PersistedSettings = { settings: { ...DEFAULT_SETTINGS }, activePresetId: null }
  if (!storage) return fallback
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return fallback
    const obj = parsed as { settings?: unknown; activePresetId?: unknown }
    return {
      settings: sanitizeSettings(obj.settings),
      activePresetId: typeof obj.activePresetId === 'string' ? obj.activePresetId : null,
    }
  } catch {
    return fallback
  }
}

function readPersistedPresets(storage: StorageLike | null): Preset[] {
  if (!storage) return []
  try {
    return deserializePresets(storage.getItem(PRESETS_STORAGE_KEY))
  } catch {
    return []
  }
}

function findPreset(id: string, userPresets: readonly Preset[]): Preset | undefined {
  if (isBuiltInPresetId(id)) return BUILT_IN_PRESETS[id]
  return userPresets.find((p) => p.id === id)
}

/**
 * Build the settings store. Storage is injected so tests can use an
 * in-memory map and the app can pass `localStorage` (or null when it is
 * unavailable, e.g. blocked third-party storage).
 */
export function createSettingsStore(storage: StorageLike | null) {
  const persistSettings = (settings: SimSettings, activePresetId: string | null): void => {
    if (!storage) return
    try {
      storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ settings, activePresetId }))
    } catch {
      // Storage full or disabled: the app keeps working without persistence.
    }
  }
  const persistPresets = (presets: readonly Preset[]): void => {
    if (!storage) return
    try {
      storage.setItem(PRESETS_STORAGE_KEY, serializePresets(presets))
    } catch {
      // ignore
    }
  }

  const initial = readPersistedSettings(storage)
  const initialPresets = readPersistedPresets(storage)
  // If the remembered preset no longer exists, the settings are simply "custom".
  const initialActive = initial.activePresetId && findPreset(initial.activePresetId, initialPresets) ? initial.activePresetId : null

  return create<SettingsState>()((set, get) => ({
    settings: initial.settings,
    activePresetId: initialActive,
    userPresets: initialPresets,
    paused: false,
    panelOpen: false,
    hintDismissed: false,

    setSetting: (key, value) => {
      const settings = sanitizeSettings({ ...get().settings, [key]: value }, get().settings)
      set({ settings })
      persistSettings(settings, get().activePresetId)
    },

    replaceSettings: (next, presetId = null) => {
      const settings = sanitizeSettings(next)
      set({ settings, activePresetId: presetId })
      persistSettings(settings, presetId)
    },

    applyPreset: (id) => {
      const preset = findPreset(id, get().userPresets)
      if (!preset) return false
      const settings = { ...preset.values }
      set({ settings, activePresetId: id })
      persistSettings(settings, id)
      return true
    },

    saveUserPreset: (name) => {
      const preset: Preset = { id: makePresetId(), name: cleanPresetName(name), values: { ...get().settings } }
      const userPresets = [...get().userPresets, preset]
      set({ userPresets, activePresetId: preset.id })
      persistPresets(userPresets)
      persistSettings(get().settings, preset.id)
      return preset
    },

    updateUserPreset: (id) => {
      if (isBuiltInPresetId(id)) return
      const userPresets = get().userPresets.map((p) => (p.id === id ? { ...p, values: { ...get().settings } } : p))
      set({ userPresets, activePresetId: id })
      persistPresets(userPresets)
      persistSettings(get().settings, id)
    },

    renameUserPreset: (id, name) => {
      if (isBuiltInPresetId(id)) return
      const clean = cleanPresetName(name)
      const userPresets = get().userPresets.map((p) => (p.id === id ? { ...p, name: clean } : p))
      set({ userPresets })
      persistPresets(userPresets)
    },

    deleteUserPreset: (id) => {
      if (isBuiltInPresetId(id)) return
      const userPresets = get().userPresets.filter((p) => p.id !== id)
      const activePresetId = get().activePresetId === id ? null : get().activePresetId
      set({ userPresets, activePresetId })
      persistPresets(userPresets)
      persistSettings(get().settings, activePresetId)
    },

    setPaused: (paused) => set({ paused }),
    togglePaused: () => set((s) => ({ paused: !s.paused })),
    setPanelOpen: (panelOpen) => set({ panelOpen }),
    togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
    dismissHint: () => {
      if (!get().hintDismissed) set({ hintDismissed: true })
    },
  }))
}

export type SettingsStore = ReturnType<typeof createSettingsStore>

/** True when the active preset exists and the live settings have drifted from it. */
export function selectIsDirty(state: Pick<SettingsState, 'settings' | 'activePresetId' | 'userPresets'>): boolean {
  if (!state.activePresetId) return false
  const preset = findPreset(state.activePresetId, state.userPresets)
  return preset ? !settingsEqual(preset.values, state.settings) : false
}

export function selectActivePreset(state: Pick<SettingsState, 'activePresetId' | 'userPresets'>): Preset | undefined {
  return state.activePresetId ? findPreset(state.activePresetId, state.userPresets) : undefined
}

function safeLocalStorage(): StorageLike | null {
  try {
    const g = globalThis as { localStorage?: StorageLike }
    if (!g.localStorage) return null
    const probe = `${STORAGE_NAMESPACE}:probe`
    g.localStorage.setItem(probe, '1')
    g.localStorage.removeItem(probe)
    return g.localStorage
  } catch {
    return null
  }
}

/** The app-wide store, backed by localStorage when available. */
export const useSettings = createSettingsStore(safeLocalStorage())
