import { useEffect, useRef, useState } from 'react'
import { Handle, Position, useReactFlow, useNodes, type NodeProps } from '@xyflow/react'
import { CATEGORY_COLORS, moduleByType, defaultParams, statusOf, type ModuleCategory, type Params } from './modules'
import { aiVarName } from './aiVars'
import { fetchCsprPrice } from './price'
import { subscribeRuntime, getLiveSchedule } from './runtime'
import WalletNodeFront from './WalletNodeFront'
import { boltOnBorder } from './lightning'
import Icon from './Icon'

// Electric crackle around a node while it executes: a few short lightning arcs
// hug the card's border and re-shape rapidly, like a brief discharge.
function NodeSparks({ color }: { color: string }) {
  const ref = useRef<SVGSVGElement>(null)
  const [bolts, setBolts] = useState<string[]>([])
  useEffect(() => {
    const crackle = () => {
      const el = ref.current
      const w = el?.clientWidth || 230
      const h = el?.clientHeight || 90
      const n = 2 + Math.floor(Math.random() * 2)
      const arcs: string[] = []
      for (let i = 0; i < n; i++) arcs.push(boltOnBorder(w, h, 8))
      setBolts(arcs)
    }
    crackle()
    const iv = setInterval(crackle, 90)
    return () => clearInterval(iv)
  }, [])
  return (
    <svg ref={ref} className="node-sparks" style={{ color }} aria-hidden>
      {bolts.map((d, i) => (
        <g key={i}>
          <path className="node-bolt-glow" d={d} />
          <path className="node-bolt-core" d={d} />
        </g>
      ))}
    </svg>
  )
}

export interface ModuleNodeData {
  moduleType: string
  params?: Params
  status?: 'idle' | 'running' | 'done' | 'skipped'
  flipped?: boolean
  width?: number
  approval?: 'autonomous' | 'ask'
  showAdvanced?: boolean
  [key: string]: unknown
}

export default function ModuleNode({ id, data, selected }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const allNodes = useNodes()
  const d = data as ModuleNodeData
  const def = moduleByType(d.moduleType)
  const isPrice = d.moduleType === 'price'
  const needsPrice = isPrice || (def?.params.some((p) => p.key === 'entry') ?? false)
  const [livePrice, setLivePrice] = useState<number | null>(null)
  const isSchedule = d.moduleType === 'schedule'
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!isSchedule) return
    const unsub = subscribeRuntime(() => setTick((n) => n + 1))
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => {
      unsub()
      clearInterval(t)
    }
  }, [isSchedule])

  useEffect(() => {
    if (!needsPrice) return
    let active = true
    const tick = async () => {
      const p = await fetchCsprPrice()
      if (active) setLivePrice(p)
    }
    tick()
    const t = setInterval(tick, 30_000)
    return () => {
      active = false
      clearInterval(t)
    }
  }, [needsPrice])

  if (!def) return null
  const colors = CATEGORY_COLORS[def.category as ModuleCategory]
  const status = d.status ?? 'idle'
  const params = { ...defaultParams(def), ...(d.params ?? {}) }
  const isWallet = d.moduleType === 'wallet'

  // Live countdown to the next cycle (Schedule nodes only).
  const ls = getLiveSchedule()
  const scheduleLive = isSchedule && ls.running && ls.intervalMs > 0
  let remainingMs = 0
  let remainingFrac = 0
  if (scheduleLive) {
    const elapsed = Math.max(0, Date.now() - ls.lastTickMs)
    remainingMs = Math.max(0, ls.intervalMs - elapsed)
    remainingFrac = Math.min(1, Math.max(0, remainingMs / ls.intervalMs))
  }
  const fmtCountdown = (ms: number) => {
    const s = Math.ceil(ms / 1000)
    if (s >= 60) {
      const m = Math.floor(s / 60)
      const ss = s % 60
      return `${m}:${String(ss).padStart(2, '0')}`
    }
    return `${s}s`
  }

  const cardRef = useRef<HTMLDivElement>(null)
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = cardRef.current?.offsetWidth ?? 230
    const move = (ev: MouseEvent) => {
      const w = Math.min(560, Math.max(200, startW + ev.clientX - startX))
      updateNodeData(id, { width: w })
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div
      ref={cardRef}
      className={`node-card status-${status}${selected ? ' selected' : ''}`}
      style={
        {
          '--node-color': colors.border,
          '--node-bg': colors.bg,
          ...(typeof d.width === 'number' ? { width: d.width } : {}),
        } as unknown as React.CSSProperties
      }
    >
      {def.category !== 'trigger' && <Handle type="target" position={Position.Left} />}
      {status === 'running' && <NodeSparks color={colors.border} />}
      <div className="node-face node-front" title="Click to edit in the Properties panel">
        <div className="node-title" style={{ color: colors.text }}>
          <Icon name={def.icon} size={17} style={{ color: colors.border, flexShrink: 0 }} />
          {def.label}
          {d.moduleType === 'ai' && (
            <span className="ai-var-pill" title="This AI's answer is available to later steps under this tag">
              {aiVarName(allNodes, id)}
            </span>
          )}
          {status === 'running' && <span className="spinner" />}
          {status === 'done' && <Icon name="check" size={15} className="check" />}
        </div>
        {(() => {
          const st = statusOf(d.moduleType)
          // Only show the pill when it carries information: Beta / Soon.
          // "Live" is the default, so showing it on every card is just noise.
          if (status === 'running' || status === 'done' || st === 'live') return null
          return (
            <span className={`status-pill status-${st}`}>
              {st === 'beta' ? 'Beta' : 'Soon'}
            </span>
          )
        })()}
        {isWallet ? (
          <WalletNodeFront id={id} params={params} />
        ) : d.moduleType === 'transfer' ? (
          (() => {
            const addr = String(params.to || '')
            const name = String(params.toName || '')
            const isName = name.endsWith('.cspr')
            const shortAddr =
              addr.length > 22 ? `${addr.slice(0, 14)}…${addr.slice(-8)}` : addr
            return (
              <div className="node-desc node-desc-transfer">
                <div className="ndt-main">
                  {Number(params.amount)} CSPR → {name || 'recipient'}
                  {isName && <span className="ndt-tag">cspr.name</span>}
                </div>
                {addr && <div className="ndt-addr">{shortAddr}</div>}
              </div>
            )
          })()
        ) : (
          <div className="node-desc">{def.describe(params)}</div>
        )}
        {isWallet && String(params.mode) === 'manual' && (
          <div className="approval-chip">
            <Icon name="shield" size={11} /> needs approval
          </div>
        )}
        {isPrice && (
          <div className="live-chip">
            <span className="live-dot" />
            {livePrice !== null ? `$${livePrice}` : 'connecting…'}
            <span className="live-label">LIVE</span>
          </div>
        )}
        {scheduleLive && (
          <div className="sched-countdown" title="Time until the next cycle">
            <svg className="sched-ring" viewBox="0 0 40 40">
              <circle className="sched-ring-bg" cx="20" cy="20" r="16" pathLength={100} />
              <circle
                className="sched-ring-fg"
                cx="20"
                cy="20"
                r="16"
                pathLength={100}
                strokeDasharray={`${remainingFrac * 100} 100`}
              />
            </svg>
            <div className="sched-count-text">
              <span className="sched-count">{fmtCountdown(remainingMs)}</span>
              <span className="sched-count-label">next run</span>
            </div>
          </div>
        )}
      </div>
      {def.category !== 'output' && <Handle type="source" position={Position.Right} />}
      <div className="node-resize-grip nodrag" onMouseDown={startResize} title="Drag to resize" />
    </div>
  )
}
