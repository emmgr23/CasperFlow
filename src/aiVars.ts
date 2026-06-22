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

// Same idea for Autonomous Agent nodes → 'agent', 'agent2', … so two agents on
// the canvas are clearly distinct (AGENT / AGENT 2) and the runtime variable
// ({{agent}}, {{agent2}}) always matches the badge shown on the node.
export function agentNodesOrdered(nodes: NodeLike[]): NodeLike[] {
  return nodes
    .filter((n) => n.data?.moduleType === 'agent')
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

export function agentRank(nodes: NodeLike[], id: string): number {
  return agentNodesOrdered(nodes).findIndex((n) => n.id === id) + 1
}

// A lone agent is just {{agent}}. As soon as there are 2+, they all number
// themselves: {{agent1}}, {{agent2}}, … (and the badge follows, see agentBadge).
export function agentVarName(nodes: NodeLike[], id: string): string {
  const ordered = agentNodesOrdered(nodes)
  const i = ordered.findIndex((n) => n.id === id)
  if (i < 0) return 'agent'
  return ordered.length <= 1 ? 'agent' : `agent${i + 1}`
}

// Display label that always matches the variable: "AGENT" / "AGENT 1" / "AGENT 2".
export function agentBadge(nodes: NodeLike[], id: string): string {
  const v = agentVarName(nodes, id)
  return v === 'agent' ? 'AGENT' : `AGENT ${v.slice('agent'.length)}`
}
