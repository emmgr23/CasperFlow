import { useEffect, useMemo, useState } from 'react'
import { getJournal, subscribeJournal, type JournalEntry } from './journal'
import { askText, type AiConfig } from './ai'
import Icon from './Icon'

// Show the real cspr.live address, but with the long hash trimmed so it stays
// on one line: "testnet.cspr.live/deploy/32af5f17…9814d3801".
function shortUrl(url: string): string {
  const bare = url.replace(/^https?:\/\//, '')
  const slash = bare.lastIndexOf('/')
  if (slash < 0) return bare
  const head = bare.slice(0, slash + 1)
  const tail = bare.slice(slash + 1)
  const id = tail.length > 20 ? `${tail.slice(0, 8)}…${tail.slice(-9)}` : tail
  return head + id
}

// Gas in plain CSPR (motes / 1e9). Exact zero shows as "0"; any non-zero value
// keeps full precision so a tiny refund is never silently rounded to 0.
const cspr = (motes: number) => {
  if (motes === 0) return '0'
  return (motes / 1e9).toFixed(9).replace(/\.?0+$/, '')
}

// Dollar value of a CSPR amount at the price recorded with the action.
const usdOf = (amountCspr: number, price?: number): string | null => {
  if (price == null || !(price > 0)) return null
  const v = amountCspr * price
  return v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`
}

// The full, honest gas breakdown from the chain receipt: what was held upfront,
// what came back, and the net cost. Falls back to the single figure for older
// entries that only stored the net cost.
function gasLabel(e: JournalEntry) {
  const { gasLimitMotes: limit, gasRefundMotes: refund, gasMotes: cost } = e
  const netMotes = cost != null ? cost : limit != null && refund != null ? limit - refund : null
  const netUsd = netMotes != null ? usdOf(netMotes / 1e9, e.usd) : null
  if (limit != null && refund != null) {
    return (
      <span className="journal-gas" title="Casper 2.0 holds the gas limit upfront, then releases the unused part back to your wallet">
        gas: held <strong>{cspr(limit)}</strong>, refunded <strong>{cspr(refund)}</strong>, net{' '}
        <strong>{netMotes != null ? cspr(netMotes) : '0'}</strong> CSPR
        {netUsd && <span className="journal-usd"> ({netUsd})</span>}
      </span>
    )
  }
  if (cost != null)
    return (
      <span className="journal-gas">
        gas {cspr(cost)} CSPR{netUsd && <span className="journal-usd"> ({netUsd})</span>} (refundable)
      </span>
    )
  return null
}

const pad = (n: number) => String(n).padStart(2, '0')
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// A diary of every on-chain action: a calendar on the left to jump to any day,
// and on the right exactly what happened that day (with amounts, recipients,
// times, status and clickable explorer links), plus an optional AI "story".
export default function JournalView({
  onClose,
  aiConfig,
}: {
  onClose: () => void
  aiConfig?: AiConfig
}) {
  const [, force] = useState(0)
  useEffect(() => subscribeJournal(() => force((n) => n + 1)), [])
  const entries = getJournal()

  const today = new Date()
  const [selected, setSelected] = useState<string>(dateKey(today))
  const [viewY, setViewY] = useState(today.getFullYear())
  const [viewM, setViewM] = useState(today.getMonth())
  const [story, setStory] = useState('')
  const [storyLoading, setStoryLoading] = useState(false)

  const byDay = useMemo(() => {
    const m: Record<string, JournalEntry[]> = {}
    for (const e of entries) {
      const k = dateKey(new Date(e.time))
      ;(m[k] ||= []).push(e)
    }
    for (const k in m) m[k].sort((a, b) => a.time - b.time)
    return m
  }, [entries])

  const dayEntries = byDay[selected] || []

  const grid = useMemo(() => {
    const first = new Date(viewY, viewM, 1)
    const startDow = (first.getDay() + 6) % 7 // Monday = 0
    const daysInMonth = new Date(viewY, viewM + 1, 0).getDate()
    const cells: ({ day: number; key: string } | null)[] = []
    for (let i = 0; i < startDow; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++)
      cells.push({ day: d, key: dateKey(new Date(viewY, viewM, d)) })
    return cells
  }, [viewY, viewM])

  // Years for the horizontal wheel: from the earliest recorded year (or 5 back)
  // up to next year.
  const years = useMemo(() => {
    let min = new Date().getFullYear() - 5
    for (const e of entries) min = Math.min(min, new Date(e.time).getFullYear())
    const arr: number[] = []
    for (let y = min; y <= new Date().getFullYear() + 1; y++) arr.push(y)
    return arr
  }, [entries])

  const goToday = () => {
    const t = new Date()
    setViewY(t.getFullYear())
    setViewM(t.getMonth())
    setSelected(dateKey(t))
  }

  const tellStory = async () => {
    if (!aiConfig || !dayEntries.length) return
    setStoryLoading(true)
    setStory('')
    const facts = dayEntries
      .map(
        (e) =>
          `- ${new Date(e.time).toLocaleTimeString('en-GB')} | ${e.kind} | ${e.title} | ${e.status}` +
          `${e.amount != null ? ` | ${e.amount} CSPR` : ''}` +
          `${e.to ? ` | to ${e.to}` : ''}` +
          `${e.gasMotes != null ? ` | gas ${(e.gasMotes / 1e9).toFixed(4)} CSPR (held, refundable on Casper 2.0)` : ''}`,
      )
      .join('\n')
    const text = await askText(
      aiConfig,
      'You write a clear, friendly daily journal in ENGLISH for a non-technical user, summarising the on-chain activity below as a short readable story. Mention amounts, recipients and that on Casper the gas is held then refunded. Do NOT invent anything, use only the given facts. 2 to 4 short paragraphs, no bullet points.',
      `Date: ${selected}\nActivity:\n${facts}`,
    )
    setStory(text || 'Could not generate the story (check your AI key).')
    setStoryLoading(false)
  }

  const longDate = new Date(`${selected}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="journal-overlay" onClick={onClose}>
      <div className="journal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="journal-head">
          <span className="journal-title">
            <Icon name="note" size={18} /> Journal
          </span>
          <span className="journal-sub">Everything your agents and flows did, day by day.</span>
          <button className="journal-close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="journal-body">
          <div className="journal-cal">
            {/* Horizontal year wheel: scroll / drag to slide through the years. */}
            <div
              className="journal-years"
              onWheel={(e) => {
                e.currentTarget.scrollLeft += e.deltaY
              }}
            >
              {years.map((y) => (
                <button
                  key={y}
                  className={`journal-year${y === viewY ? ' selected' : ''}`}
                  onClick={() => setViewY(y)}
                >
                  {y}
                </button>
              ))}
            </div>
            {/* All 12 months: pick one in a single click. */}
            <div className="journal-months">
              {MONTHS.map((m, i) => (
                <button
                  key={m}
                  className={`journal-month${i === viewM ? ' selected' : ''}`}
                  onClick={() => setViewM(i)}
                >
                  {m.slice(0, 3)}
                </button>
              ))}
            </div>
            <div className="journal-cal-grid">
              {WEEKDAYS.map((w) => (
                <div key={w} className="journal-cal-dow">
                  {w}
                </div>
              ))}
              {grid.map((c, i) =>
                c === null ? (
                  <div key={i} className="journal-cal-blank" />
                ) : (
                  <button
                    key={i}
                    className={`journal-cal-day${c.key === selected ? ' selected' : ''}${
                      c.key === dateKey(today) ? ' today' : ''
                    }`}
                    onClick={() => setSelected(c.key)}
                  >
                    {c.day}
                    {byDay[c.key] && <span className="journal-cal-dot" />}
                  </button>
                ),
              )}
            </div>
            <button className="journal-today-btn" onClick={goToday}>
              Today
            </button>
          </div>

          <div className="journal-detail">
            <div className="journal-detail-head">
              <h3>{longDate}</h3>
              <span className="journal-count">
                {dayEntries.length} action{dayEntries.length === 1 ? '' : 's'}
              </span>
              {aiConfig && dayEntries.length > 0 && (
                <button className="journal-story-btn" onClick={tellStory} disabled={storyLoading}>
                  <Icon name="sparkles" size={13} /> {storyLoading ? 'Writing…' : "Today's recap"}
                </button>
              )}
            </div>
            {dayEntries.length === 0 ? (
              <div className="journal-empty">Nothing happened on this day.</div>
            ) : (
              <div className="journal-entries">
                {dayEntries.map((e) => (
                  <div key={e.id} className="journal-entry">
                    <div className="journal-entry-time">
                      {new Date(e.time).toLocaleTimeString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                    <div className="journal-entry-body">
                      <div className="journal-entry-title">
                        <span className={`journal-kind kind-${e.kind}`}>{e.kind}</span>
                        <span className="journal-entry-text">{e.title}</span>
                        <span className={`journal-status js-${e.status}`}>{e.status}</span>
                      </div>
                      <div className="journal-entry-meta">
                        {e.amount != null && (
                          <span>
                            {e.amount} CSPR
                            {usdOf(e.amount, e.usd) && (
                              <span className="journal-usd"> ({usdOf(e.amount, e.usd)})</span>
                            )}
                          </span>
                        )}
                        {e.from && (
                          <span>
                            from <strong>{e.from}</strong>
                            {e.to ? (
                              <>
                                {' '}to <strong>{e.to}</strong>
                              </>
                            ) : null}
                          </span>
                        )}
                        {e.actor && <span className="journal-actor">by {e.actor}</span>}
                        {gasLabel(e)}
                        {e.url && (
                          <a
                            href={e.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="log-link"
                          >
                            {shortUrl(e.url)}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* The recap is a transient pop-up: read it, then close it, without
          pushing the actual transaction rows down. */}
      {story && (
        <div className="journal-recap-overlay" onClick={() => setStory('')}>
          <div className="journal-recap" onClick={(e) => e.stopPropagation()}>
            <div className="journal-recap-head">
              <span className="journal-recap-title">
                <Icon name="sparkles" size={15} /> Today's recap
              </span>
              <span className="journal-recap-date">{longDate}</span>
              <button
                className="journal-close"
                onClick={() => setStory('')}
                aria-label="Close"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="journal-recap-body">{story}</div>
          </div>
        </div>
      )}
    </div>
  )
}
