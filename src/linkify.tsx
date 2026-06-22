import type { ReactNode } from 'react'

// Turn any http(s) URL inside a log line into a clickable link (opens in a new
// tab), so explorer links like https://testnet.cspr.live/deploy/… are one click.
const URL_RE = /(https?:\/\/[^\s]+)/g

export function linkify(text: string): ReactNode {
  const s = String(text ?? '')
  if (!s.includes('http')) return s
  return s.split(URL_RE).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="log-link"
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}
