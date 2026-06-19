import { Buffer } from 'buffer'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Polyfill Buffer + process for bip39 (seed-phrase wallet import) in the browser.
const g = globalThis as { Buffer?: unknown; process?: unknown }
if (!g.Buffer) g.Buffer = Buffer
if (!g.process) {
  g.process = { env: {}, browser: true, version: '', nextTick: (fn: () => void) => setTimeout(fn, 0) }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
