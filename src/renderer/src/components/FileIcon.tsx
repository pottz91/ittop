// Small, self-authored icon set (no external icon package) — single-color line icons matching
// the app's minimalist monospace aesthetic, picked by extension/category rather than trying to
// cover every possible file type individually.
const CODE_EXT = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'cs', 'php'])
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'])
const CONFIG_EXT = new Set(['yml', 'yaml', 'toml', 'ini', 'env', 'conf', 'cfg'])

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

interface Props {
  name: string
  isDirectory: boolean
  isOpen?: boolean
}

export default function FileIcon({ name, isDirectory, isOpen }: Props): React.JSX.Element {
  if (isDirectory) {
    return isOpen ? (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3">
        <path d="M1.5 4.5h4l1.2 1.5H14v1.5H2.2z" />
        <path d="M1.5 6h12.8l-1.6 6.5h-11z" />
      </svg>
    ) : (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3">
        <path d="M1.5 3.5h4.2l1.3 1.5h7.5v7h-13z" />
      </svg>
    )
  }

  if (name === '.gitignore' || name === '.gitattributes' || name.startsWith('.git')) {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3">
        <circle cx="8" cy="8" r="1.4" />
        <path d="M8 1.5v3.4M8 11v3.5M1.5 8h3.4M11 8h3.5" />
      </svg>
    )
  }

  const ext = extensionOf(name)

  if (ext === 'md' || ext === 'markdown') {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3">
        <rect x="1.5" y="3" width="13" height="10" rx="1" />
        <path d="M4 10.5V5.5l2 2.5 2-2.5v5M11 5.5v3.5M9.3 7.5 11 9.3l1.7-1.8" />
      </svg>
    )
  }

  if (ext === 'json') {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3">
        <path d="M5 2.5c-1.5 0-1.5 1.5-1.5 3s0 2-1.5 2.5c1.5.5 1.5 1 1.5 2.5s0 3 1.5 3" />
        <path d="M11 2.5c1.5 0 1.5 1.5 1.5 3s0 2 1.5 2.5c-1.5.5-1.5 1-1.5 2.5s0 3-1.5 3" />
      </svg>
    )
  }

  if (ext === 'html' || ext === 'htm') {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3">
        <path d="M2.5 2h11l-1 10.5L8 14l-4.5-1.5z" />
        <path d="M5.2 4.8h5.6l-.3 3.2H6l.15 1.6L8 10.1l1.85-.5.15-1.6" />
      </svg>
    )
  }

  if (ext === 'css' || ext === 'scss' || ext === 'sass' || ext === 'less') {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3">
        <path d="M2.5 2h11l-1 10.5L8 14l-4.5-1.5z" />
        <path d="M10.8 4.8H5.2l.2 1.8h5.1l-.25 2.6L8 10l-2.05-.55-.15-1.3" />
      </svg>
    )
  }

  if (IMAGE_EXT.has(ext)) {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3">
        <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
        <circle cx="6" cy="6.5" r="1.2" />
        <path d="M2 12.5 6 8.5l2.5 2.5L11 8l3.5 4.5" />
      </svg>
    )
  }

  if (CONFIG_EXT.has(ext)) {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3">
        <circle cx="8" cy="8" r="2" />
        <path d="M8 2v1.6M8 12.4V14M14 8h-1.6M3.6 8H2M12.1 3.9l-1.1 1.1M5 9.9l-1.1 1.1M12.1 12.1l-1.1-1.1M5 6.1 3.9 5" />
      </svg>
    )
  }

  if (CODE_EXT.has(ext)) {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3">
        <path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M4 1.5h5.5L12 4v10.5H4z" />
      <path d="M9.5 1.5V4H12" />
    </svg>
  )
}
