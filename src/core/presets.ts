import { isPaletteId, type PaletteId } from './palette'

/**
 * Everything a preset captures. These are the knobs that change how the
 * fluid looks and behaves; transient UI state (paused, panel open) is not
 * part of a preset.
 */
export interface SimSettings {
  simResolution: number
  dyeResolution: number
  /** Exponential decay rate of velocity, per second. */
  velocityDissipation: number
  /** Exponential decay rate of dye, per second. */
  dyeDissipation: number
  /** Fraction of last frame's pressure kept as the Jacobi warm start (0..1). */
  pressure: number
  pressureIterations: number
  /** Vorticity confinement strength. */
  curl: number
  /** Gaussian splat radius in world units (viewport short side = 1). */
  splatRadius: number
  /** Pointer speed -> injected velocity multiplier (60 = fluid matches pointer speed). */
  splatForce: number
  palette: PaletteId
  /** Pseudo-lighting from the dye gradient in the display pass. */
  shading: boolean
  bloom: boolean
  bloomIntensity: number
  bloomThreshold: number
  /** Fire random splats when idle. */
  autoSplats: boolean
}

export interface NumericRange {
  min: number
  max: number
  step: number
}

/** Valid ranges for every numeric knob, used by sliders and by validation. */
export const SETTING_RANGES: Readonly<Record<NumericSettingKey, NumericRange>> = {
  simResolution: { min: 128, max: 512, step: 1 },
  dyeResolution: { min: 512, max: 2048, step: 1 },
  velocityDissipation: { min: 0, max: 4, step: 0.01 },
  dyeDissipation: { min: 0, max: 4, step: 0.01 },
  pressure: { min: 0, max: 1, step: 0.01 },
  pressureIterations: { min: 15, max: 40, step: 1 },
  curl: { min: 0, max: 60, step: 1 },
  splatRadius: { min: 0.005, max: 0.12, step: 0.001 },
  splatForce: { min: 5, max: 120, step: 1 },
  bloomIntensity: { min: 0, max: 2, step: 0.01 },
  bloomThreshold: { min: 0, max: 1, step: 0.01 },
}

export type NumericSettingKey =
  | 'simResolution'
  | 'dyeResolution'
  | 'velocityDissipation'
  | 'dyeDissipation'
  | 'pressure'
  | 'pressureIterations'
  | 'curl'
  | 'splatRadius'
  | 'splatForce'
  | 'bloomIntensity'
  | 'bloomThreshold'

export const NUMERIC_KEYS = Object.keys(SETTING_RANGES) as NumericSettingKey[]
export const BOOLEAN_KEYS = ['shading', 'bloom', 'autoSplats'] as const satisfies readonly (keyof SimSettings)[]

export const DEFAULT_SETTINGS: Readonly<SimSettings> = {
  simResolution: 256,
  dyeResolution: 1024,
  velocityDissipation: 0.25,
  dyeDissipation: 0.9,
  pressure: 0.8,
  pressureIterations: 24,
  curl: 28,
  splatRadius: 0.035,
  splatForce: 40,
  palette: 'spectrum',
  shading: true,
  bloom: true,
  bloomIntensity: 0.55,
  bloomThreshold: 0.55,
  autoSplats: true,
}

export interface Preset {
  readonly id: string
  readonly name: string
  readonly values: SimSettings
}

export type BuiltInPresetId = 'silk' | 'smoke' | 'ink' | 'plasma' | 'glitch'

/** The five built-in looks. Typed constants, never mutated at runtime. */
export const BUILT_IN_PRESETS: Readonly<Record<BuiltInPresetId, Preset>> = {
  silk: {
    id: 'silk',
    name: 'Silk',
    values: {
      ...DEFAULT_SETTINGS,
      velocityDissipation: 0.12,
      dyeDissipation: 0.5,
      pressure: 0.85,
      pressureIterations: 30,
      curl: 12,
      splatRadius: 0.055,
      splatForce: 32,
      palette: 'nebula',
      bloomIntensity: 0.5,
      bloomThreshold: 0.6,
    },
  },
  smoke: {
    id: 'smoke',
    name: 'Smoke',
    values: {
      ...DEFAULT_SETTINGS,
      velocityDissipation: 0.6,
      dyeDissipation: 1.6,
      pressure: 0.7,
      pressureIterations: 20,
      curl: 45,
      splatRadius: 0.07,
      splatForce: 28,
      palette: 'mono',
      shading: true,
      bloom: false,
      bloomIntensity: 0.2,
      bloomThreshold: 0.8,
    },
  },
  ink: {
    id: 'ink',
    name: 'Ink',
    values: {
      ...DEFAULT_SETTINGS,
      velocityDissipation: 0.9,
      dyeDissipation: 0.08,
      pressure: 0.95,
      pressureIterations: 36,
      curl: 6,
      splatRadius: 0.02,
      splatForce: 55,
      palette: 'ocean',
      shading: false,
      bloom: false,
      bloomIntensity: 0.3,
      bloomThreshold: 0.7,
    },
  },
  plasma: {
    id: 'plasma',
    name: 'Plasma',
    values: {
      ...DEFAULT_SETTINGS,
      velocityDissipation: 0.05,
      dyeDissipation: 0.7,
      pressure: 0.9,
      pressureIterations: 26,
      curl: 55,
      splatRadius: 0.04,
      splatForce: 60,
      palette: 'ember',
      bloom: true,
      bloomIntensity: 1.1,
      bloomThreshold: 0.35,
    },
  },
  glitch: {
    id: 'glitch',
    name: 'Glitch',
    values: {
      ...DEFAULT_SETTINGS,
      simResolution: 128,
      dyeResolution: 512,
      velocityDissipation: 0.0,
      dyeDissipation: 1.2,
      pressure: 0.3,
      pressureIterations: 15,
      curl: 60,
      splatRadius: 0.014,
      splatForce: 90,
      palette: 'acid',
      shading: false,
      bloom: true,
      bloomIntensity: 0.9,
      bloomThreshold: 0.2,
    },
  },
}

export const BUILT_IN_PRESET_LIST: readonly Preset[] = (
  ['silk', 'smoke', 'ink', 'plasma', 'glitch'] as BuiltInPresetId[]
).map((id) => BUILT_IN_PRESETS[id])

export function isBuiltInPresetId(id: string): id is BuiltInPresetId {
  return Object.hasOwn(BUILT_IN_PRESETS, id)
}

// ---------------------------------------------------------------------------
// Validation & (de)serialisation
// ---------------------------------------------------------------------------

export function clampToRange(value: number, range: NumericRange): number {
  if (!Number.isFinite(value)) return range.min
  return Math.min(range.max, Math.max(range.min, value))
}

/**
 * Coerce an untrusted object into a fully-populated, in-range SimSettings.
 * Unknown keys are dropped, missing keys fall back to `base`, numbers are
 * clamped and booleans/palette ids validated. Never throws.
 */
export function sanitizeSettings(input: unknown, base: SimSettings = DEFAULT_SETTINGS): SimSettings {
  const out: SimSettings = { ...base }
  if (typeof input !== 'object' || input === null) return out
  const src = input as Record<string, unknown>
  for (const key of NUMERIC_KEYS) {
    const v = src[key]
    if (typeof v === 'number') out[key] = clampToRange(v, SETTING_RANGES[key])
  }
  for (const key of BOOLEAN_KEYS) {
    const v = src[key]
    if (typeof v === 'boolean') out[key] = v
  }
  if (isPaletteId(src.palette)) out.palette = src.palette
  // Integer-only knobs.
  out.simResolution = Math.round(out.simResolution)
  out.dyeResolution = Math.round(out.dyeResolution)
  out.pressureIterations = Math.round(out.pressureIterations)
  return out
}

export const PRESET_FORMAT_VERSION = 1

interface PresetWire {
  v: number
  id: string
  name: string
  values: SimSettings
}

export function serializePreset(preset: Preset): string {
  const wire: PresetWire = { v: PRESET_FORMAT_VERSION, id: preset.id, name: preset.name, values: preset.values }
  return JSON.stringify(wire)
}

export function serializePresets(presets: readonly Preset[]): string {
  return JSON.stringify({ v: PRESET_FORMAT_VERSION, presets: presets.map((p) => ({ id: p.id, name: p.name, values: p.values })) })
}

function presetFromWire(obj: unknown): Preset | null {
  if (typeof obj !== 'object' || obj === null) return null
  const o = obj as Record<string, unknown>
  if (typeof o.id !== 'string' || o.id.length === 0) return null
  const name = typeof o.name === 'string' && o.name.trim().length > 0 ? o.name.trim().slice(0, 40) : 'Untitled'
  return { id: o.id, name, values: sanitizeSettings(o.values) }
}

/** Parse a single serialised preset; returns null on any malformed input. */
export function deserializePreset(json: string): Preset | null {
  try {
    return presetFromWire(JSON.parse(json))
  } catch {
    return null
  }
}

/** Parse a serialised preset list; malformed entries are skipped, never thrown. */
export function deserializePresets(json: string | null | undefined): Preset[] {
  if (!json) return []
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return []
    const list = (parsed as { presets?: unknown }).presets
    if (!Array.isArray(list)) return []
    const out: Preset[] = []
    const seen = new Set<string>()
    for (const item of list) {
      const p = presetFromWire(item)
      if (p && !seen.has(p.id) && !isBuiltInPresetId(p.id)) {
        seen.add(p.id)
        out.push(p)
      }
    }
    return out
  } catch {
    return []
  }
}

/** Shallow equality on every settings key. */
export function settingsEqual(a: SimSettings, b: SimSettings): boolean {
  for (const key of Object.keys(a) as (keyof SimSettings)[]) if (a[key] !== b[key]) return false
  return true
}

/** Generate a URL-safe id for a user preset. */
export function makePresetId(rng: () => number = Math.random, now: number = Date.now()): string {
  const rand = Math.floor(rng() * 0xffffff)
    .toString(36)
    .padStart(5, '0')
  return `u_${now.toString(36)}_${rand}`
}

// ---------------------------------------------------------------------------
// Shareable settings hash (#s=<base64url json>)
// ---------------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function utf8Encode(str: string): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const lo = str.charCodeAt(i + 1)
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00)
        i++
      }
    }
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  return Uint8Array.from(out)
}

function utf8Decode(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i]
    let cp: number
    if (b < 0x80) {
      cp = b
      i += 1
    } else if (b < 0xe0) {
      cp = ((b & 31) << 6) | (bytes[i + 1] & 63)
      i += 2
    } else if (b < 0xf0) {
      cp = ((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63)
      i += 3
    } else {
      cp = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63)
      i += 4
    }
    s += String.fromCodePoint(cp)
  }
  return s
}

/** Dependency-free base64url (no padding) so this works in Node and browsers alike. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0
    const n = (a << 16) | (b << 8) | c
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
    if (i + 1 < bytes.length) s += B64[(n >> 6) & 63]
    if (i + 2 < bytes.length) s += B64[n & 63]
  }
  return s
}

export function base64UrlDecode(str: string): Uint8Array | null {
  const out: number[] = []
  let buffer = 0
  let bits = 0
  for (const ch of str) {
    const v = B64.indexOf(ch)
    if (v < 0) return null
    buffer = (buffer << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buffer >> bits) & 255)
    }
  }
  return Uint8Array.from(out)
}

export function encodeSettingsHash(settings: SimSettings): string {
  return `s=${base64UrlEncode(utf8Encode(JSON.stringify(settings)))}`
}

/** Read settings back out of a location.hash string. Returns null when absent/invalid. */
export function decodeSettingsHash(hash: string): SimSettings | null {
  const m = /(?:^#?|&)s=([A-Za-z0-9\-_]+)/.exec(hash)
  if (!m) return null
  const bytes = base64UrlDecode(m[1])
  if (!bytes) return null
  try {
    const parsed: unknown = JSON.parse(utf8Decode(bytes))
    if (typeof parsed !== 'object' || parsed === null) return null
    return sanitizeSettings(parsed)
  } catch {
    return null
  }
}
