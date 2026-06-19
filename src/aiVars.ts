// Each AI decision node gets its own output variable so multiple AIs never
// collide on {{ai}}. Ordered left→right (then top→bottom) by canvas position so
// the upstream AI is always {{ai}}, the next {{ai2}}, then {{ai3}}, …
// Both the runtime and the UI use this same function, so they always agree.

type NodeLike = {
  id: string
  position?: { x: number; y: number }
  data?: { moduleType?: string }
}

export function aiNodesOrdered(nodes: NodeLike[]): NodeLike[] {
  return nodes
    .filter((n) => n.data?.moduleType === 'ai')
    .sort((a, b) => {
      const ax = a.position?.x ?? 0
      const bx = b.position?.x ?? 0
      if (ax !== bx) return ax - bx
      const ay = a.position?.y ?? 0
      const by = b.position?.y ?? 0
      if (ay !== by) return ay - by
      return a.id < b.id ? -1 : 1
    })
}

// 1-based rank of an AI node among all AI nodes (0 if not an AI / not found).
export function aiRank(nodes: NodeLike[], id: string): number {
  return aiNodesOrdered(nodes).findIndex((n) => n.id === id) + 1
}

// Output variable base name for an AI node: 'ai', 'ai2', 'ai3', …
export function aiVarName(nodes: NodeLike[], id: string): string {
  const rank = aiRank(nodes, id)
  return rank <= 1 ? 'ai' : `ai${rank}`
}
