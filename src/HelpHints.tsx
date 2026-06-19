import { useEffect, useRef, useState } from 'react'

// Global "help on hover" layer. When enabled, hovering any element that has a
// native `title` (almost every button does) for 2 seconds without moving shows a
// clean popup next to the cursor with that help text. The native OS tooltip is
// suppressed (title → data-cfhelp) so there's no double tooltip. Toggle in
// Settings → Interface. Zero per-component wiring — it reads existing titles.
const DELAY = 2000

export default function HelpHints({ enabled }: { enabled: boolean }) {
  const [hint, setHint] = useState<{ text: string; x: number; y: number } | null>(null)
  const timer = useRef<number | null>(null)
  const shown = useRef(false)

  useEffect(() => {
    if (!enabled) {
      setHint(null)
      return
    }

    const clearTimer = () => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
    }
    const hideNow = () => {
      clearTimer()
      if (shown.current) {
        shown.current = false
        setHint(null)
      }
    }

    // Walk up from the target to the nearest element carrying help text.
    // Convert a live `title` to `data-cfhelp` and strip it to kill the OS tooltip.
    const helpTextOf = (target: EventTarget | null): string => {
      let el = target as HTMLElement | null
      let depth = 0
      while (el && el !== document.body && depth < 8) {
        if (el.getAttribute) {
          const t = el.getAttribute('title')
          if (t) {
            el.setAttribute('data-cfhelp', t)
            el.removeAttribute('title')
            return t
          }
          const d = el.getAttribute('data-cfhelp')
          if (d) return d
        }
        el = el.parentElement
        depth++
      }
      return ''
    }

    const onMove = (e: MouseEvent) => {
      clearTimer()
      if (shown.current) {
        shown.current = false
        setHint(null)
      }
      const text = helpTextOf(e.target)
      if (!text) return
      const x = e.clientX
      const y = e.clientY
      timer.current = window.setTimeout(() => {
        shown.current = true
        setHint({ text, x, y })
      }, DELAY)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mousedown', hideNow, true)
    window.addEventListener('wheel', hideNow, true)
    window.addEventListener('keydown', hideNow, true)
    return () => {
      clearTimer()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', hideNow, true)
      window.removeEventListener('wheel', hideNow, true)
      window.removeEventListener('keydown', hideNow, true)
    }
  }, [enabled])

  if (!hint) return null
  const maxW = 270
  let left = hint.x + 14
  let top = hint.y + 18
  if (left + maxW > window.innerWidth - 8) left = Math.max(8, hint.x - maxW - 14)
  if (top + 90 > window.innerHeight - 8) top = Math.max(8, hint.y - 70)
  return (
    <div className="help-hint" style={{ left, top, maxWidth: maxW }}>
      {hint.text}
    </div>
  )
}
