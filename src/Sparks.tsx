import { useEffect, useRef, useState } from 'react'
import { boltOnBorder } from './lightning'

// A thin, discreet electric crackle that hugs a button's border while it's active.
// Reuses the same lightning generator as the nodes, but lighter strokes.
export default function BorderSparks({ color }: { color: string }) {
  const ref = useRef<SVGSVGElement>(null)
  const [bolts, setBolts] = useState<string[]>([])
  useEffect(() => {
    const crackle = () => {
      const el = ref.current
      const w = el?.clientWidth || 100
      const h = el?.clientHeight || 34
      const n = 1 + Math.floor(Math.random() * 2) // 1–2 small arcs at a time
      const arcs: string[] = []
      for (let i = 0; i < n; i++) arcs.push(boltOnBorder(w, h, 4.5))
      setBolts(arcs)
    }
    crackle()
    const iv = setInterval(crackle, 110)
    return () => clearInterval(iv)
  }, [])
  return (
    <svg ref={ref} className="btn-sparks" style={{ color }} aria-hidden>
      {bolts.map((d, i) => (
        <g key={i}>
          <path className="btn-bolt-glow" d={d} />
          <path className="btn-bolt-core" d={d} />
        </g>
      ))}
    </svg>
  )
}
