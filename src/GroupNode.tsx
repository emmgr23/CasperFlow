import { useRef } from 'react'
import { useReactFlow, type NodeProps } from '@xyflow/react'

export default function GroupNode({ id, data, selected }: NodeProps) {
  const { updateNodeData, setNodes, getZoom } = useReactFlow()
  const ref = useRef<HTMLDivElement>(null)

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const el = ref.current
    if (!el) return
    const startX = e.clientX
    const startY = e.clientY
    const startW = el.offsetWidth
    const startH = el.offsetHeight
    const zoom = getZoom() || 1
    const move = (ev: MouseEvent) => {
      const w = Math.max(220, startW + (ev.clientX - startX) / zoom)
      const h = Math.max(140, startH + (ev.clientY - startY) / zoom)
      setNodes((nds) => {
        let minW = 220
        let minH = 140
        for (const k of nds) {
          if (k.parentId !== id) continue
          minW = Math.max(minW, k.position.x + (k.measured?.width ?? 250) + 18)
          minH = Math.max(minH, k.position.y + (k.measured?.height ?? 90) + 18)
        }
        const w2 = Math.max(minW, w)
        const h2 = Math.max(minH, h)
        return nds.map((n) =>
          n.id === id ? { ...n, style: { ...n.style, width: w2, height: h2 } } : n,
        )
      })
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div ref={ref} className={`group-node${selected ? ' sel' : ''}`}>
      <input
        className="group-label nodrag"
        value={String((data as { label?: string }).label ?? 'Group')}
        onChange={(e) => updateNodeData(id, { label: e.target.value })}
        spellCheck={false}
      />
      <div className="group-resize-grip nodrag" onMouseDown={startResize} title="Drag to resize group" />
    </div>
  )
}
