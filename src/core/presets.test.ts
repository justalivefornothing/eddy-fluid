import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { PALETTE_IDS } from './palette'
import {
  BOOLEAN_KEYS,
  BUILT_IN_PRESETS,
  BUILT_IN_PRESET_LIST,
  DEFAULT_SETTINGS,
  NUMERIC_KEYS,
  SETTING_RANGES,
  decodeSettingsHash,
  deserializePreset,
  deserializePresets,
  encodeSettingsHash,
  isBuiltInPresetId,
  makePresetId,
  sanitizeSettings,
  serializePreset,
  serializePresets,
  settingsEqual,
  type Preset,
  type SimSettings,
} from './presets'

/** Arbitrary settings that respect every range, so a round-trip must be lossless. */
const settingsArb: fc.Arbitrary<SimSettings> = fc
  .record({
    simResolution: fc.integer({ min: 128, max: 512 }),
    dyeResolution: fc.integer({ min: 512, max: 2048 }),
    velocityDissipation: fc.double({ min: 0, max: 4, noNaN: true }),
    dyeDissipation: fc.double({ min: 0, max: 4, noNaN: true }),
    pressure: fc.double({ min: 0, max: 1, noNaN: true }),
    pressureIterations: fc.integer({ min: 15, max: 40 }),
    curl: fc.double({ min: 0, max: 60, noNaN: true }),
    splatRadius: fc.double({ min: 0.005, max: 0.12, noNaN: true }),
    splatForce: fc.double({ min: 5, max: 120, noNaN: true }),
    bloomIntensity: fc.double({ min: 0, max: 2, noNaN: true }),
    bloomThreshold: fc.double({ min: 0, max: 1, noNaN: true }),
    palette: fc.constantFrom(...PALETTE_IDS),
    shading: fc.boolean(),
    bloom: fc.boolean(),
    autoSplats: fc.boolean(),
  })
  .map((s) => ({ ...s }))

const presetArb: fc.Arbitrary<Preset> = fc.record({
  id: fc.stringMatching(/^u_[a-z0-9]{3,12}$/),
  name: fc.string({ minLength: 1, maxLength: 30 }).filter((n) => n.trim().length > 0),
  values: settingsArb,
})

describe('built-in presets', () => {
  it('has exactly the five named looks as typed constants', () => {
    expect(BUILT_IN_PRESET_LIST.map((p) => p.name)).toEqual(['Silk', 'Smoke', 'Ink', 'Plasma', 'Glitch'])
    expect(Object.keys(BUILT_IN_PRESETS).sort()).toEqual(['glitch', 'ink', 'plasma', 'silk', 'smoke'])
  })

  it('every built-in is already in range (sanitising is a no-op)', () => {
    for (const p of BUILT_IN_PRESET_LIST) {
      expect(sanitizeSettings(p.values)).toEqual(p.values)
      expect(isBuiltInPresetId(p.id)).toBe(true)
    }
    expect(isBuiltInPresetId('u_abc')).toBe(false)
  })

  it('defaults are in range and cover every key', () => {
    expect(sanitizeSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS)
    const keys = new Set<string>([...NUMERIC_KEYS, ...BOOLEAN_KEYS, 'palette'])
    expect(new Set(Object.keys(DEFAULT_SETTINGS))).toEqual(keys)
  })
})

describe('preset serialisation', () => {
  it('round-trips a single preset', () => {
    fc.assert(
      fc.property(presetArb, (preset) => {
        const back = deserializePreset(serializePreset(preset))
        expect(back).not.toBeNull()
        expect(back!.id).toBe(preset.id)
        expect(back!.name).toBe(preset.name.replace(/\s+/g, ' ').trim().slice(0, 40) || 'Untitled')
        expect(settingsEqual(back!.values, preset.values)).toBe(true)
      }),
    )
  })

  it('round-trips a list, dropping duplicates and built-in ids', () => {
    fc.assert(
      fc.property(fc.array(presetArb, { maxLength: 8 }), (presets) => {
        const unique = presets.filter((p, i) => presets.findIndex((q) => q.id === p.id) === i)
        const back = deserializePresets(serializePresets(presets))
        expect(back.map((p) => p.id)).toEqual(unique.map((p) => p.id))
        for (const p of back) expect(settingsEqual(p.values, unique.find((q) => q.id === p.id)!.values)).toBe(true)
      }),
    )
    const smuggled: Preset = { id: 'silk', name: 'fake silk', values: DEFAULT_SETTINGS }
    expect(deserializePresets(serializePresets([smuggled]))).toEqual([])
  })

  it('never throws on garbage', () => {
    expect(deserializePresets('not json')).toEqual([])
    expect(deserializePresets('{"presets": 5}')).toEqual([])
    expect(deserializePresets(null)).toEqual([])
    expect(deserializePreset('[1,2]')).toBeNull()
    expect(deserializePreset('{"id":"","name":"x"}')).toBeNull()
  })

  it('sanitises out-of-range and wrong-typed values', () => {
    const dirty = { simResolution: 99999, pressureIterations: 3.7, palette: 'rainbow', bloom: 'yes', curl: Number.NaN, junk: 1 }
    const clean = sanitizeSettings(dirty)
    expect(clean.simResolution).toBe(SETTING_RANGES.simResolution.max)
    expect(clean.pressureIterations).toBe(SETTING_RANGES.pressureIterations.min)
    expect(clean.palette).toBe(DEFAULT_SETTINGS.palette)
    expect(clean.bloom).toBe(DEFAULT_SETTINGS.bloom)
    expect(clean.curl).toBe(SETTING_RANGES.curl.min)
    expect('junk' in clean).toBe(false)
  })
})

describe('settings hash (share link)', () => {
  it('round-trips settings through the URL hash', () => {
    fc.assert(
      fc.property(settingsArb, (settings) => {
        const hash = encodeSettingsHash(settings)
        expect(hash).toMatch(/^s=[A-Za-z0-9\-_]+$/)
        const back = decodeSettingsHash(`#${hash}`)
        expect(back).not.toBeNull()
        expect(settingsEqual(back!, settings)).toBe(true)
      }),
    )
  })

  it('ignores hashes without settings', () => {
    expect(decodeSettingsHash('')).toBeNull()
    expect(decodeSettingsHash('#panel')).toBeNull()
    expect(decodeSettingsHash('#s=!!!')).toBeNull()
  })
})

describe('makePresetId', () => {
  it('produces unique, url-safe ids', () => {
    const ids = new Set<string>()
    let t = 0
    for (let i = 0; i < 1000; i++) ids.add(makePresetId(Math.random, t++))
    expect(ids.size).toBe(1000)
    for (const id of ids) expect(id).toMatch(/^u_[a-z0-9_]+$/)
  })
})
