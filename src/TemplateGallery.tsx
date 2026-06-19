import { useState } from 'react'
import Icon from './Icon'
import { AGENT_TEMPLATES, type AgentTemplate } from './templates'

interface Props {
  onPick: (t: AgentTemplate) => void
  onBuildWithAI: (description: string) => Promise<void>
  aiReady: boolean
  onClose: () => void
}

export default function TemplateGallery({ onPick, onBuildWithAI, aiReady, onClose }: Props) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)

  const build = async () => {
    if (!prompt.trim() || busy) return
    setBusy(true)
    await onBuildWithAI(prompt.trim())
    setBusy(false)
  }

  return (
    <div className="tpl-overlay" onClick={onClose}>
      <div className="tpl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tpl-head">
          <div>
            <h2 className="tpl-title">Start a new agent</h2>
            <p className="tpl-sub">Describe it in your own words, pick a template, or start blank.</p>
          </div>
          <button className="tpl-close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="tpl-ai">
          <div className="tpl-ai-label">
            <Icon name="wand" size={15} /> Build with AI
          </div>
          <div className="tpl-ai-row">
            <input
              className="tpl-ai-input"
              placeholder='e.g. "watch the CSPR price and alert me on Telegram if it drops below $0.018"'
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && build()}
              disabled={busy}
            />
            <button className="btn-primary" onClick={build} disabled={busy || !prompt.trim()}>
              {busy ? 'Building…' : 'Build'}
            </button>
          </div>
          {!aiReady && (
            <div className="tpl-ai-hint">
              Tip: connect a model in Settings → AI to enable this. Without a key it falls back to a best-guess template.
            </div>
          )}
        </div>
        <div className="tpl-grid">
          {AGENT_TEMPLATES.map((t) => (
            <button key={t.id} className="tpl-card" onClick={() => onPick(t)}>
              <div className="tpl-card-icon">
                <Icon name={t.icon} size={20} />
              </div>
              <div className="tpl-card-name">{t.name}</div>
              <div className="tpl-card-tag">{t.tagline}</div>
              <div className="tpl-card-desc">{t.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
