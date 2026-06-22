import { useEffect, useRef, useState } from 'react'
import { BaseEdge, getBezierPath, useNodes, type EdgeProps, type Node } from '@xyflow/react'
import { boltAlongPath } from './lightning'
import { moduleByType, CATEGORY_COLORS, type ModuleCategory } from './modules'

// The category border colour of the node with this id (the "rank" colour).
function nodeColor(nodes: Node[], id: string | undefined): string | null {
  if (!id) return null
  const n = nodes.find((x) => x.id === id)
  const mt = (n?.data as { moduleType?: string } | undefined)?.moduleType
  const def = mt ? moduleByType(mt) : undefined
  if (!def) return null
  return CATEGORY_COLORS[def.category as ModuleCategory]?.border ?? null
}

// Lighten (pct>0) or darken (pct<0) a #rrggbb colour by a few percent.
function shade(hex: string, pct: number): string {
  const m = hex.replace('#', '')
  if (m.length !== 6) return hex
  const num = parseInt(m, 16)
  const adj = (c: number) => Math.max(0, Math.min(255, Math.round(c + (pct / 100) * 255)))
  const r = adj((num >> 16) & 255)
  const g = adj((num >> 8) & 255)
  const b = adj(num & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

// Small deterministic value from the edge id, so two wires between the same two
// colours still differ slightly and stay tellable apart when they cross.
function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff
  return h
}

// Custom edge for CasperFlow.
//  - colour: a gradient from the SOURCE node's rank colour to the TARGET node's,
//    so an orange→yellow link literally blends orange into yellow. A tiny per-edge
//    shade keeps crossing same-colour wires distinguishable.
//  - idle: thin marching-dash wire (respects the "Animated connections" setting)
//  - active (data passing through during a run): the wire turns SOLID and glows,
//    with a jagged electric arc crackling along the cable.
export default function PulseEdge(props: EdgeProps) {
  const {
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    style,
    data,
  } = props

  const nodes = useNodes()

  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const d = (data ?? {}) as { active?: boolean; animated?: boolean; dashed?: boolean }
  const active = !!d.active
  const dashed = d.dashed !== false // default dashed unless explicitly solid
  const marching = d.animated !== false
  const fallback = (style as React.CSSProperties | undefined)?.stroke?.toString() || '#7c8cff'

  // Endpoint colours → gradient. Fall back to the inherited stroke if a node
  // isn't resolved yet (e.g. mid-creation).
  const delta = (hashId(id) % 17) - 8 // -8…+8 %
  const fromC = shade(nodeColor(nodes, source) || fallback, delta)
  const toC = shade(nodeColor(nodes, target) || fallback, -delta)
  const gradId = `cfgrad-${id}`
  const strokeRef = `url(#${gradId})`

  // idle look: solid line, static dashes, or marching dashes
  const idleClass = !dashed ? '' : marching ? ' march' : ' dash'

  // Hidden path used only to measure the curve so the bolt can follow it.
  const measureRef = useRef<SVGPathElement>(null)
  const [bolt, setBolt] = useState('')
  const [bolt2, setBolt2] = useState('')

  useEffect(() => {
    if (!active) {
      setBolt('')
      setBolt2('')
      return
    }
    const crackle = () => {
      const el = measureRef.current
      if (!el) return
      setBolt(boltAlongPath(el, 8))
      setBolt2(Math.random() > 0.35 ? boltAlongPath(el, 4) : '')
    }
    crackle()
    const iv = setInterval(crackle, 75)
    return () => clearInterval(iv)
  }, [active, path])

  return (
    <>
      <defs>
        <linearGradient
          id={gradId}
          gradientUnits="userSpaceOnUse"
          x1={sourceX}
          y1={sourceY}
          x2={targetX}
          y2={targetY}
        >
          <stop offset="0%" stopColor={fromC} />
          <stop offset="100%" stopColor={toC} />
        </linearGradient>
      </defs>
      <path ref={measureRef} d={path} fill="none" stroke="none" />
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={`cf-edge${active ? ' on' : idleClass}`}
        style={{ stroke: strokeRef, color: toC, strokeWidth: active ? 3 : 2 }}
      />
      {active && bolt && (
        // The glow follows the SAME gradient as the wire (orange→yellow, blue→red…);
        // the core stays white, like the bright centre of real lightning.
        <g className="cf-spark" style={{ color: toC }}>
          {bolt2 && <path className="cf-bolt-glow" d={bolt2} stroke={strokeRef} />}
          <path className="cf-bolt-glow" d={bolt} stroke={strokeRef} />
          {bolt2 && <path className="cf-bolt-core" d={bolt2} />}
          <path className="cf-bolt-core" d={bolt} />
        </g>
      )}
    </>
  )
}
