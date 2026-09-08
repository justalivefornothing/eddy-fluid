import { FluidCanvas } from './ui/FluidCanvas'
import { GpuFallback, Hint, Hud, PanelToggle, Toast } from './ui/Overlays'
import { Panel } from './ui/Panel'
import { useAccentSync, useShortcuts } from './ui/useShortcuts'

export default function App() {
  useShortcuts()
  useAccentSync()
  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-white select-none">
      <FluidCanvas />
      <Hud />
      <Hint />
      <PanelToggle />
      <Panel />
      <Toast />
      <GpuFallback />
    </main>
  )
}
