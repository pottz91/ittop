import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PreviewWindow from './components/PreviewWindow'
import './styles.css'

const previewPath = new URLSearchParams(window.location.search).get('preview')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{previewPath ? <PreviewWindow path={previewPath} /> : <App />}</React.StrictMode>
)
