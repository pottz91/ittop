import { useEffect } from 'react'
import FilePreviewContent, { fileName } from './FilePreviewContent'

interface Props {
  path: string
}

export default function PreviewWindow({ path }: Props): React.JSX.Element {
  useEffect(() => {
    void window.api.getSettings().then((settings) => {
      document.documentElement.dataset.theme = settings.theme
    })
    document.title = `${fileName(path)}: ittop`
  }, [path])

  return (
    <div className="preview-window">
      <div className="file-panel-header">
        <span className="file-panel-title">{fileName(path)}</span>
      </div>
      <FilePreviewContent path={path} />
    </div>
  )
}
