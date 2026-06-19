import type { Node, Edge } from '@xyflow/react'

export interface FlowData {
  nodes: Node[]
  edges: Edge[]
}

export interface Workspace {
  id: string
  name: string
  flow: FlowData
}

export interface WorkspaceStore {
  activeId: string
  workspaces: Workspace[]
}

const STORAGE = 'casperflow-workspaces-v1'
const LEGACY_FLOW = 'casperflow-flow-v3'

export const newId = () => 'ws_' + Math.random().toString(36).slice(2, 9)

export function loadStore(): WorkspaceStore | null {
  try {
    const raw = localStorage.getItem(STORAGE)
    if (raw) {
      const parsed = JSON.parse(raw) as WorkspaceStore
      if (Array.isArray(parsed.workspaces) && parsed.workspaces.length > 0) return parsed
    }
    // migrate a single legacy flow if present
    const legacy = localStorage.getItem(LEGACY_FLOW)
    if (legacy) {
      const flow = JSON.parse(legacy) as FlowData
      const id = newId()
      return { activeId: id, workspaces: [{ id, name: 'My agent', flow }] }
    }
  } catch {
    /* ignore */
  }
  return null
}

export function saveStore(store: WorkspaceStore) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(store))
  } catch {
    /* ignore */
  }
}

export function exportWorkspace(ws: Workspace): string {
  return JSON.stringify(
    { app: 'CasperFlow', version: 1, name: ws.name, flow: ws.flow },
    null,
    2,
  )
}

export function downloadJson(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.json') ? filename : `${filename}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function parseImport(text: string): { name: string; flow: FlowData } | null {
  try {
    const j = JSON.parse(text)
    const flow = j.flow ?? j
    if (!Array.isArray(flow.nodes) || !Array.isArray(flow.edges)) return null
    return { name: typeof j.name === 'string' ? j.name : 'Imported agent', flow }
  } catch {
    return null
  }
}
