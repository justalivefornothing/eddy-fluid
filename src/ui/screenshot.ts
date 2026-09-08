import type { CaptureResult } from '../gl/simulation'

export function screenshotFilename(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `eddy-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.png`
}

/** Turn a read-back RGBA buffer into a PNG download via a 2-D canvas. */
export async function downloadCapture(capture: CaptureResult): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = capture.width
  canvas.height = capture.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable for PNG encoding')
  ctx.putImageData(new ImageData(capture.pixels, capture.width, capture.height), 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('PNG encoding failed')
  const name = screenshotFilename()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  return name
}
