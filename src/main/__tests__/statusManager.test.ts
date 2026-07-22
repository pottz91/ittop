import { describe, expect, it, vi } from 'vitest'
import { StatusManager } from '../statusManager'

describe('StatusManager', () => {
  it('defaults an unknown workspace to idle', () => {
    const sm = new StatusManager()
    expect(sm.get('unknown')).toBe('idle')
  })

  it('markWaiting/markIdle/markLikelyWorking set the expected status', () => {
    const sm = new StatusManager()
    sm.markWaiting('a')
    expect(sm.get('a')).toBe('waiting')
    sm.markIdle('a')
    expect(sm.get('a')).toBe('idle')
    sm.markLikelyWorking('a')
    expect(sm.get('a')).toBe('working')
  })

  it('notifies listeners only when the status actually changes', () => {
    const sm = new StatusManager()
    const listener = vi.fn()
    sm.onChange(listener)

    sm.set('a', 'working')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('a', 'working')

    sm.set('a', 'working')
    expect(listener).toHaveBeenCalledTimes(1)

    sm.set('a', 'idle')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('markLikelyWorking is a no-op while already working (avoids redundant notifications)', () => {
    const sm = new StatusManager()
    const listener = vi.fn()
    sm.markLikelyWorking('a')
    sm.onChange(listener)
    sm.markLikelyWorking('a')
    expect(listener).not.toHaveBeenCalled()
  })

  it('stops notifying after unsubscribe', () => {
    const sm = new StatusManager()
    const listener = vi.fn()
    const unsubscribe = sm.onChange(listener)
    unsubscribe()
    sm.set('a', 'working')
    expect(listener).not.toHaveBeenCalled()
  })

  it('remove() resets a workspace back to the default idle status', () => {
    const sm = new StatusManager()
    sm.markWaiting('a')
    sm.remove('a')
    expect(sm.get('a')).toBe('idle')
  })
})
