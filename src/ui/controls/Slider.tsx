import { useId, type CSSProperties } from 'react'

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  format?: (value: number) => string
  hint?: string
}

/** Continuous slider with a gradient track that fills in the palette accent. */
export function Slider({ label, value, min, max, step, onChange, format, hint }: SliderProps) {
  const id = useId()
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0
  const shown = format ? format(value) : formatNumber(value, step)
  return (
    <div className="group">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="label transition-colors group-hover:text-white/75" title={hint}>
          {label}
        </label>
        <output htmlFor={id} className="text-[11.5px] tabular-nums text-white/85">
          {shown}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="eddy-range"
        style={{ '--fill': `${fill}%` } as CSSProperties}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={shown}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
    </div>
  )
}

interface SteppedSliderProps {
  label: string
  value: number
  options: readonly number[]
  onChange: (value: number) => void
  format?: (value: number) => string
  hint?: string
}

/** Slider that snaps to a fixed list of values (e.g. texture resolutions). */
export function SteppedSlider({ label, value, options, onChange, format, hint }: SteppedSliderProps) {
  const id = useId()
  let index = options.indexOf(value)
  if (index < 0) {
    // Nearest option when the value came from a preset/URL and isn't on the list.
    index = options.reduce((best, opt, i) => (Math.abs(opt - value) < Math.abs(options[best] - value) ? i : best), 0)
  }
  const fill = options.length > 1 ? (index / (options.length - 1)) * 100 : 0
  const shown = format ? format(options[index]) : String(options[index])
  return (
    <div className="group">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="label transition-colors group-hover:text-white/75" title={hint}>
          {label}
        </label>
        <output htmlFor={id} className="text-[11.5px] tabular-nums text-white/85">
          {shown}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="eddy-range"
        style={{ '--fill': `${fill}%` } as CSSProperties}
        min={0}
        max={options.length - 1}
        step={1}
        value={index}
        aria-valuetext={shown}
        onChange={(e) => onChange(options[Number(e.currentTarget.value)])}
      />
    </div>
  )
}

export function formatNumber(value: number, step: number): string {
  const decimals = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)))
  return value.toFixed(decimals)
}
