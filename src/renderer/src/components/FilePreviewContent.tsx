import { useEffect, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

interface Props {
  path: string
}

type FileState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'binary' }
  | { status: 'ready'; content: string; truncated: boolean }

export function fileName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function extensionOf(path: string): string {
  const name = fileName(path)
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

export function isMarkdownFile(path: string): boolean {
  return ['md', 'markdown'].includes(extensionOf(path))
}

export function isHtmlFile(path: string): boolean {
  return ['html', 'htm'].includes(extensionOf(path))
}

export default function FilePreviewContent({ path }: Props): React.JSX.Element {
  const [fileState, setFileState] = useState<FileState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setFileState({ status: 'loading' })
    window.api.readFile(path).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setFileState(
          result.reason === 'binary'
            ? { status: 'binary' }
            : { status: 'error', message: result.message ?? 'Could not read file.' }
        )
        return
      }
      setFileState({ status: 'ready', content: result.content, truncated: result.truncated })
    })
    return () => {
      cancelled = true
    }
  }, [path])

  return (
    <div className="file-preview">
      {fileState.status === 'loading' && <div className="file-tree-hint">Loading…</div>}
      {fileState.status === 'error' && <div className="file-tree-hint">{fileState.message}</div>}
      {fileState.status === 'binary' && <div className="file-tree-hint">Binary file — no preview available.</div>}
      {fileState.status === 'ready' && (
        <>
          {fileState.truncated && <div className="file-tree-hint">Showing the first part of a large file.</div>}
          {isMarkdownFile(path) ? (
            <div
              className="file-preview-markdown"
              // Sanitized below — marked only converts Markdown syntax to HTML, it doesn't vet
              // the *raw* HTML a file can already contain, and DOMPurify strips scripts and
              // other unsafe markup before this ever reaches the DOM.
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(marked.parse(fileState.content, { async: false }))
              }}
            />
          ) : isHtmlFile(path) ? (
            // Fully sandboxed: no scripts, no same-origin access, no forms/popups — this is a
            // visual "what would this page look like" preview only, not a live webpage.
            <iframe className="file-preview-html" sandbox="" srcDoc={fileState.content} title={fileName(path)} />
          ) : (
            <pre className="file-preview-content">{fileState.content}</pre>
          )}
        </>
      )}
    </div>
  )
}
