import { useEffect, useRef, useState } from 'react'
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'
import { boltAlongPath } from './lightning'

// Custom edge for CasperFlow.
//  - idle: thin marching-dash wire (respects the "Animated connections" setting)
//  - active (data passing through during a run): the wire turns SOLID and glows,
//    with a jagged "electric arc" that crackles and re-shapes along the cable —
//    like a brief lightning discharge travelling from the finished node to the
//    one currently executing.
export default function PulseEdge(props: EdgeProps) {
  const {
    id,
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
  const stroke = (style as React.CSSProperties | undefined)?.stroke?.toString() || '#7c8cff'

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
      // a fainter second arc most of the time, for a forked-lightning feel
      setBolt2(Math.random() > 0.35 ? boltAlongPath(el, 4) : '')
    }
    crackle()
    const iv = setInterval(crackle, 75)
    return () => clearInterval(iv)
  }, [active, path])

  return (
    <>
      <path ref={measureRef} d={path} fill="none" stroke="none" />
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={`cf-edge${active ? ' on' : idleClass}`}
        style={{ stroke, color: stroke, strokeWidth: active ? 3 : 2 }}
      />
      {active && bolt && (
        <g className="cf-spark" style={{ color: stroke }}>
          {bolt2 && <path className="cf-bolt-glow" d={bolt2} />}
          <path className="cf-bolt-glow" d={bolt} />
          {bolt2 && <path className="cf-bolt-core" d={bolt2} />}
          <path className="cf-bolt-core" d={bolt} />
        </g>
      )}
    </>
  )
}
