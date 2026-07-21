import type { ReactNode } from 'react'

// Turn any http(s) URL inside a log line into a clickable link (opens in a new
// tab), so explorer links like https://testnet.cspr.live/transaction/… are one
// click. Trailing punctuation (e.g. the `"})` that closes a JSON tool call, or a
// sentence-ending period/paren) is kept OUT of the link so the clicked URL is clean.
const URL_RE = /(https?:\/\/[^\s]+)/g
const TRAILING = /[)"'`\]}.,;:!?>]+$/

// Only ever turn a substring into a link if it parses as a real http(s) URL.
// Parsing with the URL API and allow-listing the protocol guarantees no other
// scheme (e.g. javascript:) can ever reach an href — the link target is safe.
function safeHttpUrl(raw: string): string | null {
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

export function linkify(text: string): ReactNode {
  const s = String(text ?? '')
  if (!s.includes('http')) return s
  return s.split(URL_RE).map((part, i) => {
    if (!/^https?:\/\//.test(part)) return <span key={i}>{part}</span>
    const trail = (part.match(TRAILING) || [''])[0]
    const raw = trail ? part.slice(0, part.length - trail.length) : part
    const url = safeHttpUrl(raw)
    if (!url) return <span key={i}>{part}</span>
    return (
      <span key={i}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="log-link"
          onClick={(e) => e.stopPropagation()}
        >
          {url}
        </a>
        {trail}
      </span>
    )
  })
}
