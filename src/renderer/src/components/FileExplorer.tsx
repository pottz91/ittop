import { useEffect, useMemo, useRef, useState } from 'react'
import type { FileEntry } from '../../../shared/types'
import { useAppStore } from '../store/useAppStore'
import FilePreviewContent, { fileName } from './FilePreviewContent'
import FileIcon from './FileIcon'

interface Props {
  onClose: () => void
}

type DirState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; entries: FileEntry[] }

function TreeNode({
  entry,
  depth,
  expanded,
  dirs,
  onToggle,
  onSelectFile,
  selectedPath
}: {
  entry: FileEntry
  depth: number
  expanded: Set<string>
  dirs: Record<string, DirState>
  onToggle: (path: string) => void
  onSelectFile: (path: string) => void
  selectedPath: string | null
}): React.JSX.Element {
  const isOpen = entry.isDirectory && expanded.has(entry.path)
  const dirState = dirs[entry.path]
  return (
    <div>
      <div
        className={`file-tree-row${selectedPath === entry.path ? ' selected' : ''}`}
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => (entry.isDirectory ? onToggle(entry.path) : onSelectFile(entry.path))}
      >
        <span className="file-tree-chevron">{entry.isDirectory ? (isOpen ? '▾' : '▸') : ''}</span>
        <span className="file-tree-icon">
          <FileIcon name={entry.name} isDirectory={entry.isDirectory} isOpen={isOpen} />
        </span>
        <span className="file-tree-name">{entry.name}</span>
      </div>
      {isOpen && dirState?.status === 'loading' && (
        <div className="file-tree-hint" style={{ paddingLeft: 24 + depth * 14 }}>
          Loading…
        </div>
      )}
      {isOpen && dirState?.status === 'error' && (
        <div className="file-tree-hint" style={{ paddingLeft: 24 + depth * 14 }}>
          {dirState.message}
        </div>
      )}
      {isOpen && dirState?.status === 'ready' && dirState.entries.length === 0 && (
        <div className="file-tree-hint" style={{ paddingLeft: 24 + depth * 14 }}>
          Empty
        </div>
      )}
      {isOpen &&
        dirState?.status === 'ready' &&
        dirState.entries.map((child) => (
          <TreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            expanded={expanded}
            dirs={dirs}
            onToggle={onToggle}
            onSelectFile={onSelectFile}
            selectedPath={selectedPath}
          />
        ))}
    </div>
  )
}

export default function FileExplorer({ onClose }: Props): React.JSX.Element {
  const focusedTerminalId = useAppStore((s) => s.focusedTerminalId)
  const workspaces = useAppStore((s) => s.workspaces)
  const filePanelWidth = useAppStore((s) => s.settings.filePanelWidth)
  const setFilePanelWidth = useAppStore((s) => s.setFilePanelWidth)
  const terminal = useMemo(
    () => workspaces.flatMap((w) => w.terminals).find((t) => t.id === focusedTerminalId) ?? null,
    [workspaces, focusedTerminalId]
  )
  const rootPath = terminal?.projectPath ?? null

  const [dirs, setDirs] = useState<Record<string, DirState>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const resizingRef = useRef(false)

  async function loadDir(path: string): Promise<void> {
    setDirs((prev) => ({ ...prev, [path]: { status: 'loading' } }))
    const result = await window.api.listDir(path)
    setDirs((prev) => ({
      ...prev,
      [path]: result.ok ? { status: 'ready', entries: result.entries } : { status: 'error', message: result.message }
    }))
  }

  useEffect(() => {
    setDirs({})
    setExpanded(new Set())
    setSelectedPath(null)
    if (rootPath) void loadDir(rootPath)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPath])

  function toggleDir(path: string): void {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
        if (!dirs[path]) void loadDir(path)
      }
      return next
    })
  }

  function startResize(e: React.MouseEvent): void {
    e.preventDefault()
    resizingRef.current = true
    const onMove = (moveEvent: MouseEvent): void => {
      if (!resizingRef.current) return
      const width = Math.min(Math.max(window.innerWidth - moveEvent.clientX, 220), 800)
      setFilePanelWidth(width)
    }
    const onUp = (): void => {
      resizingRef.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const rootEntries = rootPath ? dirs[rootPath] : undefined

  return (
    <div className="file-panel" style={{ width: filePanelWidth }}>
      <div className="file-panel-resizer" onMouseDown={startResize} />
      <div className="file-panel-header">
        {selectedPath ? (
          <button className="file-panel-back" onClick={() => setSelectedPath(null)} title="Back to tree">
            ← {fileName(selectedPath)}
          </button>
        ) : (
          <span className="file-panel-title">{terminal ? terminal.name : 'Files'}</span>
        )}
        <div className="file-panel-header-actions">
          {selectedPath && (
            <button
              className="icon-button small"
              title="Open in a separate window"
              onClick={() => void window.api.openFilePreviewWindow(selectedPath)}
            >
              ⤢
            </button>
          )}
          <button className="icon-button small" title="Close" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>
      {!terminal && (
        <div className="file-tree-hint" style={{ padding: 12 }}>
          No terminal focused.
        </div>
      )}
      {terminal && !selectedPath && (
        <div className="file-tree">
          {rootEntries?.status === 'loading' && <div className="file-tree-hint">Loading…</div>}
          {rootEntries?.status === 'error' && <div className="file-tree-hint">{rootEntries.message}</div>}
          {rootEntries?.status === 'ready' &&
            rootEntries.entries.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                expanded={expanded}
                dirs={dirs}
                onToggle={toggleDir}
                onSelectFile={(p) => setSelectedPath(p)}
                selectedPath={selectedPath}
              />
            ))}
        </div>
      )}
      {terminal && selectedPath && <FilePreviewContent path={selectedPath} />}
    </div>
  )
}
