const ESC = '\x1b'

/**
 * Scans a raw PTY output chunk for OSC 9 (iTerm2/Growl) and OSC 777 (notify-send style)
 * notification escape sequences. These are commonly emitted by shell wrappers / tools to
 * signal "needs attention" and are used here as one of two parallel status-detection paths
 * (the other being the Claude Code hooks HTTP endpoint).
 *
 * OSC 9   : ESC ] 9 ; <message> BEL
 * OSC 777 : ESC ] 777 ; notify ; <title> ; <body> (BEL | ESC \\)
 */
export function containsAttentionOsc(chunk: string): boolean {
  if (!chunk.includes(`${ESC}]`)) return false

  const oscRegex = /\x1b\](\d+);([^\x07\x1b]*?)(?:\x07|\x1b\\)/g
  let match: RegExpExecArray | null
  while ((match = oscRegex.exec(chunk)) !== null) {
    const code = match[1]
    const body = match[2] ?? ''
    if (code === '9') return true
    if (code === '777' && body.toLowerCase().startsWith('notify')) return true
  }
  return false
}
