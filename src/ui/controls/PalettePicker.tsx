import type { KeyboardEvent } from 'react'
import { rgbToHex } from '../../core/color'
import { PALETTE_LIST, paletteColor, type Palette, type PaletteId } from '../../core/palette'

interface PalettePickerProps {
  value: PaletteId
  onChange: (id: PaletteId) => void
}

function swatchGradient(p: Palette): string {
  const stops = [0, 0.33, 0.66, 0.999].map((t) => rgbToHex(paletteColor(p, t, 0.6, 0.85)))
  return `linear-gradient(135deg, ${stops.join(', ')})`
}

/** Radio group of palette swatches; arrow keys move between them. */
export function PalettePicker({ value, onChange }: PalettePickerProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = PALETTE_LIST.findIndex((p) => p.id === value)
    let next = index
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % PALETTE_LIST.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + PALETTE_LIST.length) % PALETTE_LIST.length
    else return
    event.preventDefault()
    onChange(PALETTE_LIST[next].id)
    const el = event.currentTarget.querySelector<HTMLButtonElement>(`[data-palette="${PALETTE_LIST[next].id}"]`)
    el?.focus()
  }

  const active = PALETTE_LIST.find((p) => p.id === value) ?? PALETTE_LIST[0]

  return (
    <div>
      <div role="radiogroup" aria-label="Colour palette" className="flex flex-wrap gap-2.5" onKeyDown={onKeyDown}>
        {PALETTE_LIST.map((p) => {
          const selected = p.id === value
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={p.name}
              title={`${p.name} — ${p.tagline}`}
              data-palette={p.id}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(p.id)}
              className="focus-ring relative h-7 w-7 rounded-full transition-transform duration-200 hover:scale-110"
              style={{
                background: swatchGradient(p),
                boxShadow: selected ? `0 0 0 2px #000, 0 0 0 4px ${p.accent}, 0 0 18px ${p.accent}88` : '0 0 0 1px rgba(255,255,255,0.12)',
                transitionTimingFunction: 'var(--ease-spring)',
              }}
            />
          )
        })}
      </div>
      <p className="mt-2.5 text-[11px] text-white/45">
        <span className="text-white/80">{active.name}</span> · {active.tagline}
      </p>
    </div>
  )
}
