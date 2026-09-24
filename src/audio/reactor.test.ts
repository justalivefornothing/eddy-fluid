import { afterEach, describe, expect, it, vi } from 'vitest'
import { AudioReactor } from './reactor'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function mockStream() {
  const stop = vi.fn()
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream
  return { stream, stop }
}

function mockAudio() {
  const analyser = {
    fftSize: 0,
    frequencyBinCount: 512,
    smoothingTimeConstant: 0,
    disconnect: vi.fn(),
    getByteFrequencyData: vi.fn(),
  }
  const context = {
    state: 'running',
    sampleRate: 48_000,
    createAnalyser: vi.fn(() => analyser),
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  }
  const construct = vi.fn(function () { return context })
  const getUserMedia = vi.fn<() => Promise<MediaStream>>()
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal('AudioContext', construct)
  return { analyser, context, construct, getUserMedia }
}

afterEach(() => vi.unstubAllGlobals())

describe('AudioReactor lifecycle (mock devices only)', () => {
  it('starts once and releases all owned resources on stop', async () => {
    const mock = mockAudio()
    const media = mockStream()
    mock.getUserMedia.mockResolvedValue(media.stream)
    const reactor = new AudioReactor()

    expect(await reactor.start()).toBe(true)
    expect(reactor.active).toBe(true)
    expect(await reactor.start()).toBe(true)
    expect(mock.getUserMedia).toHaveBeenCalledTimes(1)
    expect(mock.analyser.fftSize).toBe(1024)
    reactor.stop()
    reactor.stop()
    expect(reactor.active).toBe(false)
    expect(reactor.sample(0)).toBeNull()
    expect(media.stop).toHaveBeenCalledTimes(1)
    expect(mock.analyser.disconnect).toHaveBeenCalledTimes(1)
    expect(mock.context.close).toHaveBeenCalledTimes(1)
  })

  it('disposes a late permission grant after cancellation without creating a context', async () => {
    const mock = mockAudio()
    const grant = deferred<MediaStream>()
    const media = mockStream()
    mock.getUserMedia.mockReturnValue(grant.promise)
    const reactor = new AudioReactor()
    const starting = reactor.start()

    reactor.stop()
    grant.resolve(media.stream)
    expect(await starting).toBe(false)
    expect(reactor.active).toBe(false)
    expect(media.stop).toHaveBeenCalledTimes(1)
    expect(mock.construct).not.toHaveBeenCalled()
  })

  it('treats a late permission rejection as cancellation', async () => {
    const mock = mockAudio()
    const grant = deferred<MediaStream>()
    mock.getUserMedia.mockReturnValue(grant.promise)
    const reactor = new AudioReactor()
    const starting = reactor.start()

    reactor.stop()
    grant.reject(new Error('permission denied'))
    expect(await starting).toBe(false)
    expect(reactor.active).toBe(false)
  })

  it('disposes a superseded grant without stopping the new session', async () => {
    const mock = mockAudio()
    const oldGrant = deferred<MediaStream>()
    const oldMedia = mockStream()
    const newMedia = mockStream()
    mock.getUserMedia.mockReturnValueOnce(oldGrant.promise).mockResolvedValueOnce(newMedia.stream)
    const reactor = new AudioReactor()
    const oldStart = reactor.start()

    expect(await reactor.start()).toBe(true)
    oldGrant.resolve(oldMedia.stream)
    expect(await oldStart).toBe(false)
    expect(reactor.active).toBe(true)
    expect(oldMedia.stop).toHaveBeenCalledTimes(1)
    expect(newMedia.stop).not.toHaveBeenCalled()
    reactor.stop()
  })

  it('ignores an obsolete rejection while a new session is active', async () => {
    const mock = mockAudio()
    const oldGrant = deferred<MediaStream>()
    const media = mockStream()
    mock.getUserMedia.mockReturnValueOnce(oldGrant.promise).mockResolvedValueOnce(media.stream)
    const reactor = new AudioReactor()
    const oldStart = reactor.start()

    expect(await reactor.start()).toBe(true)
    oldGrant.reject(new Error('old request denied'))
    expect(await oldStart).toBe(false)
    expect(reactor.active).toBe(true)
    expect(media.stop).not.toHaveBeenCalled()
    reactor.stop()
  })

  it('releases a granted stream when AudioContext construction fails', async () => {
    const mock = mockAudio()
    const media = mockStream()
    mock.getUserMedia.mockResolvedValue(media.stream)
    mock.construct.mockImplementation(() => { throw new Error('context unavailable') })
    const reactor = new AudioReactor()

    await expect(reactor.start()).rejects.toThrow('context unavailable')
    expect(media.stop).toHaveBeenCalledTimes(1)
    expect(reactor.active).toBe(false)
  })

  it('cleans up partial initialization when analyser creation fails', async () => {
    const mock = mockAudio()
    const media = mockStream()
    mock.getUserMedia.mockResolvedValue(media.stream)
    mock.context.createAnalyser.mockImplementation(() => { throw new Error('analyser unavailable') })
    const reactor = new AudioReactor()

    await expect(reactor.start()).rejects.toThrow('analyser unavailable')
    expect(media.stop).toHaveBeenCalledTimes(1)
    expect(mock.context.close).toHaveBeenCalledTimes(1)
    expect(reactor.active).toBe(false)
  })

  it('cleans up a failed context resume', async () => {
    const mock = mockAudio()
    const media = mockStream()
    mock.getUserMedia.mockResolvedValue(media.stream)
    mock.context.state = 'suspended'
    mock.context.resume.mockRejectedValue(new Error('resume failed'))
    const reactor = new AudioReactor()

    await expect(reactor.start()).rejects.toThrow('resume failed')
    expect(media.stop).toHaveBeenCalledTimes(1)
    expect(mock.analyser.disconnect).toHaveBeenCalledTimes(1)
    expect(mock.context.close).toHaveBeenCalledTimes(1)
    expect(reactor.active).toBe(false)
  })

  it('stops capture immediately while context resume is pending', async () => {
    const mock = mockAudio()
    const resume = deferred<void>()
    const media = mockStream()
    mock.getUserMedia.mockResolvedValue(media.stream)
    mock.context.state = 'suspended'
    mock.context.resume.mockReturnValue(resume.promise)
    const reactor = new AudioReactor()
    const starting = reactor.start()
    await Promise.resolve()
    expect(mock.context.resume).toHaveBeenCalledTimes(1)
    expect(reactor.active).toBe(false)

    reactor.stop()
    expect(media.stop).toHaveBeenCalledTimes(1)
    expect(mock.context.close).toHaveBeenCalledTimes(1)
    resume.resolve()
    expect(await starting).toBe(false)
    expect(reactor.active).toBe(false)
    expect(media.stop).toHaveBeenCalledTimes(1)
  })

  it('reports an uncanceled permission failure to the caller', async () => {
    const mock = mockAudio()
    mock.getUserMedia.mockRejectedValue(new Error('permission denied'))
    const reactor = new AudioReactor()

    await expect(reactor.start()).rejects.toThrow('permission denied')
    expect(reactor.active).toBe(false)
    expect(mock.construct).not.toHaveBeenCalled()
  })
})
