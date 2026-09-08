import { useEffect, useRef, useState } from 'react'
import { BUILT_IN_PRESET_LIST, isBuiltInPresetId } from '../../core/presets'
import { useRuntime } from '../../store/runtimeStore'
import { selectActivePreset, selectIsDirty, useSettings } from '../../store/settingsStore'

type Mode = 'idle' | 'saving' | 'renaming'

/** Built-in + user presets as chips, with inline save / rename / delete. */
export function PresetSection() {
  const activePresetId = useSettings((s) => s.activePresetId)
  const userPresets = useSettings((s) => s.userPresets)
  const isDirty = useSettings(selectIsDirty)
  const active = useSettings(selectActivePreset)
  const { applyPreset, saveUserPreset, renameUserPreset, deleteUserPreset, updateUserPreset } = useSettings.getState()
  const showToast = useRuntime((s) => s.showToast)

  const [mode, setMode] = useState<Mode>('idle')
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode !== 'idle') inputRef.current?.select()
  }, [mode])

  const activeIsUser = !!activePresetId && !isBuiltInPresetId(activePresetId)

  const commit = () => {
    if (mode === 'saving') {
      const preset = saveUserPreset(draft || 'Untitled')
      showToast(`Saved preset “${preset.name}”`)
    } else if (mode === 'renaming' && activePresetId) {
      renameUserPreset(activePresetId, draft)
    }
    setMode('idle')
    setDraft('')
  }

  const beginSave = () => {
    setDraft(active ? `${active.name} ${isDirty ? 'edit' : 'copy'}` : 'My preset')
    setMode('saving')
  }
  const beginRename = () => {
    setDraft(active?.name ?? '')
    setMode('renaming')
  }
  const remove = () => {
    if (!activePresetId || !active) return
    deleteUserPreset(activePresetId)
    showToast(`Deleted “${active.name}”`)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Built-in presets">
        {BUILT_IN_PRESET_LIST.map((p) => (
          <button
            key={p.id}
            type="button"
            className="chip focus-ring"
            data-active={activePresetId === p.id}
            aria-pressed={activePresetId === p.id}
            onClick={() => applyPreset(p.id)}
          >
            {p.name}
            {activePresetId === p.id && isDirty ? <span className="ml-1 text-white/45">*</span> : null}
          </button>
        ))}
      </div>

      {userPresets.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Your presets">
          {userPresets.map((p) => (
            <button
              key={p.id}
              type="button"
              className="chip focus-ring"
              data-active={activePresetId === p.id}
              aria-pressed={activePresetId === p.id}
              onClick={() => applyPreset(p.id)}
              title="Your preset"
            >
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: 'var(--accent)' }} aria-hidden="true" />
              {p.name}
              {activePresetId === p.id && isDirty ? <span className="ml-1 text-white/45">*</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn btn-accent focus-ring !py-1.5 !text-[11px]" onClick={beginSave}>
            save as new
          </button>
          {activeIsUser ? (
            <>
              <button type="button" className="btn focus-ring !py-1.5 !text-[11px]" onClick={() => updateUserPreset(activePresetId)} disabled={!isDirty} title={isDirty ? 'Overwrite this preset with the current settings' : 'No changes to save'} style={{ opacity: isDirty ? 1 : 0.45 }}>
                update
              </button>
              <button type="button" className="btn focus-ring !py-1.5 !text-[11px]" onClick={beginRename}>
                rename
              </button>
              <button type="button" className="btn focus-ring !py-1.5 !text-[11px] hover:!border-red-400/50 hover:!text-red-200" onClick={remove}>
                delete
              </button>
            </>
          ) : null}
        </div>
      ) : (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            commit()
          }}
        >
          <input
            ref={inputRef}
            className="text-input"
            value={draft}
            maxLength={40}
            placeholder="Preset name"
            aria-label={mode === 'saving' ? 'New preset name' : 'Rename preset'}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setMode('idle')
              }
            }}
          />
          <button type="submit" className="btn btn-accent focus-ring !py-1.5 !text-[11px]">
            {mode === 'saving' ? 'save' : 'ok'}
          </button>
          <button type="button" className="btn focus-ring !py-1.5 !text-[11px]" onClick={() => setMode('idle')}>
            cancel
          </button>
        </form>
      )}
    </div>
  )
}
