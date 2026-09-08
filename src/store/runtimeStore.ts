import { create } from 'zustand'

/**
 * Frame statistics published by the render loop a few times a second (never
 * every frame, so the HUD does not re-render at 60 Hz).
 */
export interface FrameStats {
  fps: number
  frameMs: number
  simWidth: number
  simHeight: number
  dyeWidth: number
  dyeHeight: number
  drawCalls: number
  formatLabel: string
}

export const EMPTY_STATS: FrameStats = {
  fps: 0,
  frameMs: 0,
  simWidth: 0,
  simHeight: 0,
  dyeWidth: 0,
  dyeHeight: 0,
  drawCalls: 0,
  formatLabel: '',
}

/** Imperative commands the panel can send to the running simulation. */
export interface SimHandle {
  randomSplats: (count?: number) => void
  clear: () => void
  screenshot: () => Promise<void>
  /** Start/stop the microphone-driven splats. Resolves once the state settled. */
  toggleAudio: () => Promise<void>
}

export type GpuStatus = 'pending' | 'ready' | 'unsupported' | 'error'
export type AudioStatus = 'off' | 'starting' | 'on' | 'denied' | 'unsupported'

interface RuntimeState {
  stats: FrameStats
  handle: SimHandle | null
  gpuStatus: GpuStatus
  gpuError: string | null
  toast: string | null
  audioStatus: AudioStatus
  setAudioStatus: (status: AudioStatus) => void
  setStats: (stats: FrameStats) => void
  setHandle: (handle: SimHandle | null) => void
  setGpuStatus: (status: GpuStatus, error?: string | null) => void
  showToast: (message: string) => void
  clearToast: () => void
}

export const useRuntime = create<RuntimeState>()((set) => ({
  stats: EMPTY_STATS,
  handle: null,
  gpuStatus: 'pending',
  gpuError: null,
  toast: null,
  audioStatus: 'off',
  setAudioStatus: (audioStatus) => set({ audioStatus }),
  setStats: (stats) => set({ stats }),
  setHandle: (handle) => set({ handle }),
  setGpuStatus: (gpuStatus, gpuError = null) => set({ gpuStatus, gpuError }),
  showToast: (toast) => set({ toast }),
  clearToast: () => set({ toast: null }),
}))
