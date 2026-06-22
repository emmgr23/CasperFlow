import { useEffect, useMemo, useState } from 'react'
import { getJournal, subscribeJournal, type JournalEntry } from './journal'
import { askText, type AiConfig } from './ai'
import Icon from './Icon'

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
                  <Icon name="sparkles" size={13} /> {storyLoading ? 'Writing…' : 'Tell the story'}
                </button>
              )}
            </div>
            {story && <div className="journal-story">{story}</div>}
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
                        {e.amount != null && <span>{e.amount} CSPR</span>}
                        {e.gasMotes != null && (
                          <span>gas {(e.gasMotes / 1e9).toFixed(4)} CSPR (refundable)</span>
                        )}
                        {e.url && (
                          <a
                            href={e.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="log-link"
                          >
                            View transaction
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
    </div>
  )
}
