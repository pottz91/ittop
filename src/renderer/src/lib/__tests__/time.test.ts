import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from '../time'

describe('formatRelativeTime', () => {
  const now = 1_000_000

  it('shows "just now" for anything under 10 seconds', () => {
    expect(formatRelativeTime(now - 3_000, now)).toBe('just now')
  })

  it('shows seconds between 10s and 1 minute', () => {
    expect(formatRelativeTime(now - 45_000, now)).toBe('45s ago')
  })

  it('shows minutes between 1 minute and 1 hour', () => {
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5m ago')
  })

  it('shows hours between 1 hour and 1 day', () => {
    expect(formatRelativeTime(now - 3 * 60 * 60_000, now)).toBe('3h ago')
  })

  it('shows days beyond 24 hours', () => {
    expect(formatRelativeTime(now - 2 * 24 * 60 * 60_000, now)).toBe('2d ago')
  })

  it('clamps future timestamps to "just now" instead of a negative duration', () => {
    expect(formatRelativeTime(now + 5_000, now)).toBe('just now')
  })
})
