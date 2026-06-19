// Tiny helpers to generate jagged "electric arc" SVG paths that crackle.
// Used by PulseEdge (bolts along the wire) and ModuleNode (bolts around a node).

// A lightning bolt that follows an existing SVG path (e.g. the edge curve),
// adding tapered perpendicular jitter so it zig-zags along the wire.
export function boltAlongPath(el: SVGPathElement, amp = 7): string {
  const len = el.getTotalLength()
  if (!len) return ''
  const n = Math.max(6, Math.min(28, Math.round(len / 20)))
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i <= n; i++) {
    const p = el.getPointAtLength((len * i) / n)
    pts.push({ x: p.x, y: p.y })
  }
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]
    const next = pts[i + 1]
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const L = Math.hypot(dx, dy) || 1
    const nx = -dy / L
    const ny = dx / L
    const taper = Math.sin(Math.PI * (i / n)) // 0 at the ends, 1 in the middle
    const off = (Math.random() * 2 - 1) * amp * taper
    d += ` L ${(pts[i].x + nx * off).toFixed(1)} ${(pts[i].y + ny * off).toFixed(1)}`
  }
  const last = pts[pts.length - 1]
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`
  return d
}

// A short lightning arc crawling along one edge of a w×h rectangle, jittering
// outward — used to make a running node look electrified around its border.
export function boltOnBorder(w: number, h: number, amp = 7): string {
  const edge = Math.floor(Math.random() * 4) // 0 top, 1 right, 2 bottom, 3 left
  const t0 = Math.random() * 0.55
  const t1 = Math.min(1, t0 + 0.25 + Math.random() * 0.4)
  const segs = 5
  const pts: [number, number][] = []
  for (let i = 0; i <= segs; i++) {
    const t = t0 + (t1 - t0) * (i / segs)
    let x = 0
    let y = 0
    let nx = 0
    let ny = 0
    if (edge === 0) {
      x = t * w
      y = 0
      ny = -1
    } else if (edge === 1) {
      x = w
      y = t * h
      nx = 1
    } else if (edge === 2) {
      x = t * w
      y = h
      ny = 1
    } else {
      x = 0
      y = t * h
      nx = -1
    }
    const taper = Math.sin(Math.PI * (i / segs))
    const off = (Math.random() * 0.9 + 0.3) * amp * taper
    pts.push([x + nx * off, y + ny * off])
  }
  return 'M ' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ')
}
