import { useMemo, useState } from 'react'
import Icon from './Icon'
import { WIKI, searchWiki } from './wiki'

const renderBody = (body: string) =>
  body.split('\n\n').map((para, i) => {
    if (para.startsWith('- ')) {
      const items = para.split('\n').map((l) => l.replace(/^- /, ''))
      return (
        <ul key={i} className="wiki-list">
          {items.map((it, j) => (
            <li key={j}>{it}</li>
          ))}
        </ul>
      )
    }
    return <p key={i}>{para}</p>
  })

export default function WikiPanel({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string>(WIKI[0].articles[0].id)
  const sections = useMemo(() => searchWiki(query), [query])

  const activeArticle =
    sections.flatMap((s) => s.articles).find((a) => a.id === activeId) ??
    sections[0]?.articles[0]

  return (
    <div className="wiki-overlay" onClick={onClose}>
      <div className="wiki-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wiki-sidebar">
          <div className="wiki-head">
            <Icon name="book" size={18} />
            <span>Wiki</span>
            <button className="wiki-close" onClick={onClose} aria-label="Close">
              <Icon name="x" size={15} />
            </button>
          </div>
          <div className="wiki-search">
            <Icon name="search" size={14} />
            <input
              autoFocus
              placeholder="Search features…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="wiki-nav">
            {sections.length === 0 && <div className="wiki-empty">No results.</div>}
            {sections.map((s) => (
              <div key={s.id} className="wiki-nav-group">
                <div className="wiki-nav-title">
                  <Icon name={s.icon} size={13} /> {s.title}
                </div>
                {s.articles.map((a) => (
                  <button
                    key={a.id}
                    className={`wiki-nav-item${a.id === activeArticle?.id ? ' active' : ''}`}
                    onClick={() => setActiveId(a.id)}
                  >
                    {a.title}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="wiki-content">
          {activeArticle ? (
            <>
              <h2 className="wiki-article-title">{activeArticle.title}</h2>
              <div className="wiki-body">{renderBody(activeArticle.body)}</div>
            </>
          ) : (
            <div className="wiki-empty">Select an article.</div>
          )}
        </div>
      </div>
    </div>
  )
}
