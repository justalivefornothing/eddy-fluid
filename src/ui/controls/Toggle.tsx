interface ToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
  shortcut?: string
}

/** Accessible switch: role="switch" + aria-checked, keyboard operable. */
export function Toggle({ label, checked, onChange, hint, shortcut }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={hint}
      onClick={() => onChange(!checked)}
      className="focus-ring group flex w-full items-center justify-between gap-3 rounded-md py-1.5 text-left"
    >
      <span className="label transition-colors group-hover:text-white/75">
        {label}
        {shortcut ? <span className="ml-2 text-white/25">{shortcut}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className="relative inline-block h-[16px] w-[28px] shrink-0 rounded-full border transition-colors duration-200"
        style={{
          background: checked ? 'var(--accent-soft)' : 'rgba(255,255,255,0.06)',
          borderColor: checked ? 'var(--accent)' : 'rgba(255,255,255,0.14)',
          boxShadow: checked ? '0 0 14px -4px var(--accent-glow)' : 'none',
        }}
      >
        <span
          className="absolute top-[2px] left-[2px] h-[10px] w-[10px] rounded-full transition-transform duration-200"
          style={{
            transform: checked ? 'translateX(12px)' : 'translateX(0)',
            background: checked ? '#fff' : 'rgba(255,255,255,0.55)',
            transitionTimingFunction: 'var(--ease-spring)',
          }}
        />
      </span>
    </button>
  )
}
