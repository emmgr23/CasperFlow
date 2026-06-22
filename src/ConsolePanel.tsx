import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getDebugLog, subscribeRuntime, clearDebugLog } from './runtime'
import { linkify } from './linkify'
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

  const [copied, setCopied] = useState(false)
  // Copy all has been stubborn. Two real culprits were at play:
  //  1) awaiting the async Clipboard API first drops the click's user-activation,
  //     so the execCommand fallback then also fails;
  //  2) this is a node-editor — `user-select:none` is set on parts of the tree,
  //     and a textarea that inherits it CANNOT be selected, so execCommand copies
  //     nothing. We fix both: force `user-select:text` on the textarea, run the
  //     synchronous path first, fire the async API without awaiting, and as a last
  //     resort fall back to a prompt so the user can always copy by hand. We also
  //     log which path failed so the live console tells us if it ever breaks again.
  const copyAll = () => {
    const text = entries.map((e) => `[${e.t}] ${e.tag}: ${e.msg}`).join('\n') || 'No log entries.'
    const flash = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }

    // Path 1 — synchronous textarea + execCommand, inside the click gesture.
    let execOk = false
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.cssText =
        'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;margin:0;' +
        'opacity:0;z-index:2147483647;user-select:text;-webkit-user-select:text;'
      document.body.appendChild(ta)
      ta.focus({ preventScroll: true })
      ta.select()
      ta.setSelectionRange(0, text.length)
      execOk = document.execCommand('copy')
      document.body.removeChild(ta)
    } catch (err) {
      console.warn('[copyAll] execCommand path threw:', err)
    }
    if (execOk) {
      flash()
      return
    }

    // Path 2 — modern Clipboard API (needs a secure context: https or localhost).
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(flash).catch((err) => {
        console.warn('[copyAll] clipboard API failed:', err?.message || err)
        window.prompt('Copy the log (Cmd/Ctrl+C, then Enter):', text)
      })
      return
    }

    // Path 3 — last resort the user can always finish by hand.
    console.warn('[copyAll] no Clipboard API (insecure context?) and execCommand failed — prompt fallback')
    window.prompt('Copy the log (Cmd/Ctrl+C, then Enter):', text)
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
          <button onClick={copyAll} title="Copy the full log" className={copied ? 'copied' : ''}>
            <Icon name={copied ? 'check' : 'file-code'} size={12} /> {copied ? 'Copied' : 'Copy all'}
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
            <span className="console-msg">{linkify(e.msg)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
