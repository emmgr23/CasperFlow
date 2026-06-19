import { moduleByType, defaultParams, CATEGORY_COLORS, type Params, type ModuleCategory } from './modules'
import type { ModuleNodeData } from './ModuleNode'

interface Props {
  nodeId: string
  data: ModuleNodeData
  onChange: (nodeId: string, params: Params) => void
  onClose: () => void
}

export default function ParamsPanel({ nodeId, data, onChange, onClose }: Props) {
  const def = moduleByType(data.moduleType)
  if (!def) return null
  const colors = CATEGORY_COLORS[def.category as ModuleCategory]
  const params = { ...defaultParams(def), ...(data.params ?? {}) }

  const update = (key: string, value: string | number) =>
    onChange(nodeId, { ...params, [key]: value })

  return (
    <div className="params-panel">
      <div className="params-header" style={{ background: colors.bg, color: colors.text }}>
        <span>{def.icon} {def.label}</span>
        <button className="params-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="params-body">
        {def.params.map((p) => (
          <div key={p.key} className="params-field">
            <label>{p.label}{p.suffix ? ` (${p.suffix})` : ''}</label>
            {p.type === 'select' ? (
              <select value={String(params[p.key])} onChange={(e) => update(p.key, e.target.value)}>
                {p.options!.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                type={p.type === 'number' ? 'number' : 'text'}
                value={String(params[p.key])}
                step={p.type === 'number' ? 'any' : undefined}
                onChange={(e) =>
                  update(p.key, p.type === 'number' ? Number(e.target.value) : e.target.value)
                }
              />
            )}
          </div>
        ))}
        <div className="params-hint">Changes are applied immediately.</div>
      </div>
    </div>
  )
}
