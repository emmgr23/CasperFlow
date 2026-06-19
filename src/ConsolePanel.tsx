import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getDebugLog, subscribeRuntime, clearDebugLog } from './runtime'
import Icon from './Icon'

// A docked bottom console (VS Code / Xcode style) that streams EVERYTHING in
// real time: execution-log events, agent lifecycle, AI / Casper / wallet calls,
// plus captured console.warn/error and uncaught errors. Resize by dragging the
// top edge. Spans the canvas area (between the palette and the execution log).
export default function ConsolePanel({
  onClose,
  leftOffset = 0,
  rightOffset = 0,
  height,
  onHeightChange,
  centerSlot,
}: {
  onClose: () => void
  leftOffset?: number
  rightOffset?: number
  height: number
  onHeightChange: (h: number) => void
  centerSlot?: ReactNode
}) {
  const [, force] = useState(0)
  const [paused, setPaused] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => subscribeRuntime(() => force((n) => n + 1)), [])

  useEffect(() => {
    if (paused) return
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  })

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = height
    const move = (ev: MouseEvent) => {
      const h = Math.min(window.innerHeight - 120, Math.max(120, startH - (ev.clientY - startY)))
      onHeightChange(h)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const entries = getDebugLog()

  const copyAll = () => {
    const text = entries.map((e) => `[${e.t}] ${e.tag}: ${e.msg}`).join('\n')
    navigator.clipboard?.writeText(text || 'No log entries.')
  }

  return (
    <div
      className="console-dock"
      style={{ left: leftOffset, right: rightOffset, height }}
    >
      <div className="console-resize-top" onMouseDown={startResize} title="Drag to resize" />
      <div className="console-head">
        <span className="console-title">
          <span className="live-dot" /> Live console
          <span className="console-sub">everything, in real time · {entries.length}</span>
        </span>
        {centerSlot}
        <div className="console-actions">
          <button onClick={() => setPaused((p) => !p)} title="Pause / resume auto-scroll">
            <Icon name={paused ? 'play' : 'pause'} size={12} /> {paused ? 'Resume' : 'Pause'}
          </button>
          <button onClick={copyAll} title="Copy the full log">
            <Icon name="file-code" size={12} /> Copy all
          </button>
          <button onClick={() => clearDebugLog()} title="Clear the log">
            Clear
          </button>
          <button onClick={onClose} aria-label="Close console" title="Close">
            <Icon name="x" size={13} />
          </button>
        </div>
      </div>
      <div className="console-body" ref={bodyRef}>
        {entries.length === 0 && (
          <div className="console-empty">Waiting for events… run an agent or go live.</div>
        )}
        {entries.map((e, i) => (
          <div key={i} className={`console-line ctag-${e.tag.replace(/:/g, '-')}`}>
            <span className="console-time">{e.t}</span>
            <span className="console-tag">{e.tag}</span>
            <span className="console-msg">{e.msg}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
