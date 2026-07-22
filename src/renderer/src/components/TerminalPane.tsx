import { forwardRef, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import type { ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useAppStore } from '../store/useAppStore'
import type { AppTheme } from '../../../shared/types'

const SCROLLBACK_LINES = 10000

interface Props {
  terminalId: string
  terminalName: string
  visible: boolean
  isActive: boolean
  onHeaderDragStart: (terminalId: string) => void
  onHeaderDrop: (terminalId: string) => void
}

function statusDotClass(status: string | undefined): string {
  switch (status) {
    case 'working':
      return 'status-dot status-working'
    case 'waiting':
      return 'status-dot status-waiting'
    default:
      return 'status-dot status-idle'
  }
}

const PREVIEW_MAX_LENGTH = 160

// The 16 ANSI colors matter as much as background/foreground: Claude Code's own box-drawing
// and status text use them directly, and xterm's built-in defaults are tuned for dark
// backgrounds — on white (or a mismatched preset) they read as low-contrast/washed out
// without an explicit palette matching each theme.
const XTERM_THEMES: Record<AppTheme, ITheme> = {
  light: {
    background: '#ffffff',
    foreground: '#1c1e21',
    cursor: '#0f9d63',
    black: '#1c1e21',
    red: '#cf222e',
    green: '#1a7f37',
    yellow: '#9a6700',
    blue: '#0969da',
    magenta: '#8250df',
    cyan: '#1b7c83',
    white: '#6e7781',
    brightBlack: '#57606a',
    brightRed: '#a40e26',
    brightGreen: '#116329',
    brightYellow: '#4d2d00',
    brightBlue: '#0550ae',
    brightMagenta: '#6639ba',
    brightCyan: '#3192aa',
    brightWhite: '#1c1e21'
  },
  dark: {
    background: '#1c1e21',
    foreground: '#d4d4d4',
    cursor: '#4ee2a3',
    black: '#1c1e21',
    red: '#f85149',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#d4d4d4',
    brightBlack: '#6e7681',
    brightRed: '#ff7b72',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#f0f6fc'
  },
  dracula: {
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#50fa7b',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff'
  },
  nord: {
    background: '#2e3440',
    foreground: '#e5e9f0',
    cursor: '#88c0d0',
    black: '#3b4252',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0',
    brightBlack: '#4c566a',
    brightRed: '#bf616a',
    brightGreen: '#a3be8c',
    brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1',
    brightMagenta: '#b48ead',
    brightCyan: '#8fbcbb',
    brightWhite: '#eceff4'
  },
  solarized: {
    background: '#002b36',
    foreground: '#93a1a1',
    cursor: '#2aa198',
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5',
    brightBlack: '#002b36',
    brightRed: '#cb4b16',
    brightGreen: '#586e75',
    brightYellow: '#657b83',
    brightBlue: '#839496',
    brightMagenta: '#6c71c4',
    brightCyan: '#93a1a1',
    brightWhite: '#fdf6e3'
  }
}

function xtermThemeFor(theme: AppTheme): ITheme {
  return XTERM_THEMES[theme]
}

// xterm has already parsed away all ANSI/color codes into its buffer, so reading plain text
// back out of it is far more reliable than trying to strip escape sequences from raw PTY output.
function extractPreview(term: Terminal): string {
  const buffer = term.buffer.active
  const lines: string[] = []
  for (let i = buffer.length - 1; i >= 0 && lines.length < 3; i--) {
    const line = buffer.getLine(i)
    if (!line) continue
    const text = line.translateToString(true).trim()
    if (text.length === 0) continue
    lines.unshift(text)
  }
  const joined = lines.join('  ').replace(/\s+/g, ' ').trim()
  return joined.length > PREVIEW_MAX_LENGTH ? `${joined.slice(0, PREVIEW_MAX_LENGTH)}…` : joined
}

const TerminalPane = forwardRef<HTMLDivElement, Props>(function TerminalPane(
  { terminalId, terminalName, visible, isActive, onHeaderDragStart, onHeaderDrop },
  rootRef
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const startedRef = useRef(false)
  const rendererReadyRef = useRef(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const markPtyStarted = useAppStore((s) => s.markPtyStarted)
  const focusTerminal = useAppStore((s) => s.focusTerminal)
  const setPreview = useAppStore((s) => s.setPreview)
  const gitBranch = useAppStore((s) => s.gitBranches[terminalId])
  const status = useAppStore((s) => s.runtime[terminalId]?.status)
  const theme = useAppStore((s) => s.settings.theme)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      scrollback: SCROLLBACK_LINES,
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'Cascadia Code, Consolas, monospace',
      fontSize: 13,
      theme: xtermThemeFor(theme)
    })
    const fitAddon = new FitAddon()
    const searchAddon = new SearchAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(searchAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)

    // xterm routes real keyboard input through a hidden, zero-size <textarea> it manages
    // internally. It carries no ARIA semantics out of the box, so OS-level dictation tools
    // (Wispr Flow, Windows Voice Access, ...) that inject text via the accessibility tree's
    // text-input pattern often can't identify it as an editable field even while it has focus.
    // Explicitly marking it as a textbox is a best-effort fix — some tools also skip elements
    // with no visible bounding box, which this can't change without altering xterm's rendering.
    const helperTextarea = containerRef.current.querySelector('.xterm-helper-textarea')
    if (helperTextarea) {
      helperTextarea.setAttribute('role', 'textbox')
      helperTextarea.setAttribute('aria-multiline', 'true')
      helperTextarea.setAttribute('aria-label', 'Terminal input')
    }

    // xterm.js's own key handling maps Ctrl+V to the raw Unix "literal next character" control
    // byte (0x16) and calls preventDefault() on the keydown — which blocks the browser's native
    // paste (the ClipboardEvent) from ever firing, so xterm's own bracketed-paste text-wrapping
    // never runs. That's invisible in shells whose readline reads the OS clipboard itself on
    // Ctrl+V regardless (PowerShell's PSReadLine does), but breaks paste entirely in programs
    // that expect the terminal to actually deliver pasted text (e.g. Claude Code's UI). Returning
    // false here for Ctrl+V skips xterm's interception so the browser paste proceeds normally.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown' && event.ctrlKey && event.key.toLowerCase() === 'v') return false
      return true
    })

    termRef.current = term
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon

    // A hidden pane (display:none) reports a 0x0 box. Fitting/resizing xterm to 0 rows/cols
    // forces it to reflow (and lose) wrapped lines; when the pane becomes visible again the
    // reflow-back-up leaves stale/ghosted fragments behind — this, not the renderer, was the
    // cause of text appearing to "shift" while scrolling. Never fit while degenerate-sized.
    const safeFit = (): void => {
      const el = containerRef.current
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return
      try {
        fitAddon.fit()
        window.api.ptyResize(terminalId, term.cols, term.rows)
      } catch {
        // ignore transient resize errors
      }
    }

    // xterm's internal renderer finishes initializing on the next animation frame after
    // open(); calling fit() (or reading cols/rows) synchronously right after open() can
    // throw inside xterm before that renderer is ready.
    const rafId = requestAnimationFrame(() => {
      rendererReadyRef.current = true
      safeFit()

      if (!startedRef.current) {
        startedRef.current = true
        void window.api.ptyStart(terminalId, term.cols, term.rows).then(() => markPtyStarted(terminalId))
      }
    })

    const dataDispose = term.onData((data) => {
      window.api.ptyInput(terminalId, data)
    })

    let previewTimer: ReturnType<typeof setTimeout> | null = null
    const unsubscribePtyData = window.api.onPtyData((id, data) => {
      if (id !== terminalId) return
      term.write(data)
      if (previewTimer) clearTimeout(previewTimer)
      previewTimer = setTimeout(() => setPreview(terminalId, extractPreview(term)), 500)
    })

    // The green "active" ring should follow real keyboard focus, not just the last sidebar
    // click — typing directly into a pinned-but-inactive pane should make it the active one.
    // xterm.js exposes no focus event on the Terminal itself; 'focusin' bubbles from its
    // internal hidden textarea, unlike the non-bubbling native 'focus' event.
    const focusHandler = (): void => focusTerminal(terminalId)
    containerRef.current.addEventListener('focusin', focusHandler)

    const resizeObserver = new ResizeObserver(() => safeFit())
    resizeObserver.observe(containerRef.current)

    const keydownHandler = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    containerRef.current.addEventListener('keydown', keydownHandler)

    return () => {
      cancelAnimationFrame(rafId)
      rendererReadyRef.current = false
      if (previewTimer) clearTimeout(previewTimer)
      dataDispose.dispose()
      unsubscribePtyData()
      resizeObserver.disconnect()
      containerRef.current?.removeEventListener('keydown', keydownHandler)
      containerRef.current?.removeEventListener('focusin', focusHandler)
      term.dispose()
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId])

  useEffect(() => {
    // Skip while the renderer isn't ready yet (e.g. the very first run right after mount) —
    // the constructor already received the correct theme; setting options.theme before xterm's
    // internal renderer initializes can throw, same as fitting/resizing too early.
    if (!termRef.current || !rendererReadyRef.current) return
    termRef.current.options.theme = xtermThemeFor(theme)
  }, [theme])

  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => {
        const el = containerRef.current
        if (el && el.clientWidth > 0 && el.clientHeight > 0) {
          try {
            fitAddonRef.current?.fit()
          } catch {
            // ignore
          }
        }
        // Only steal focus (and, via the focusin handler above, active status) when this pane
        // is actually the active one. Pinning a second pane makes it visible without making it
        // active — auto-focusing it here would immediately flip active back to it and hide the
        // pane that's supposed to stay active, defeating the pin.
        if (isActive) termRef.current?.focus()
      })
    }
  }, [visible, isActive])

  return (
    <div
      ref={rootRef}
      className={`terminal-pane${isActive ? ' pane-active' : ''}`}
      style={{ display: visible ? 'flex' : 'none' }}
    >
      <div
        className="terminal-pane-header"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          onHeaderDragStart(terminalId)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          onHeaderDrop(terminalId)
        }}
        title="Drag to rearrange"
      >
        <span className={statusDotClass(status)} />
        <span className="terminal-pane-title">{terminalName}</span>
        {gitBranch && <span className="terminal-pane-branch">⎇ {gitBranch}</span>}
      </div>
      {searchOpen && (
        <div className="terminal-search-bar">
          <input
            autoFocus
            value={searchQuery}
            placeholder="Search terminal…"
            onChange={(e) => {
              setSearchQuery(e.target.value)
              searchAddonRef.current?.findNext(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') searchAddonRef.current?.findNext(searchQuery)
              if (e.key === 'Escape') setSearchOpen(false)
            }}
          />
          <button onClick={() => searchAddonRef.current?.findPrevious(searchQuery)}>Prev</button>
          <button onClick={() => searchAddonRef.current?.findNext(searchQuery)}>Next</button>
          <button onClick={() => setSearchOpen(false)}>✕</button>
        </div>
      )}
      <div className="terminal-container" ref={containerRef} tabIndex={0} />
    </div>
  )
})

export default TerminalPane
