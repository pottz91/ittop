import { describe, expect, it } from 'vitest'
import { containsAttentionOsc } from '../osc'

const ESC = '\x1b'
const BEL = '\x07'

describe('containsAttentionOsc', () => {
  it('returns false for plain text with no escape sequences', () => {
    expect(containsAttentionOsc('hello world\n')).toBe(false)
  })

  it('detects an OSC 9 notification', () => {
    expect(containsAttentionOsc(`${ESC}]9;build finished${BEL}`)).toBe(true)
  })

  it('detects an OSC 777 notify sequence', () => {
    expect(containsAttentionOsc(`${ESC}]777;notify;Title;Body${BEL}`)).toBe(true)
  })

  it('ignores OSC 777 sequences that are not a notify subcommand', () => {
    expect(containsAttentionOsc(`${ESC}]777;other;Title;Body${BEL}`)).toBe(false)
  })

  it('ignores unrelated OSC codes such as window-title (OSC 0/2)', () => {
    expect(containsAttentionOsc(`${ESC}]0;my terminal title${BEL}`)).toBe(false)
  })

  it('finds an attention OSC embedded in a larger chunk of output', () => {
    const chunk = `some output\n${ESC}]9;done${BEL}\nmore output`
    expect(containsAttentionOsc(chunk)).toBe(true)
  })

  it('supports the ST (ESC \\\\) terminator as well as BEL', () => {
    expect(containsAttentionOsc(`${ESC}]9;done${ESC}\\`)).toBe(true)
  })
})
