import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  SelectionMode,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useUpdateNodeInternals,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import ModuleNode, { type ModuleNodeData } from './ModuleNode'
import GroupNode from './GroupNode'
import NoteNode from './NoteNode'
import ContextMenu, { type MenuState } from './ContextMenu'
import SettingsPanel, { DEFAULT_SETTINGS, type Settings } from './SettingsPanel'
import WikiPanel from './WikiPanel'
import JournalView from './JournalView'
import WorkspaceBar from './WorkspaceBar'
import TemplateGallery from './TemplateGallery'
import { type AgentTemplate, buildFromSpecs, AGENT_TEMPLATES } from './templates'
import { generateWorkflow, editWorkflow, askText, runAgent } from './ai'
import { effectiveTools } from './agentTools'
import {
  loadStore, saveStore, newId, exportWorkspace, downloadJson, parseImport,
  type Workspace, type WorkspaceStore,
} from './workspaces'
import { MODULES, CATEGORY_LABELS, CATEGORY_COLORS, moduleByType, defaultParams, substituteVars, statusOf, SIGNABLE, type ModuleCategory } from './modules'
import { agentMemory, clearAgentMemory, debugLog, setLiveSchedule, captureConsole, addRecentTx } from './runtime'
import ConsolePanel from './ConsolePanel'
import HelpHints from './HelpHints'
import NodeConfig from './NodeConfig'
import { isWalletInstalled, connectWallet, disconnectWallet, reconnectIfConnected, onWalletEvents } from './wallet'
import { sendCsprReal, delegateReal, callContractReal, awaitExecution, explorerTxUrl, hasAgentKey, getAgentPublicHex, getAgentKey, setAgentKeyFromPem, setActiveSigner } from './tx'
import { payX402OnChain } from './x402'
import { swapReal } from './swap'
import { deriveKey, loadWalletProfiles, type WalletFormat, type WalletAlgo, type WalletProfile } from './wallets'
import { buildAttestation } from './attest'
import { aiVarName, agentVarName } from './aiVars'
import { linkify } from './linkify'
import { sendTelegram, sendDiscord, isDiscordWebhook } from './notify'
import { recordJournal } from './journal'
import { fetchCsprPrice, getCsprPrice } from './price'
import { getAccountBalance, getRecentTransfers, resolveCsprName, shortKey } from './casper'
import Icon from './Icon'
import Logo from './Logo'
import PulseEdge from './PulseEdge'
import BorderSparks from './Sparks'

const nodeTypes = { module: ModuleNode, group: GroupNode, note: NoteNode }
const edgeTypes = { pulse: PulseEdge }

let idCounter = 100
const nextId = () => `n${idCounter++}`

// Walk upstream from a node to find the Wallet node it's connected to.
function findUpstreamWallet(nodeId: string, nodes: Node[], edges: Edge[]): Node | null {
  const visited = new Set<string>()
  let frontier = edges.filter((e) => e.target === nodeId).map((e) => e.source)
  while (frontier.length) {
    const next: string[] = []
    for (const sid of frontier) {
      if (visited.has(sid)) continue
      visited.add(sid)
      const node = nodes.find((n) => n.id === sid)
      if (node && (node.data as ModuleNodeData).moduleType === 'wallet') return node
      edges.filter((e) => e.target === sid).forEach((e) => next.push(e.source))
    }
    frontier = next
  }
  return null
}

// Resolve a saved wallet referenced in free text, e.g. "use wallet 3", "the treasury wallet".
// Tag freshly-built nodes so each "materializes" on screen with a staggered
// fade+zoom + electric crackle (left-to-right by x position).
function tagBornNodes(nodes: Node[]): Node[] {
  const bornAt = Date.now()
  const order = [...nodes].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0))
  const seq = new Map(order.map((n, i) => [n.id, i]))
  return nodes.map((n) => ({ ...n, data: { ...n.data, _born: bornAt, _seq: seq.get(n.id) ?? 0 } }))
}

// Format the real gas cost (motes → CSPR) with Casper 2.0's refundable note.
// On Casper 2.0 the fee is HELD for a hold period then released (99% of unspent
// gas is refunded), so the network is effectively net zero-fee.
function gasNote(cost?: number): string {
  if (cost == null || !(cost > 0)) return ''
  const cspr = cost / 1e9
  const s = cspr >= 1 ? cspr.toFixed(2) : cspr.toFixed(4)
  return ` Gas ${s} CSPR (held, refundable on Casper 2.0).`
}

function pickWalletFromText(text: string): WalletProfile | null {
  const profiles = loadWalletProfiles()
  if (!profiles.length) return null
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const nt = norm(text)
  // 1. Direct name match — prefer the longest profile name that appears in the text.
  let best: WalletProfile | null = null
  for (const p of profiles) {
    const np = norm(p.name)
    if (np && nt.includes(np) && (!best || norm(best.name).length < np.length)) best = p
  }
  if (best) return best
  // 2. "wallet N" → a profile named like "wallet3", else the Nth saved wallet.
  const m = nt.match(/wallet(\d+)/)
  if (m) {
    const byName = profiles.find((p) => norm(p.name).includes('wallet' + m[1]))
    if (byName) return byName
    const idx = Number(m[1]) - 1
    if (idx >= 0 && idx < profiles.length) return profiles[idx]
  }
  // 3. If only one wallet is saved, default to it.
  if (profiles.length === 1) return profiles[0]
  return null
}

// Resolve a recipient NAME (what the user typed, e.g. "wallet 3") to a saved
// wallet profile, tolerating partial names — the profile may be called
// "wallet 3 genesis time". Name-based ONLY: it never falls back to a positional
// or default wallet, because a wrong guess would misroute real funds.
function resolveRecipientWallet(text: string): WalletProfile | null {
  const profiles = loadWalletProfiles()
  if (!profiles.length || !text) return null
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const nt = norm(text)
  if (!nt) return null
  // 1. Exact normalized name.
  let m = profiles.find((w) => norm(w.name) === nt)
  if (m) return m
  // 2. "wallet N" → a profile whose name contains exactly walletN (so "wallet 1"
  //    never matches "wallet 12").
  const wn = nt.match(/wallet(\d+)/)
  if (wn) {
    const re = new RegExp('wallet' + wn[1] + '(?!\\d)')
    m = profiles.find((w) => re.test(norm(w.name)))
    if (m) return m
  }
  // 3. Prefix either way ("wallet3" ⊂ "wallet3genesistime", or vice versa).
  m = profiles.find(
    (w) => norm(w.name) && (norm(w.name).startsWith(nt) || nt.startsWith(norm(w.name))),
  )
  if (m) return m
  // 4. Plain substring either way — longest matching profile name wins.
  let best: WalletProfile | null = null
  for (const w of profiles) {
    const nw = norm(w.name)
    if (nw && (nw.includes(nt) || nt.includes(nw)) && (!best || norm(best.name).length < nw.length)) {
      best = w
    }
  }
  return best
}

function profileToWalletParams(p: WalletProfile): Record<string, string> {
  return {
    walletProfileId: p.id,
    walletName: p.name,
    walletPublic: p.publicHex,
    walletFormat: p.format,
    walletAlgo: p.algo,
    walletSecret: p.secret,
    walletPath: p.path ?? '',
  }
}

// Bind a chosen wallet (its full params) onto every `wallet` node in a freshly built flow.
function setWalletParamsOnNodes(nodes: Node[], wp: Record<string, string> | null): Node[] {
  if (!wp) return nodes
  return nodes.map((n) => {
    if ((n.data as ModuleNodeData).moduleType !== 'wallet') return n
    const data = n.data as ModuleNodeData
    return { ...n, data: { ...data, params: { ...(data.params ?? {}), ...wp } } }
  })
}

const isPubKeyStr = (s: string) => /^01[0-9a-fA-F]{64}$/.test(s) || /^02[0-9a-fA-F]{66}$/.test(s)
const isAcctHashStr = (s: string) => /^[0-9a-fA-F]{64}$/.test(s)

// A freshly AI-built transfer often carries a recipient as a saved-wallet NAME
// (e.g. "wallet 5"). Resolve it to a real selection — public key + name + the
// "My wallets" mode — so the Send CSPR card shows the recipient with its live
// balance instead of a raw name sitting in the public-key field. Also returns the
// public keys of every recipient, so the signer picker can refuse to bind a wallet
// the flow is paying (which would be a self-transfer Casper rejects).
function resolveRecipientsOnNodes(nodes: Node[]): { nodes: Node[]; recipientKeys: Set<string> } {
  const keys = new Set<string>()
  const out = nodes.map((n) => {
    const d = n.data as ModuleNodeData
    if (d.moduleType !== 'transfer') return n
    const p: Record<string, unknown> = { ...(d.params ?? {}) }
    const to = String(p.to ?? '').trim()
    if (to && !isPubKeyStr(to) && !isAcctHashStr(to)) {
      const w = resolveRecipientWallet(to)
      if (w) {
        p.to = w.publicHex
        p.toName = w.name
        p.toMode = 'wallet'
        keys.add(w.publicHex.toLowerCase())
        return { ...n, data: { ...d, params: p as ModuleNodeData['params'] } }
      }
    } else if (isPubKeyStr(to)) {
      keys.add(to.toLowerCase())
    }
    return n
  })
  return { nodes: out, recipientKeys: keys }
}

// Pick the SIGNER wallet for a freshly built flow. Critically it never returns a
// wallet the flow is sending TO: "Send 3 CSPR to wallet 5" makes wallet 5 the
// recipient, so the signer must be a DIFFERENT wallet. Returns null when no usable
// signer is named (the caller picks the fallback).
function pickSignerWallet(text: string, recipientKeys: Set<string>): WalletProfile | null {
  const profiles = loadWalletProfiles()
  if (!profiles.length) return null
  const notRecipient = (w: WalletProfile | null): w is WalletProfile =>
    !!w && !recipientKeys.has(w.publicHex.toLowerCase())
  const lower = text.toLowerCase()
  // 1. Explicit signer hint: "with / from / use / using / sign with wallet N".
  const ex = lower.match(/\b(?:with|from|use|using|sign(?:ing)?\s+with)\s+wallet\s*(\d+)/)
  if (ex) {
    const w = resolveRecipientWallet('wallet ' + ex[1])
    if (notRecipient(w)) return w
  }
  // 2. Any wallet named OUTSIDE a recipient clause ("to/recipient/pay/→ wallet N" removed).
  const signerText = lower
    .replace(/\b(?:to|recipient)\s+wallet\s*\d+/g, ' ')
    .replace(/\bpay\s+wallet\s*\d+/g, ' ')
    .replace(/(?:->|→)\s*wallet\s*\d+/g, ' ')
  const named = pickWalletFromText(signerText)
  if (notRecipient(named)) return named
  return null
}

// ── Geometry: does an edge (approximated by the straight chord between its
// source's right-handle and its target's left-handle) cross a selection rectangle? ──
type Pt = { x: number; y: number }
type Rect = { x: number; y: number; w: number; h: number }
const ccw = (a: Pt, b: Pt, c: Pt) => (c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x)
const segSeg = (a: Pt, b: Pt, c: Pt, d: Pt) =>
  ccw(a, c, d) * ccw(b, c, d) < 0 && ccw(a, b, c) * ccw(a, b, d) < 0
function segCrossesRect(p1: Pt, p2: Pt, r: Rect): boolean {
  const inside = (p: Pt) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
  if (inside(p1) || inside(p2)) return true
  const tl = { x: r.x, y: r.y }
  const tr = { x: r.x + r.w, y: r.y }
  const br = { x: r.x + r.w, y: r.y + r.h }
  const bl = { x: r.x, y: r.y + r.h }
  return (
    segSeg(p1, p2, tl, tr) ||
    segSeg(p1, p2, tr, br) ||
    segSeg(p1, p2, br, bl) ||
    segSeg(p1, p2, bl, tl)
  )
}
function nodeDims(n: Node): { w: number; h: number } {
  const m = (n as { measured?: { width?: number; height?: number } }).measured
  return {
    w: m?.width ?? (typeof n.width === 'number' ? n.width : 220),
    h: m?.height ?? (typeof n.height === 'number' ? n.height : 70),
  }
}

const makeNode = (id: string, x: number, y: number, moduleType: string): Node => {
  const def = moduleByType(moduleType)!
  return { id, type: 'module', position: { x, y }, data: { moduleType, params: defaultParams(def) } }
}

const templateNodes = (): Node[] => [
  makeNode('n1', 40, 160, 'schedule'),
  makeNode('n2', 320, 160, 'price'),
  makeNode('n3', 600, 160, 'ai'),
  makeNode('n4', 880, 60, 'swap'),
  makeNode('n5', 1160, 160, 'notify'),
]

const templateEdges = (): Edge[] => [
  { id: 'e1', source: 'n1', target: 'n2', type: 'pulse', animated: false, interactionWidth: 14 },
  { id: 'e2', source: 'n2', target: 'n3', type: 'pulse', animated: false, interactionWidth: 14 },
  { id: 'e3', source: 'n3', target: 'n4', type: 'pulse', animated: false, interactionWidth: 14 },
  { id: 'e4', source: 'n4', target: 'n5', type: 'pulse', animated: false, interactionWidth: 14 },
]

const STORAGE_FLOW = 'casperflow-flow-v3'
const STORAGE_SETTINGS = 'casperflow-settings-v1'
const STORAGE_PALETTE = 'casperflow-palette-w'
const STORAGE_LOG_W = 'casperflow-log-w'

export interface LogEntry {
  t: string
  kind: 'info' | 'cycle' | 'step' | 'ok' | 'warn'
  text: string
}

const now = () => new Date().toLocaleTimeString('en-GB')

const normalizeText = (s: string) =>
  s.normalize('NFC').replace(/[’ʼ]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()

const LEGACY_VALUES = new Set(
  [
    "L'écart de prix est-il significatif ?",
    "L'écart de prix est-il significatif?",
    'Ton agent a agi ✔',
    'Ton agent a agi',
    'Your agent took action ✔',
    'écart > 1 %',
    'écart > 1%',
    'api.exemple.com/market-data',
    'passe au-dessus',
    'passe en dessous',
    'sort du range',
    'Claude Haiku (rapide, éco)',
    'Claude Sonnet (précis)',
    'Agent report: action taken ✔',
  ].map(normalizeText),
)

function sanitizeNode(n: Node): Node | null {
  if (n.type === 'group') {
    const label = String((n.data as { label?: string }).label ?? 'Group')
    return { ...n, extent: undefined, data: { label } }
  }
  if (n.type === 'note') {
    const text = String((n.data as { text?: string }).text ?? '')
    return { ...n, extent: undefined, data: { text } }
  }
  const data = n.data as {
    moduleType?: string
    params?: Record<string, string | number>
    width?: unknown
  }
  const def = data.moduleType ? moduleByType(data.moduleType) : undefined
  if (!def) return null
  const clean: Record<string, string | number> = { ...defaultParams(def) }
  for (const p of def.params) {
    const v = data.params?.[p.key]
    if (v === undefined) continue
    if (typeof v === 'string' && LEGACY_VALUES.has(normalizeText(v))) continue
    if (p.type === 'select' && !p.options!.includes(String(v))) continue
    clean[p.key] = v
  }
  // Preserve custom node params not declared in def.params (e.g. the Wallet
  // node's selected wallet) so they survive save/reload/import.
  const KEEP_PREFIX = ['wallet', 'toMode', 'toName']
  for (const [k, v] of Object.entries(data.params ?? {})) {
    if (!(k in clean) && KEEP_PREFIX.some((pre) => k.startsWith(pre)) && (typeof v === 'string' || typeof v === 'number')) {
      clean[k] = v
    }
  }
  const width = typeof data.width === 'number' ? { width: data.width } : {}
  const approval =
    (data as { approval?: string }).approval === 'ask' ? { approval: 'ask' as const } : {}
  return {
    ...n,
    extent: undefined,
    data: { moduleType: data.moduleType, params: clean, ...width, ...approval },
  }
}

function cleanFlow(parsed: { nodes: Node[]; edges: Edge[] }): { nodes: Node[]; edges: Edge[] } {
  const nodes = (parsed.nodes as Node[]).map(sanitizeNode).filter((n): n is Node => n !== null)
  const ids = new Set(nodes.map((n) => n.id))
  const edges = (parsed.edges as Edge[]).filter((e) => ids.has(e.source) && ids.has(e.target))
  const maxId = nodes
    .map((n) => Number(String(n.id).replace(/\D/g, '')))
    .filter((n) => !isNaN(n))
    .reduce((a, b) => Math.max(a, b), 0)
  idCounter = Math.max(idCounter, maxId + 1)
  return { nodes, edges }
}

function initStore(): WorkspaceStore {
  const loaded = loadStore()
  if (loaded) {
    loaded.workspaces = loaded.workspaces.map((w) => ({ ...w, flow: cleanFlow(w.flow) }))
    return loaded
  }
  const id = newId()
  return {
    activeId: id,
    workspaces: [{ id, name: 'CSPR Sentinel', flow: { nodes: templateNodes(), edges: templateEdges() } }],
  }
}

const EDGE_COLORS = [
  '#7dd3fc', '#a78bfa', '#2dd4bf', '#fb923c', '#f472b6',
  '#facc15', '#4ade80', '#60a5fa', '#c084fc', '#f87171',
]

const edgeColor = (id: string) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return EDGE_COLORS[h % EDGE_COLORS.length]
}

function pushApart(nodes: Node[], fixedId: string): Node[] {
  const marginX = 42
  const marginY = 24
  const res = nodes.map((n) => ({ ...n, position: { ...n.position } }))
  const dim = (n: Node) => ({
    w: n.measured?.width ?? 250,
    h: n.measured?.height ?? 90,
  })
  const eligible = (n: Node) => n.type === 'module'
  const sameSpace = (a: Node, b: Node) => (a.parentId ?? null) === (b.parentId ?? null)
  const clampToParent = (n: Node) => {
    if (!n.parentId) return
    const d = dim(n)
    void d
    n.position.x = Math.max(n.position.x, 16)
    n.position.y = Math.max(n.position.y, 48)
  }
  for (let iter = 0; iter < 8; iter++) {
    let movedAny = false
    for (let i = 0; i < res.length; i++) {
      for (let j = i + 1; j < res.length; j++) {
        const a = res[i]
        const b = res[j]
        if (!eligible(a) || !eligible(b) || !sameSpace(a, b)) continue
        const da = dim(a)
        const db = dim(b)
        const ox = Math.min(a.position.x + da.w, b.position.x + db.w) - Math.max(a.position.x, b.position.x) + marginX
        const oy = Math.min(a.position.y + da.h, b.position.y + db.h) - Math.max(a.position.y, b.position.y) + marginY
        if (ox <= 0 || oy <= 0) continue
        const mover = a.id === fixedId ? b : b.id === fixedId ? a : b
        const other = mover === a ? b : a
        const cMover = mover.position.x + dim(mover).w / 2
        const cOther = other.position.x + dim(other).w / 2
        const cMoverY = mover.position.y + dim(mover).h / 2
        const cOtherY = other.position.y + dim(other).h / 2
        const bx = mover.position.x
        const by = mover.position.y
        if (ox < oy) {
          mover.position.x += cMover >= cOther ? ox : -ox
        } else {
          mover.position.y += cMoverY >= cOtherY ? oy : -oy
        }
        clampToParent(mover)
        const actuallyMoved =
          Math.abs(mover.position.x - bx) + Math.abs(mover.position.y - by) > 0.5
        if (!actuallyMoved && other.id !== fixedId) {
          if (ox < oy) {
            other.position.x += cOther >= cMover ? ox : -ox
          } else {
            other.position.y += cOtherY >= cMoverY ? oy : -oy
          }
          clampToParent(other)
          movedAny = true
        } else if (actuallyMoved) {
          movedAny = true
        }
      }
    }
    if (!movedAny) break
  }
  return res
}

function adoptIntoGroup(nds: Node[], nodeId: string): Node[] {
  const n = nds.find((x) => x.id === nodeId)
  if (!n || n.parentId || n.type !== 'module') return nds
  const dw = n.measured?.width ?? 250
  const dh = n.measured?.height ?? 90
  const cx = n.position.x + dw / 2
  const cy = n.position.y + dh / 2
  for (const g of nds) {
    if (g.type !== 'group') continue
    const gw = (g.style?.width as number) ?? g.measured?.width ?? 0
    const gh = (g.style?.height as number) ?? g.measured?.height ?? 0
    if (cx > g.position.x && cx < g.position.x + gw && cy > g.position.y && cy < g.position.y + gh) {
      const adopted: Node = {
        ...n,
        parentId: g.id,
        position: {
          x: Math.max(n.position.x - g.position.x, 16),
          y: Math.max(n.position.y - g.position.y, 48),
        },
      }
      return [...nds.filter((x) => x.id !== nodeId), adopted]
    }
  }
  return nds
}

function leaveGroupIfOutside(nds: Node[], nodeId: string): Node[] {
  const n = nds.find((x) => x.id === nodeId)
  if (!n?.parentId || n.type !== 'module') return nds
  const g = nds.find((x) => x.id === n.parentId)
  if (!g) return nds
  const gw = (g.style?.width as number) ?? g.measured?.width ?? 300
  const gh = (g.style?.height as number) ?? g.measured?.height ?? 200
  const w = n.measured?.width ?? 250
  const h = n.measured?.height ?? 90
  const abs = { x: g.position.x + n.position.x, y: g.position.y + n.position.y }
  const cx = abs.x + w / 2
  const cy = abs.y + h / 2
  const inside =
    cx > g.position.x && cx < g.position.x + gw && cy > g.position.y && cy < g.position.y + gh
  if (inside) return nds
  return nds.map((x) =>
    x.id === nodeId ? { ...x, parentId: undefined, extent: undefined, position: abs } : x,
  )
}

function fitGroups(nds: Node[]): Node[] {
  return nds.map((g) => {
    if (g.type !== 'group') return g
    const kids = nds.filter((n) => n.parentId === g.id)
    if (kids.length === 0) return g
    let needW = 0
    let needH = 0
    for (const k of kids) {
      const w = k.measured?.width ?? 250
      const h = k.measured?.height ?? 90
      needW = Math.max(needW, k.position.x + w + 60)
      needH = Math.max(needH, k.position.y + h + 60)
    }
    const gw = (g.style?.width as number) ?? 300
    const gh = (g.style?.height as number) ?? 200
    if (needW <= gw && needH <= gh) return g
    return {
      ...g,
      style: { ...g.style, width: Math.max(gw, needW), height: Math.max(gh, needH) },
    }
  })
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS)
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function Flow() {
  const store0 = useRef(initStore())
  const active0 = store0.current.workspaces.find((w) => w.id === store0.current.activeId)!
  const [workspaces, setWorkspaces] = useState<Workspace[]>(store0.current.workspaces)
  const [activeId, setActiveId] = useState<string>(store0.current.activeId)
  const [nodes, setNodes, onNodesChange] = useNodesState(active0.flow.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(active0.flow.edges)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [settings, setSettings] = useState<Settings>(loadSettings())
  const [showSettings, setShowSettings] = useState(false)
  const [confirmMainnet, setConfirmMainnet] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(true)
  const [showWiki, setShowWiki] = useState(false)
  const [showJournal, setShowJournal] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const [showConsole, setShowConsole] = useState(false)
  const [consoleHeight, setConsoleHeight] = useState(300)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [rightTab, setRightTab] = useState<'props' | 'log'>('log')
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [settingsTab, setSettingsTab] = useState<'interface' | 'connections' | 'logs'>('interface')

  // Capture console.warn/error + uncaught errors into the Live console, once.
  // Also restore a persisted autonomous agent key, if any.
  useEffect(() => {
    captureConsole()
    const pem = loadSettings().agentKeyPem
    if (pem) setAgentKeyFromPem(pem)
  }, [])
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [log, setLog] = useState<LogEntry[]>([
    { t: now(), kind: 'info', text: 'Welcome to CasperFlow.' },
    {
      t: now(),
      kind: 'info',
      text: 'Right-click modules and links for options. Double-click a module to configure it.',
    },
  ])
  // History of cleared logs, so an accidental "Clear" can be undone.
  const [clearedLogs, setClearedLogs] = useState<LogEntry[][]>([])
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [log])
  const [logWidth, setLogWidth] = useState<number>(() => {
    const w = Number(localStorage.getItem(STORAGE_LOG_W))
    return w >= 240 && w <= 640 ? w : 300
  })
  const startLogResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = logWidth
    document.body.style.cursor = 'col-resize'
    const move = (ev: MouseEvent) => {
      const w = Math.min(640, Math.max(240, startW + (startX - ev.clientX)))
      setLogWidth(w)
    }
    const up = () => {
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setLogWidth((w) => {
        localStorage.setItem(STORAGE_LOG_W, String(w))
        return w
      })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  const [running, setRunning] = useState(false)
  const [search, setSearch] = useState('')
  const [collapsedCats, setCollapsedCats] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('casperflow-collapsed-cats') || '[]')
    } catch {
      return []
    }
  })
  const toggleCat = (cat: string) =>
    setCollapsedCats((c) => {
      const next = c.includes(cat) ? c.filter((x) => x !== cat) : [...c, cat]
      localStorage.setItem('casperflow-collapsed-cats', JSON.stringify(next))
      return next
    })
  const [interactionMode, setInteractionMode] = useState<'pan' | 'select'>(
    () => (localStorage.getItem('casperflow-mode') === 'pan' ? 'pan' : 'select'),
  )
  const setMode = (m: 'pan' | 'select') => {
    setInteractionMode(m)
    localStorage.setItem('casperflow-mode', m)
  }
  const [paletteWidth, setPaletteWidth] = useState<number>(() => {
    const w = Number(localStorage.getItem(STORAGE_PALETTE))
    return w >= 170 && w <= 440 ? w : 218
  })
  const { screenToFlowPosition, getViewport, setViewport, fitView, zoomIn, zoomOut } = useReactFlow()
  const [locked, setLocked] = useState(false)
  const updateNodeInternals = useUpdateNodeInternals()
  const wrapper = useRef<HTMLDivElement>(null)

  const refreshInternals = (ids: string[]) => {
    requestAnimationFrame(() => {
      updateNodeInternals(ids)
      requestAnimationFrame(() => updateNodeInternals(ids))
    })
  }

  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const edgesRef = useRef(edges)
  edgesRef.current = edges
  // Selected edge ids captured at the moment a context menu opens, so right-clicking
  // never loses the selection before the user can act on it.
  const menuEdgeSelRef = useRef<string[]>([])
  // Start point (screen coords) of a box selection, to also select crossed cables.
  const selStartRef = useRef<{ x: number; y: number } | null>(null)

  // Select every edge whose chord crosses the drawn selection rectangle (flow coords).
  const selectEdgesInRect = (r: Rect, additive: boolean) => {
    const ns = nodesRef.current
    setEdges((eds) =>
      eds.map((edge) => {
        const s = ns.find((n) => n.id === edge.source)
        const t = ns.find((n) => n.id === edge.target)
        if (!s || !t) return additive ? edge : { ...edge, selected: edge.selected }
        const sd = nodeDims(s)
        const td = nodeDims(t)
        const p1 = { x: s.position.x + sd.w, y: s.position.y + sd.h / 2 }
        const p2 = { x: t.position.x, y: t.position.y + td.h / 2 }
        const hit = segCrossesRect(p1, p2, r)
        const selected = hit ? true : additive ? edge.selected : false
        return selected === edge.selected ? edge : { ...edge, selected }
      }),
    )
  }
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const runningRef = useRef(false)
  // Set by the Stop button to abort an in-flight run. The run loop checks it
  // between nodes, and the agent loop checks it between LLM turns, so a run that
  // misbehaves (or loops) can always be cancelled.
  const abortRef = useRef(false)
  const stopRun = () => {
    if (!runningRef.current) return
    abortRef.current = true
    appendLog('⏹ Stopping the run… (finishing the current step)', 'warn')
  }

  const [live, setLive] = useState(false)
  const [liveInterval, setLiveInterval] = useState('')
  const liveTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const cycleCount = useRef(0)
  const liveRef = useRef(false)
  const lastTick = useRef(0)
  const offlineNotified = useRef(false)
  // Consecutive live cycles that made no progress (guardrail blocked / errored).
  // When it reaches AUTO_STOP_AFTER, a "doer" agent stops itself automatically.
  const noProgressStreak = useRef(0)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)

  const acquireWakeLock = async () => {
    try {
      const wl = await (navigator as Navigator & {
        wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> }
      }).wakeLock?.request('screen')
      if (wl) {
        wakeLock.current = wl
        debugLog('live', 'Screen wake lock acquired (prevents display sleep)')
      }
    } catch {
      /* not available or denied — fine */
    }
  }

  const releaseWakeLock = () => {
    wakeLock.current?.release().catch(() => {})
    wakeLock.current = null
  }

  // Reacquire wake lock when returning to the tab; detect online/offline.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && liveRef.current && !wakeLock.current) {
        acquireWakeLock()
      }
    }
    const onOffline = () => {
      if (liveRef.current) {
        appendLog('Internet connection lost — cycles will pause until it returns.', 'warn')
        debugLog('live', 'Offline detected')
      }
    }
    const onOnline = () => {
      if (liveRef.current) {
        appendLog('Back online — resuming, running a catch-up cycle now.', 'ok')
        debugLog('live', 'Online again — catch-up cycle')
        offlineNotified.current = false
        cycleCount.current += 1
        runCycle(`Cycle ${cycleCount.current}`)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Wallet ──
  const [walletKey, setWalletKey] = useState<string | null>(null)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)

  const refreshWalletBalance = async (key: string) => {
    if (!settingsRef.current.csprCloudKey) return
    const info = await getAccountBalance(
      settingsRef.current.casperNet,
      settingsRef.current.csprCloudKey,
      key,
    )
    setWalletBalance(info?.balance ?? null)
  }

  const handleWalletConnect = async () => {
    if (walletKey) {
      await disconnectWallet()
      setWalletKey(null)
      setWalletBalance(null)
      return
    }
    if (!isWalletInstalled()) {
      appendLog(
        'Casper Wallet extension not found — install it from casperwallet.io, then retry.',
        'warn',
      )
      window.open('https://www.casperwallet.io/download', '_blank')
      return
    }
    const key = await connectWallet()
    if (!key) {
      appendLog('Wallet connection cancelled or failed (see Settings → Logs).', 'warn')
      return
    }
    setWalletKey(key)
    appendLog(`Wallet connected: ${shortKey(key)}`, 'ok')
    refreshWalletBalance(key)
    if (!settingsRef.current.watchedAccount) {
      setSettings((s) => ({ ...s, watchedAccount: key }))
      appendLog('Watched account set to your wallet (Settings → Casper).', 'info')
    }
  }

  useEffect(() => {
    reconnectIfConnected().then((key) => {
      if (key) {
        setWalletKey(key)
        refreshWalletBalance(key)
      }
    })
    return onWalletEvents({
      onKeyChanged: (key) => {
        setWalletKey(key)
        refreshWalletBalance(key)
        debugLog('wallet', `Active key changed: ${key.slice(0, 10)}…`)
      },
      onDisconnected: () => {
        setWalletKey(null)
        setWalletBalance(null)
        debugLog('wallet', 'Disconnected from extension')
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(
    () => () => {
      if (liveTimer.current) clearInterval(liveTimer.current)
    },
    [],
  )

  // ── History (undo/redo) ──
  const history = useRef<{ n: string; e: string }[]>([])
  const hIdx = useRef(-1)
  const restoring = useRef(false)

  useEffect(() => {
    if (restoring.current) return
    const t = setTimeout(() => {
      const snap = {
        n: JSON.stringify(nodes.map((x) => ({ ...x, selected: false, data: { ...x.data, status: undefined } }))),
        e: JSON.stringify(edges),
      }
      const last = history.current[hIdx.current]
      if (last && last.n === snap.n && last.e === snap.e) return
      history.current = history.current.slice(0, hIdx.current + 1)
      history.current.push(snap)
      if (history.current.length > 60) history.current.shift()
      hIdx.current = history.current.length - 1
    }, 350)
    return () => clearTimeout(t)
  }, [nodes, edges])

  const restore = (idx: number) => {
    const snap = history.current[idx]
    if (!snap) return
    hIdx.current = idx
    restoring.current = true
    setNodes(JSON.parse(snap.n))
    setEdges(JSON.parse(snap.e))
    setTimeout(() => {
      restoring.current = false
    }, 450)
  }

  const undo = () => hIdx.current > 0 && restore(hIdx.current - 1)
  const redo = () => hIdx.current < history.current.length - 1 && restore(hIdx.current + 1)

  // ── Toolbar actions ──
  const groupSelection = () => {
    const sel = nodesRef.current.filter((n) => n.selected && n.type === 'module' && !n.parentId)
    if (sel.length < 2) return
    const pad = 30
    const labelH = 38
    const dims = (n: Node) => ({ w: n.measured?.width ?? 250, h: n.measured?.height ?? 90 })
    const minX = Math.min(...sel.map((n) => n.position.x)) - pad
    const minY = Math.min(...sel.map((n) => n.position.y)) - pad - labelH
    const maxX = Math.max(...sel.map((n) => n.position.x + dims(n).w)) + pad
    const maxY = Math.max(...sel.map((n) => n.position.y + dims(n).h)) + pad
    const gid = nextId()
    const groupNode: Node = {
      id: gid,
      type: 'group',
      position: { x: minX, y: minY },
      style: { width: maxX - minX, height: maxY - minY },
      data: { label: 'Group' },
      selectable: true,
    }
    setNodes((nds) => [
      groupNode,
      ...nds.map((n) =>
        sel.some((s) => s.id === n.id)
          ? {
              ...n,
              parentId: gid,
              position: { x: n.position.x - minX, y: n.position.y - minY },
              selected: false,
            }
          : n,
      ),
    ])
    refreshInternals(sel.map((n) => n.id))
  }

  const ungroupById = (id: string) => {
    const g = nodesRef.current.find((n) => n.id === id && n.type === 'group')
    if (!g) return
    setNodes((nds) =>
      nds
        .filter((n) => n.id !== id)
        .map((n) =>
          n.parentId === id
            ? {
                ...n,
                parentId: undefined,
                extent: undefined,
                position: { x: n.position.x + g.position.x, y: n.position.y + g.position.y },
              }
            : n,
        ),
    )
    refreshInternals(nodesRef.current.filter((n) => n.parentId === id).map((n) => n.id))
  }

  const removeFromGroup = (id: string) => {
    const node = nodesRef.current.find((n) => n.id === id)
    if (!node?.parentId) return
    const g = nodesRef.current.find((n) => n.id === node.parentId)
    if (!g) return
    const gw = (g.style?.width as number) ?? g.measured?.width ?? 300
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? {
              ...n,
              parentId: undefined,
              extent: undefined,
              position: {
                x: g.position.x + gw + 40,
                y: g.position.y + n.position.y,
              },
            }
          : n,
      ),
    )
    refreshInternals([id])
  }

  const ungroupAllOf = (id: string) => {
    const node = nodesRef.current.find((n) => n.id === id)
    if (node?.parentId) ungroupById(node.parentId)
  }

  const ungroupSelection = () => {
    const groups = nodesRef.current.filter((n) => n.type === 'group' && n.selected)
    const gids = new Set(groups.map((g) => g.id))
    if (gids.size === 0) return
    refreshInternals(
      nodesRef.current.filter((n) => n.parentId && gids.has(n.parentId)).map((n) => n.id),
    )
    setNodes((nds) =>
      nds
        .filter((n) => !gids.has(n.id))
        .map((n) => {
          if (n.parentId && gids.has(n.parentId)) {
            const g = groups.find((x) => x.id === n.parentId)!
            return {
              ...n,
              parentId: undefined,
              position: { x: n.position.x + g.position.x, y: n.position.y + g.position.y },
            }
          }
          return n
        }),
    )
  }

  const tidy = () => {
    const mods = nodesRef.current.filter((n) => n.type === 'module' && !n.parentId)
    if (mods.length === 0) return
    const ids = new Set(mods.map((n) => n.id))
    const dims = (n: Node) => ({ w: n.measured?.width ?? 250, h: n.measured?.height ?? 90 })
    const depth = new Map<string, number>()
    mods.forEach((n) => {
      if (!edgesRef.current.some((e) => e.target === n.id && ids.has(e.source))) depth.set(n.id, 0)
    })
    for (let i = 0; i < mods.length; i++) {
      for (const e of edgesRef.current) {
        if (!ids.has(e.source) || !ids.has(e.target)) continue
        const ds = depth.get(e.source)
        if (ds !== undefined) {
          const dt = depth.get(e.target)
          if (dt === undefined || dt < ds + 1) depth.set(e.target, ds + 1)
        }
      }
    }
    mods.forEach((n) => !depth.has(n.id) && depth.set(n.id, 0))
    const cols = new Map<number, Node[]>()
    mods.forEach((n) => {
      const d = depth.get(n.id)!
      if (!cols.has(d)) cols.set(d, [])
      cols.get(d)!.push(n)
    })
    const gapX = 90
    const gapY = 46
    const sorted = [...cols.entries()].sort((a, b) => a[0] - b[0])
    const pos = new Map<string, { x: number; y: number }>()
    let x = 60
    for (const [, arr] of sorted) {
      arr.sort((a, b) => a.position.y - b.position.y)
      let y = 80
      let maxW = 0
      for (const n of arr) {
        const d = dims(n)
        pos.set(n.id, { x, y })
        y += d.h + gapY
        maxW = Math.max(maxW, d.w)
      }
      x += maxW + gapX
    }
    setNodes((nds) => nds.map((n) => (pos.has(n.id) ? { ...n, position: pos.get(n.id)! } : n)))
  }

  // Used after loading a template / AI-built flow: wait for cards to be measured,
  // auto-arrange them with proper spacing, then frame the view.
  const autoArrange = () => {
    setTimeout(() => {
      tidy()
      setTimeout(() => fitView({ padding: 0.25, duration: 400 }), 90)
    }, 160)
  }

  const duplicateSelection = () => {
    const sel = nodesRef.current.filter((n) => n.selected && n.type === 'module' && !n.parentId)
    if (sel.length === 0) return
    const clones = sel.map((n) => ({
      ...n,
      id: nextId(),
      position: { x: n.position.x + 50, y: n.position.y + 70 },
      selected: true,
      data: { ...n.data, flipped: false, status: undefined },
    }))
    setNodes((nds) => {
      const next = [...nds.map((n) => ({ ...n, selected: false })), ...clones]
      return settingsRef.current.collide
        ? fitGroups(pushApart(next, clones[0].id))
        : next
    })
  }

  const deleteSelection = () => {
    const selN = new Set(nodesRef.current.filter((n) => n.selected).map((n) => n.id))
    setNodes((nds) => nds.filter((n) => !selN.has(n.id) && !(n.parentId && selN.has(n.parentId))))
    setEdges((eds) =>
      eds.filter((e) => !e.selected && !selN.has(e.source) && !selN.has(e.target)),
    )
  }

  const addNote = () => {
    const vp = getViewport()
    const bounds = wrapper.current?.getBoundingClientRect()
    const center = screenToFlowPosition({
      x: (bounds?.left ?? 0) + (bounds?.width ?? 600) / 2,
      y: (bounds?.top ?? 0) + (bounds?.height ?? 400) / 2,
    })
    void vp
    setNodes((nds) => [
      ...nds,
      {
        id: nextId(),
        type: 'note',
        position: center,
        data: { text: '' },
      },
    ])
  }

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        redo()
      } else if (e.key === 'd') {
        e.preventDefault()
        duplicateSelection()
      } else if (e.key === 'a') {
        e.preventDefault()
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })))
      } else if (e.key === 'g') {
        e.preventDefault()
        groupSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startPaletteResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = paletteWidth
    document.body.style.cursor = 'col-resize'
    const move = (ev: MouseEvent) => {
      const w = Math.min(440, Math.max(170, startW + ev.clientX - startX))
      setPaletteWidth(w)
    }
    const up = () => {
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setPaletteWidth((w) => {
        localStorage.setItem(STORAGE_PALETTE, String(w))
        return w
      })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const s = sanitizeNode(n)
        return s ? { ...n, data: { ...n.data, ...s.data } } : n
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const cleaned = nodes.map((n) => sanitizeNode(n)).filter((n): n is Node => n !== null)
    const updated = workspaces.map((w) =>
      w.id === activeId ? { ...w, flow: { nodes: cleaned, edges } } : w,
    )
    saveStore({ activeId, workspaces: updated })
  }, [nodes, edges, workspaces, activeId])

  useEffect(() => {
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings))
  }, [settings])

  // Undo history must never cross workspaces (would corrupt the new one).
  useEffect(() => {
    history.current = []
    hIdx.current = -1
  }, [activeId])

  // Apply current edge styling (colors/animation) to a freshly loaded flow.
  const decorateEdges = (eds: Edge[]): Edge[] =>
    eds.map((e) => ({
      ...e,
      type: 'pulse',
      interactionWidth: 14,
      animated: false, // CasperFlow controls the wire look itself (PulseEdge)
      data: {
        ...(e.data ?? {}),
        animated: settingsRef.current.animated,
        dashed: settingsRef.current.edgeStyle !== 'solid',
      },
      style: settingsRef.current.coloredEdges
        ? { stroke: edgeColor(e.id), strokeWidth: 2 }
        : undefined,
    }))

  // ── Workspace management ──
  const snapshotCurrent = (): Workspace[] => {
    const cleaned = nodesRef.current
      .map((n) => sanitizeNode(n))
      .filter((n): n is Node => n !== null)
    return workspaces.map((w) =>
      w.id === activeId ? { ...w, flow: { nodes: cleaned, edges: edgesRef.current } } : w,
    )
  }

  const switchWorkspace = (id: string) => {
    if (id === activeId) return
    if (live) stopLive()
    const list = snapshotCurrent()
    const target = list.find((w) => w.id === id)
    if (!target) return
    setWorkspaces(list)
    setActiveId(id)
    const f = cleanFlow(target.flow)
    setNodes(f.nodes)
    setEdges(decorateEdges(f.edges))
    clearAgentMemory()
    debugLog('workspace', `Switched to "${target.name}" (memory cleared)`)
    setLog([{ t: now(), kind: 'info', text: `Switched to "${target.name}".` }])
  }

  const createWorkspace = () => setShowGallery(true)

  const aiCfg = () =>
    settingsRef.current.aiKey
      ? {
          provider: settingsRef.current.aiProvider,
          apiKey: settingsRef.current.aiKey,
          model: settingsRef.current.aiModel,
          baseUrl: settingsRef.current.aiBaseUrl,
        }
      : null

  const moduleCatalog = () =>
    MODULES.map((m) => {
      const ps = m.params
        .map((p) =>
          p.type === 'select' && p.options
            ? `${p.key}=[${p.options.join('|')}]`
            : `${p.key}:${p.type}`,
        )
        .join(', ')
      let eg = ''
      try {
        eg = m.describe(defaultParams(m))
      } catch {
        /* some describes need run context — skip the example */
      }
      return `- ${m.type} (${m.category}): ${m.label}${eg ? ` [e.g. "${eg}"]` : ''}${ps ? ` — params: ${ps}` : ''}`
    }).join('\n')

  const buildWithAI = async (description: string) => {
    const cfg = aiCfg()
    let result: { name: string; steps: { type: string; params?: Record<string, string | number> }[] } | null = null
    if (cfg) {
      result = await generateWorkflow(cfg, description, moduleCatalog())
    }
    if (!result || result.steps.length === 0) {
      appendLog(
        cfg
          ? 'AI could not build that — try rephrasing, or pick a template.'
          : 'No AI key set (Settings → AI). Add one to build from a description.',
        'warn',
      )
      return
    }
    const flow = buildFromSpecs(result.steps)
    if (flow.nodes.length === 0) {
      appendLog('AI returned no valid actions — try rephrasing.', 'warn')
      return
    }
    // Resolve any saved-wallet recipient NAME into a real selection (key + balance),
    // then bind a SIGNER — but ONLY a wallet the user explicitly named. We never
    // auto-pick the paying wallet: spending real funds from a wallet the user did
    // not choose is exactly the kind of silent guess we must not make. If no signer
    // is named, the Wallet card is left on "Select a wallet" and we say so.
    const resolved = resolveRecipientsOnNodes(flow.nodes)
    flow.nodes = resolved.nodes
    const signer = pickSignerWallet(description, resolved.recipientKeys)
    const hasWalletNode = flow.nodes.some((n) => (n.data as ModuleNodeData).moduleType === 'wallet')
    if (signer && hasWalletNode) {
      flow.nodes = setWalletParamsOnNodes(flow.nodes, profileToWalletParams(signer))
      debugLog('ai', `Bound signer wallet "${signer.name}" (recipients excluded)`)
    }
    const needsWalletChoice = hasWalletNode && !signer
    setWalletMissing(needsWalletChoice)
    flow.nodes = tagBornNodes(flow.nodes)
    setShowGallery(false)
    const list = snapshotCurrent()
    const id = newId()
    const ws: Workspace = { id, name: result.name, flow }
    setWorkspaces([...list, ws])
    switchWorkspaceTo(id, [...list, ws])
    autoArrange()
    debugLog('ai', `Built "${result.name}" from prompt (${flow.nodes.length} nodes)`)
    setLog([
      { t: now(), kind: 'ok', text: `Built "${result.name}" from your description — review the cards and Run.` },
      ...(needsWalletChoice
        ? [
            {
              t: now(),
              kind: 'warn' as const,
              text: 'You did not say which wallet pays. Open the Wallet card and choose the paying wallet before you Run.',
            },
          ]
        : []),
    ])
    // Let the build cascade + electric wave finish before the "agent ready"
    // popup appears (matches the node born window).
    setTimeout(() => {
      if (!liveRef.current) setGoLivePrompt(true)
    }, 2300)
  }

  const [cmdValue, setCmdValue] = useState('')
  const [cmdBusy, setCmdBusy] = useState(false)
  const cmdRef = useRef<HTMLTextAreaElement>(null)
  const resizeCmd = () => {
    const el = cmdRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(180, el.scrollHeight)}px`
  }
  useEffect(resizeCmd, [cmdValue])
  const [goLivePrompt, setGoLivePrompt] = useState(false)
  // True when a freshly built/edited flow signs CSPR but no paying wallet is
  // selected yet. The "ready" popup then asks the user to choose a wallet instead
  // of offering Run / Go live (the agent cannot run without a signer).
  const [walletMissing, setWalletMissing] = useState(false)
  const [autoSign, setAutoSign] = useState(true)
  const autoSignRef = useRef(true)
  type ApprovalInfo = {
    action: string
    detail: string
    from: string
    net: 'testnet' | 'mainnet'
    wallet: string
    index: number
    total: number
  }
  const [pendingApproval, setPendingApproval] = useState<ApprovalInfo | null>(null)
  const approvalResolveRef = useRef<((ok: boolean) => void) | null>(null)
  const requestApproval = (info: ApprovalInfo) =>
    new Promise<boolean>((resolve) => {
      approvalResolveRef.current = resolve
      setPendingApproval(info)
    })
  const resolveApproval = (ok: boolean) => {
    approvalResolveRef.current?.(ok)
    approvalResolveRef.current = null
    setPendingApproval(null)
  }

  const describeCurrentFlow = (): string => {
    const mods = nodesRef.current.filter((n) => n.type === 'module')
    if (mods.length === 0) return '(empty canvas)'
    const byId = new Map(mods.map((n) => [n.id, n]))
    // order by simple left-to-right then list
    const ordered = [...mods].sort((a, b) => a.position.x - b.position.x)
    void byId
    return ordered
      .map((n, i) => {
        const d = n.data as ModuleNodeData
        const def = moduleByType(d.moduleType)
        const params = d.params ? JSON.stringify(d.params) : '{}'
        return `${i + 1}. ${d.moduleType} ${params}`
      })
      .join('\n')
  }

  const runAiCommand = async () => {
    const instruction = cmdValue.trim()
    if (!instruction || cmdBusy) return
    const cfg = aiCfg()
    if (!cfg) {
      appendLog('Connect a model in Settings → AI to use the AI command bar.', 'warn')
      return
    }
    setCmdBusy(true)
    appendLog(`AI command: "${instruction}"`, 'info')
    const res = await editWorkflow(cfg, describeCurrentFlow(), instruction, moduleCatalog())
    setCmdBusy(false)
    if (!res || res.steps.length === 0) {
      appendLog('AI could not apply that — try rephrasing.', 'warn')
      return
    }
    const flow = buildFromSpecs(res.steps)
    if (flow.nodes.length === 0) {
      appendLog('AI returned no valid actions — try rephrasing.', 'warn')
      return
    }
    // Resolve recipient names to real selections (key + balance), then bind a SIGNER
    // that is never a recipient: a wallet explicitly named in the instruction wins;
    // otherwise keep the wallet already selected on the canvas. Never auto-pick the
    // recipient as the signer (that was the self-transfer bug).
    const resolved = resolveRecipientsOnNodes(flow.nodes)
    const signer = pickSignerWallet(instruction, resolved.recipientKeys)
    let wp: Record<string, string> | null = signer ? profileToWalletParams(signer) : null
    if (!wp) {
      const cur = nodesRef.current.find((n) => (n.data as ModuleNodeData).moduleType === 'wallet')
      const cp = cur?.data ? (cur.data as ModuleNodeData).params : undefined
      if (cp && typeof cp.walletSecret === 'string' && cp.walletSecret) wp = cp as Record<string, string>
    }
    if (signer) debugLog('ai', `Bound signer wallet "${signer.name}" (recipients excluded)`)
    const boundNodes = tagBornNodes(setWalletParamsOnNodes(resolved.nodes, wp))
    const hasWallet = boundNodes.some((n) => (n.data as ModuleNodeData).moduleType === 'wallet')
    const hasSigner = boundNodes.some((n) => {
      const d = n.data as ModuleNodeData
      return d.moduleType === 'wallet' && !!String(d.params?.walletSecret || '')
    })
    setWalletMissing(hasWallet && !hasSigner)
    setNodes(boundNodes)
    setEdges(decorateEdges(flow.edges))
    autoArrange()
    setCmdValue('')
    appendLog(res.note ? `✓ ${res.note}` : '✓ Workflow updated.', 'ok')
    // Let the build cascade + electric wave finish before the popup appears.
    setTimeout(() => {
      if (!liveRef.current) setGoLivePrompt(true)
    }, 2300)
    debugLog('ai', `Edited workflow via command: "${instruction}"`)
  }

  const explainRun = async () => {
    const cfg = aiCfg()
    if (!cfg) {
      appendLog('Connect a model in Settings → AI to explain runs.', 'warn')
      return
    }
    const recent = log.slice(-25).map((e) => `${e.t} ${e.text}`).join('\n')
    appendLog('Asking AI to explain this run…', 'info')
    const summary = await askText(
      cfg,
      'You explain an automation agent run to a non-technical user in 2-3 short sentences. Be concrete and plain.',
      `Here is the execution log:\n${recent}`,
    )
    appendLog(summary ? `Explanation: ${summary}` : 'Could not generate an explanation (check Settings → AI).', summary ? 'ok' : 'warn')
  }

  const createFromTemplate = (t: AgentTemplate) => {
    setShowGallery(false)
    const list = snapshotCurrent()
    const id = newId()
    const flow = t.build()
    const ws: Workspace = {
      id,
      name: t.id === 'blank' ? `Untitled ${list.length + 1}` : t.name,
      flow,
    }
    setWorkspaces([...list, ws])
    switchWorkspaceTo(id, [...list, ws])
    if (flow.nodes.length > 0) autoArrange()
    debugLog('workspace', `Created "${ws.name}" from template "${t.id}"`)
    setLog([
      {
        t: now(),
        kind: 'info',
        text:
          t.id === 'blank'
            ? 'New empty workspace. Drag actions to build your agent.'
            : `Loaded template "${t.name}". Configure the cards, then Run or Go live.`,
      },
    ])
  }

  const renameWorkspace = (id: string, name: string) =>
    setWorkspaces((ws) => ws.map((w) => (w.id === id ? { ...w, name } : w)))

  const duplicateWorkspace = (id: string) => {
    const list = snapshotCurrent()
    const src = list.find((w) => w.id === id)
    if (!src) return
    const nid = newId()
    const copy: Workspace = {
      id: nid,
      name: `${src.name} copy`,
      flow: JSON.parse(JSON.stringify(src.flow)),
    }
    setWorkspaces([...list, copy])
    switchWorkspaceTo(nid, [...list, copy])
  }

  const switchWorkspaceTo = (id: string, list: Workspace[]) => {
    const target = list.find((w) => w.id === id)
    if (!target) return
    setActiveId(id)
    const f = cleanFlow(target.flow)
    setNodes(f.nodes)
    setEdges(decorateEdges(f.edges))
    clearAgentMemory()
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 60)
  }

  const deleteWorkspace = (id: string) => {
    const list = snapshotCurrent().filter((w) => w.id !== id)
    if (list.length === 0) return
    setWorkspaces(list)
    if (id === activeId) switchWorkspaceTo(list[0].id, list)
  }

  const exportCurrent = () => {
    const ws = snapshotCurrent().find((w) => w.id === activeId)
    if (!ws) return
    downloadJson(ws.name.replace(/\s+/g, '-').toLowerCase(), exportWorkspace(ws))
    appendLog(`Exported "${ws.name}" as JSON.`, 'ok')
  }

  const importFromFile = () => fileInputRef.current?.click()

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const parsed = parseImport(String(reader.result))
      if (!parsed) {
        appendLog('Import failed — not a valid CasperFlow JSON file.', 'warn')
        return
      }
      const list = snapshotCurrent()
      const id = newId()
      const ws: Workspace = { id, name: parsed.name, flow: cleanFlow(parsed.flow) }
      setWorkspaces([...list, ws])
      switchWorkspaceTo(id, [...list, ws])
      debugLog('import', `Imported workspace "${parsed.name}" (${ws.flow.nodes.length} nodes)`)
      appendLog(`Imported "${parsed.name}".`, 'ok')
      const codeNodes = ws.flow.nodes.filter(
        (n) => (n.data as { moduleType?: string }).moduleType === 'code',
      ).length
      if (codeNodes > 0) {
        appendLog(
          `Security: this import contains ${codeNodes} Custom code action${codeNodes > 1 ? 's' : ''}. Review the code (double-click the card) before running.`,
          'warn',
        )
      }
    }
    reader.readAsText(file)
  }

  useEffect(() => {
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        type: 'pulse',
        animated: false,
        data: {
          ...(e.data ?? {}),
          animated: settings.animated,
          dashed: settings.edgeStyle !== 'solid',
        },
        style: settings.coloredEdges
          ? { stroke: edgeColor(e.id), strokeWidth: 2 }
          : undefined,
      })),
    )
  }, [settings.animated, settings.coloredEdges, settings.edgeStyle, setEdges])

  // Electric pulse: a wire lights up while data flows through it — i.e. its
  // source node has finished and its target node is currently executing.
  // Drives the solid-glow + travelling-spark look in PulseEdge.
  useEffect(() => {
    const statusOf = new Map(
      nodes.map((n) => [n.id, (n.data as ModuleNodeData).status]),
    )
    setEdges((eds) => {
      let changed = false
      const next = eds.map((e) => {
        const active =
          statusOf.get(e.source) === 'done' && statusOf.get(e.target) === 'running'
        const cur = !!(e.data as { active?: boolean } | undefined)?.active
        if (active === cur) return e
        changed = true
        return { ...e, data: { ...(e.data ?? {}), active } }
      })
      return changed ? next : eds
    })
  }, [nodes, setEdges])

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) => {
        const next = addEdge(
          { ...connection, type: 'pulse', animated: false, interactionWidth: 14 },
          eds,
        )
        return next.map((e) => ({
          ...e,
          type: 'pulse',
          animated: false,
          data: {
            ...(e.data ?? {}),
            animated: settings.animated,
            dashed: settings.edgeStyle !== 'solid',
          },
          style: settings.coloredEdges
            ? { stroke: edgeColor(e.id), strokeWidth: 2 }
            : undefined,
        }))
      }),
    [setEdges, settings.animated, settings.coloredEdges, settings.edgeStyle],
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const moduleType = event.dataTransfer.getData('application/casperflow')
      if (!moduleType) return
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const id = nextId()
      setNodes((nds) => {
        const node = makeNode(id, position.x, position.y, moduleType)
        const def = moduleByType(moduleType)
        if (def && SIGNABLE(def.category)) {
          ;(node.data as ModuleNodeData).approval = settings.defaultSigning
        }
        const next = [...nds, node]
        return settings.collide ? pushApart(next, id) : next
      })
    },
    [screenToFlowPosition, setNodes, settings.collide, settings.defaultSigning],
  )

  const menuAt = (event: React.MouseEvent, kind: MenuState['kind'], id?: string) => {
    event.preventDefault()
    const bounds = wrapper.current?.getBoundingClientRect()
    if (!bounds) return
    setMenu({
      kind,
      id,
      x: Math.min(event.clientX - bounds.left, bounds.width - 190),
      y: Math.min(event.clientY - bounds.top, bounds.height - 130),
    })
  }

  const flipNode = (id: string) =>
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, flipped: true } } : n)),
    )

  const duplicateNode = (id: string) => {
    const node = nodes.find((n) => n.id === id)
    if (!node) return
    const newId = nextId()
    setNodes((nds) => {
      const next = [
        ...nds,
        {
          ...node,
          id: newId,
          position: { x: node.position.x + 40, y: node.position.y + 70 },
          selected: false,
          data: { ...node.data, flipped: false },
        },
      ]
      return fitGroups(settings.collide ? pushApart(next, newId) : next)
    })
  }

  const deleteNode = (id: string) => {
    setNodes((nds) => {
      const target = nds.find((n) => n.id === id)
      let out = nds.filter((n) => n.id !== id)
      if (target?.type === 'group') {
        out = out.map((n) =>
          n.parentId === id
            ? {
                ...n,
                parentId: undefined,
                position: {
                  x: n.position.x + target.position.x,
                  y: n.position.y + target.position.y,
                },
              }
            : n,
        )
      }
      return out
    })
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
  }

  const deleteEdge = (id: string) => setEdges((eds) => eds.filter((e) => e.id !== id))
  const deleteSelectedEdges = () => {
    const captured = menuEdgeSelRef.current
    const ids = new Set(
      captured.length ? captured : edgesRef.current.filter((e) => e.selected).map((e) => e.id),
    )
    setEdges((eds) => eds.filter((e) => !ids.has(e.id)))
  }
  const deleteAllEdges = () => setEdges([])
  const selectAllEdges = () => setEdges((eds) => eds.map((e) => ({ ...e, selected: true })))

  const resetTemplate = () => {
    setNodes(templateNodes())
    setEdges(templateEdges())
    setLog([{ t: now(), kind: 'info', text: '"CSPR Sentinel" template reloaded.' }])
  }

  const clearCanvas = () => {
    setNodes([])
    setEdges([])
    setLog([
      {
        t: now(),
        kind: 'info',
        text: 'Canvas cleared. Drag modules from the palette to build your agent.',
      },
    ])
  }

  const setNodeStatus = (id: string, status: ModuleNodeData['status']) =>
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, status } } : n)),
    )

  const appendLog = (text: string, kind: LogEntry['kind'] = 'step') => {
    setLog((l) => [...l, { t: now(), kind, text }])
    debugLog('run', text) // mirror into the Live console
  }

  // Actions that DO something on-chain (vs. read/monitor steps). Used to tell a
  // "doer" agent (payroll, DCA) from a pure monitor, for the live auto-stop below.
  const DOER_TYPES = new Set([
    'transfer', 'stake', 'callcontract', 'attest', 'x402', 'swap',
  ])

  // Returns true if the cycle "made progress": a monitor (no doer actions) always
  // counts as progress; a doer counts only when at least one on-chain action
  // actually executed. The live loop uses this to auto-stop a guardrail agent that
  // keeps getting blocked (e.g. treasury fell below the threshold and can't recover).
  const runCycle = async (cycleLabel?: string): Promise<boolean> => {
    if (runningRef.current) return true
    runningRef.current = true
    abortRef.current = false
    setRunning(true)
    let flowHasDoer = false
    let didAct = false
    // try/finally guarantees the agent never freezes if any action throws.
    try {
    if (cycleLabel) {
      appendLog(cycleLabel, 'cycle')
    } else {
      setLog([{ t: now(), kind: 'cycle', text: 'Manual run' }])
    }
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, status: 'idle' } })))
    await new Promise((r) => setTimeout(r, 300))

    const currentNodes = nodesRef.current
    const currentEdges = edgesRef.current
    flowHasDoer = currentNodes.some((n) =>
      DOER_TYPES.has((n.data as ModuleNodeData).moduleType),
    )
    const triggers = currentNodes.filter((n) => {
      const def = moduleByType((n.data as ModuleNodeData).moduleType)
      return def?.category === 'trigger' && !currentEdges.some((e) => e.target === n.id)
    })

    // No trigger? Start from any root action (no incoming edge) so a simple flow
    // like Wallet → Send CSPR can run once on demand.
    const starts =
      triggers.length > 0
        ? triggers
        : currentNodes.filter((n) => {
            const def = moduleByType((n.data as ModuleNodeData).moduleType)
            return (
              !!def &&
              n.type === 'module' &&
              !currentEdges.some((e) => e.target === n.id)
            )
          })

    if (starts.length === 0) {
      appendLog('Nothing to run — add an action (and connect it).', 'warn')
      setRunning(false)
      runningRef.current = false
      return true
    }

    const visited = new Set<string>()
    const queue: string[] = starts.map((t) => t.id)
    const bag: Record<string, string | number> = {
      ...agentMemory,
      time: now(),
      date: new Date().toLocaleDateString('en-GB'),
    }
    // Make {{price}} available everywhere (even without a Price node) so AI
    // questions and messages always see the live CSPR price.
    const livePrice = (await fetchCsprPrice()) ?? getCsprPrice()
    if (livePrice !== null) bag.price = livePrice
    if (walletBalance !== null) bag.balance = Number(walletBalance.toFixed(2))

    // Reset the signer at the start of EVERY run, then restore only a DELIBERATE
    // Settings agent key (headless autonomous mode). This way a flow signs ONLY
    // with a Wallet node it actually contains (or that explicit Settings key) —
    // it never silently reuses a leftover signer or picks a random saved wallet.
    const hasWalletNode = currentNodes.some(
      (n) => (n.data as ModuleNodeData).moduleType === 'wallet',
    )
    setActiveSigner(null)
    const persistedAgentKey = settingsRef.current.agentKeyPem
    if (persistedAgentKey) setAgentKeyFromPem(persistedAgentKey)

    // For the approval modal's "transaction X of N" counter.
    const totalSignable = currentNodes.filter(
      (n) =>
        n.type === 'module' &&
        ['transfer', 'stake', 'callcontract', 'attest', 'x402', 'swap'].includes((n.data as ModuleNodeData).moduleType),
    ).length
    let approvalSeq = 0

    // ── Spend-limit guardrail ────────────────────────────────────────────────
    // A "Spend limit" node arms a budget cap; every real paying action below
    // checks it via enforceSpend() and is blocked if it would push spend over
    // the cap. Daily / all-time totals persist in agentMemory across runs.
    let spendCapCspr: number | null = null
    let spendWindow: 'This run' | 'Day' | 'All time' = 'Day'
    let spentThisRun = 0
    // The REAL spend baseline: how much the connected wallet has ACTUALLY sent
    // on-chain for the window (queried from CSPR.cloud when the limit arms). The
    // cap is measured against this real wallet spending + whatever this run adds —
    // so it's a true wallet-based limit, not an app-internal counter.
    let spendBaseline: number | null = null
    // Fallback only (when there is no CSPR.cloud key / the query fails): a local,
    // date-keyed counter in localStorage so "per day" still survives reloads.
    const SPEND_KEY = 'casperflow-spend-v1'
    const todayStr = () => new Date().toISOString().slice(0, 10)
    const readSpendRec = (): { date: string; today: number; total: number } => {
      try {
        const r = JSON.parse(localStorage.getItem(SPEND_KEY) || '{}')
        return { date: String(r.date || ''), today: Number(r.today || 0), total: Number(r.total || 0) }
      } catch {
        return { date: '', today: 0, total: 0 }
      }
    }
    const writeSpendRec = (r: { date: string; today: number; total: number }) => {
      try {
        localStorage.setItem(SPEND_KEY, JSON.stringify(r))
      } catch {
        /* storage unavailable — degrade to per-run only */
      }
    }
    const spentToday = (): number => {
      const r = readSpendRec()
      if (r.date !== todayStr()) {
        r.date = todayStr()
        r.today = 0
        writeSpendRec(r)
      }
      return r.today
    }
    // Read the connected wallet's real on-chain outgoing spend for the window.
    const getWalletSpent = async (account: string): Promise<number | null> => {
      const key = settingsRef.current.csprCloudKey || ''
      if (!key || !account) return null
      const transfers = await getRecentTransfers(settingsRef.current.casperNet, key, account, 100)
      if (!transfers) return null
      const today = todayStr()
      let sum = 0
      for (const t of transfers) {
        if (!t.out) continue
        if (spendWindow === 'Day' && !String(t.timestamp).startsWith(today)) continue
        sum += t.amount
      }
      return sum
    }
    const priorSpend = (): number => {
      if (spendWindow === 'This run') return spentThisRun
      // Real wallet spend (from chain) + what this run has added but the chain
      // hasn't indexed yet. Falls back to the local counter if the query failed.
      if (spendBaseline != null) return spendBaseline + spentThisRun
      return spendWindow === 'All time' ? readSpendRec().total : spentToday()
    }
    const enforceSpend = (amountCspr: number, label: string): boolean => {
      if (spendCapCspr == null || !(amountCspr > 0)) return true
      const prior = priorSpend()
      if (prior + amountCspr > spendCapCspr + 1e-9) {
        const wouldReach = prior + amountCspr
        appendLog(
          `🛡️ Spend limit reached — ${label} of ${amountCspr} CSPR blocked. Already spent ${prior.toFixed(2)} CSPR; this would reach ${wouldReach.toFixed(2)} CSPR, over your ${spendCapCspr} CSPR / ${spendWindow.toLowerCase()} cap. Raise the limit above ${wouldReach.toFixed(2)} CSPR to allow it.`,
          'warn',
        )
        bag.spendblocked = (Number(bag.spendblocked) || 0) + 1
        return false
      }
      return true
    }
    const recordSpend = (amountCspr: number): void => {
      if (!(amountCspr > 0)) return
      spentThisRun += amountCspr
      const r = readSpendRec()
      if (r.date !== todayStr()) {
        r.date = todayStr()
        r.today = 0
      }
      r.today += amountCspr
      r.total += amountCspr
      writeSpendRec(r)
      bag.spendtotalrun = Number(spentThisRun.toFixed(4))
    }

    while (queue.length > 0) {
      // User pressed Stop: abandon the rest of the flow cleanly.
      if (abortRef.current) {
        appendLog('⏹ Run stopped by you. No further steps were taken.', 'warn')
        break
      }
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      const node = currentNodes.find((n) => n.id === id)
      if (!node) continue
      const data = node.data as ModuleNodeData
      const def = moduleByType(data.moduleType)
      if (!def) continue

      setNodeStatus(id, 'running')
      await new Promise((r) => setTimeout(r, 700))

      const rawParams = { ...defaultParams(def), ...(data.params ?? {}) }
      const params: typeof rawParams = {}
      for (const [k, v] of Object.entries(rawParams)) {
        params[k] = typeof v === 'string' ? substituteVars(v, bag) : v
      }

      // "Read balance" always targets the connected wallet's real public key —
      // never whatever the generator may have typed into the account field
      // (which can be malformed and cause an HTTP 400 from CSPR.cloud).
      if (data.moduleType === 'readbalance') {
        // Prefer the wallet wired upstream; otherwise fall back to ANY wallet node
        // in the flow (the generator sometimes places the Wallet node later), so
        // "Read balance" always reflects the wallet that actually signs.
        const wnode =
          findUpstreamWallet(id, currentNodes, currentEdges) ||
          currentNodes.find((n) => (n.data as ModuleNodeData).moduleType === 'wallet')
        const wpub = wnode
          ? String((wnode.data as ModuleNodeData).params?.walletPublic || '')
          : ''
        if (wpub) params.account = wpub
        else if (bag.walletpublic) params.account = String(bag.walletpublic)
      }

      // Auto-append the transaction link to alerts after a real on-chain action.
      if ((data.moduleType === 'notify' || data.moduleType === 'discord') && bag.txurl) {
        const msg = String(params.message || '')
        if (!msg.includes(String(bag.txurl))) {
          params.message = msg ? `${msg}\n🔗 ${bag.txurl}` : `🔗 ${bag.txurl}`
        }
      }

      // ── Wallet node: a connection point. The signable action it feeds into
      // loads its key (see below). Here we just report its status. ──
      if (data.moduleType === 'wallet') {
        const name = String(params.walletName || '')
        const pubHex = String(params.walletPublic || '')
        const has = !!String(params.walletSecret || '')
        // Read THIS wallet's real on-chain balance so downstream steps (AI gate,
        // conditions, messages) can use {{balance}} / {{walletbalance}}.
        if (pubHex) {
          bag.walletpublic = pubHex
          const info = await getAccountBalance(
            settingsRef.current.casperNet,
            settingsRef.current.csprCloudKey || '',
            pubHex,
          )
          if (info) {
            bag.balance = Number(info.balance.toFixed(2))
            bag.walletbalance = bag.balance
          }
        }
        appendLog(
          has
            ? `Wallet "${name || 'wallet'}" ready (${bag.walletbalance != null ? bag.walletbalance + ' CSPR' : 'balance n/a'}), connected actions will sign with it.`
            : `Wallet: no wallet selected — pick one on the card.`,
          has ? 'info' : 'warn',
        )
        setNodeStatus(id, 'done')
        currentEdges.filter((e) => e.source === id).forEach((e) => queue.push(e.target))
        continue
      }

      // ── Spend limit node: arm the budget cap for the rest of this run ──
      if (data.moduleType === 'spendlimit') {
        spendCapCspr = Number(params.max) || 0
        const w = String(params.window || 'Day')
        spendWindow = w === 'This run' || w === 'All time' ? w : 'Day'
        // Read the connected wallet's REAL on-chain spend for the window, so the
        // cap is measured against what the wallet has actually sent — a true
        // wallet-based limit. (Skipped for "This run", which is per-execution.)
        if (spendWindow !== 'This run') {
          const wnode = currentNodes.find(
            (n) => (n.data as ModuleNodeData).moduleType === 'wallet',
          )
          const wpub = String(
            (wnode?.data as ModuleNodeData | undefined)?.params?.walletPublic ||
              bag.walletpublic ||
              '',
          )
          if (wpub) {
            const onchain = await getWalletSpent(wpub)
            if (onchain != null) {
              spendBaseline = onchain
              appendLog(
                `🛡️ Spend limit: wallet has sent ${onchain.toFixed(2)} CSPR on-chain ${spendWindow === 'Day' ? 'today' : 'in total'} (read from chain).`,
                'info',
              )
            }
          }
        }
        appendLog(
          `🛡️ Spend limit armed: ≤ ${spendCapCspr} CSPR per ${spendWindow.toLowerCase()} (already spent ${priorSpend().toFixed(2)}). Payments above the cap will be blocked.`,
          'info',
        )
        bag.spendcap = spendCapCspr
        setNodeStatus(id, 'done')
        currentEdges.filter((e) => e.source === id).forEach((e) => queue.push(e.target))
        continue
      }

      // ── Real on-chain execution (testnet) for Live actions ──
      // We always sign LOCALLY with the wallet's key (no browser extension needed,
      // so the extension's connected account is irrelevant). "Manual" just adds an
      // in-app approval dialog before signing.
      let needsApproval = false
      let walletNameForAction = ''
      // 1) Use the Wallet node connected UPSTREAM to this signable action.
      if (
        settingsRef.current.liveExecution &&
        ['transfer', 'stake', 'callcontract', 'attest', 'x402', 'swap', 'agent'].includes(data.moduleType)
      ) {
        const wnode = findUpstreamWallet(id, currentNodes, currentEdges)
        if (wnode) {
          const wp = (wnode.data as ModuleNodeData).params || {}
          const wname = String(wp.walletName || 'wallet')
          walletNameForAction = wname
          // Approval comes from the connected Wallet's mode (or the go-live toggle).
          // An Autonomous Agent on an Autonomous wallet signs with no prompt at all
          // (even on Run once) — that is the whole point of an autonomous agent.
          needsApproval =
            data.moduleType === 'agent'
              ? String(wp.mode) === 'manual'
              : !autoSignRef.current || String(wp.mode) === 'manual'
          const wsecret = String(wp.walletSecret || '')
          if (!wsecret) {
            setActiveSigner(null)
          } else {
            try {
              const key = await deriveKey(
                (String(wp.walletFormat) as WalletFormat) || 'pem',
                wsecret,
                (String(wp.walletAlgo) as WalletAlgo) || 'ed25519',
                String(wp.walletPath || ''),
              )
              setActiveSigner(key, String(wp.walletPublic) || undefined)
              appendLog(`${def.label}: using connected wallet "${wname}".`, 'info')
            } catch (e) {
              setActiveSigner(null)
              appendLog(
                `${def.label}: wallet "${wname}" key error — ${e instanceof Error ? e.message : 'error'}`,
                'warn',
              )
            }
          }
        } else if (hasWalletNode) {
          setActiveSigner(null)
          appendLog(
            `${def.label}: not connected to a Wallet — link a Wallet node before it to sign.`,
            'warn',
          )
        }
      }
      // (No silent fallback: a signable action must have a Wallet node connected
      // to it — or a deliberate Settings agent key. Otherwise it warns + skips,
      // rather than picking a random saved wallet.)
      // Sign with the autonomous agent key if loaded (no popup), else the wallet.
      const autonomous = hasAgentKey()
      const signerHex = autonomous ? getAgentPublicHex() : walletKey
      const signMsg = autonomous ? 'signing autonomously (no popup)…' : 'confirm in your wallet…'
      // A signable action with NO connected wallet (and no Settings agent key)
      // must NOT send anything. Warn, mark the node failed, and stop the branch so
      // no downstream step (e.g. a "done!" notification) runs on a non-action.
      if (
        settingsRef.current.liveExecution &&
        !signerHex &&
        ['transfer', 'stake', 'callcontract', 'attest', 'x402', 'swap'].includes(data.moduleType)
      ) {
        appendLog(
          `${def.label}: no Wallet connected — connect a Wallet node before this action. Nothing was sent.`,
          'warn',
        )
        setNodeStatus(id, 'error')
        appendLog('↳ Branch stops here.', 'warn')
        continue
      }
      if (settingsRef.current.liveExecution && signerHex) {
        const net = settingsRef.current.casperNet
        // Poll the node for the real execution result and report Success / Failed —
        // submission alone doesn't mean the transaction succeeded on-chain.
        let lastGas: { cost?: number; limit?: number; consumed?: number; refund?: number } = {}
        const confirmTx = async (label: string, hash: string): Promise<boolean> => {
          appendLog(`Confirming ${label} on-chain…`, 'info')
          const exec = await awaitExecution(net, hash)
          lastGas = { cost: exec.cost, limit: exec.limit, consumed: exec.consumed, refund: exec.refund }
          if (exec.status === 'success') {
            appendLog(`✓ ${label} confirmed on-chain: Success.${gasNote(exec.cost)}`, 'ok')
            return true
          }
          if (exec.status === 'failed') {
            appendLog(`✗ ${label} FAILED on-chain: ${exec.error || 'execution error'}`, 'warn')
            bag.lastfailed = label
            // A confirmed on-chain failure must stop the branch — no downstream
            // step (e.g. a "deployed!" notification) should run on a failed tx.
            branchStops = true
            txFailed = true
            return false
          }
          appendLog(`${label}: still pending after ~40s — check the explorer link above.`, 'info')
          return false
        }
        const report = async (label: string, res: { ok: boolean; hash?: string; error?: string }) => {
          if (res.ok) {
            const url = explorerTxUrl(net, res.hash || '')
            appendLog(`REAL ${label} submitted — ${res.hash}`, 'info')
            appendLog(`View: ${url}`, 'info')
            // Expose to downstream steps (e.g. Notification can include {{txurl}}).
            bag.hash = res.hash || ''
            bag.txurl = url
            if (res.hash) await confirmTx(label, res.hash)
            if (walletKey) refreshWalletBalance(walletKey)
          } else {
            // Submission failed (cancelled signature, wallet unavailable, RPC error…).
            // Stop the branch so no downstream step (e.g. a notification) runs.
            appendLog(`${label} (LIVE) failed: ${res.error}`, 'warn')
            branchStops = true
            txFailed = true
          }
        }
        // Manual mode → in-app approval dialog, then sign locally. No extension.
        const confirmIfNeeded = async (action: string, detail: string): Promise<boolean> => {
          if (!needsApproval || !hasAgentKey()) return true
          approvalSeq += 1
          appendLog(`${action}: waiting for your approval…`, 'info')
          const ok = await requestApproval({
            action,
            detail,
            from: getAgentPublicHex() || '',
            net,
            wallet: walletNameForAction,
            index: approvalSeq,
            total: totalSignable,
          })
          if (!ok) appendLog(`${action}: rejected — skipped.`, 'warn')
          return ok
        }
        let handled = true
        let branchStops = false
        let txFailed = false
        if (data.moduleType === 'transfer') {
          let to = String(params.to).trim().replace(/^account-hash-/i, '')
          const isKey = (s: string) => /^01[0-9a-fA-F]{64}$/.test(s) || /^02[0-9a-fA-F]{66}$/.test(s)
          const isHash = (s: string) => /^[0-9a-fA-F]{64}$/.test(s) // CSPR.name → account hash
          // Resolve a saved wallet NAME (e.g. "wallet 3") to its public key, so the
          // agent can address recipients by name — no need to paste a key.
          if (to && !isKey(to) && !isHash(to)) {
            const match = resolveRecipientWallet(to)
            if (match?.publicHex) {
              appendLog(`Send CSPR: recipient "${to}" → ${match.name} (${match.publicHex.slice(0, 8)}…).`, 'info')
              to = match.publicHex
            }
          }
          const validKey = isKey(to)
          const validHash = isHash(to)
          if (!signerHex) {
            // No paying wallet chosen → stop with a clear instruction instead of
            // trying to sign with an empty key (which fails with a cryptic error).
            appendLog(
              'Send CSPR: no paying wallet is selected. Open the Wallet card, choose the wallet that pays, then Run again.',
              'warn',
            )
            branchStops = true
          } else if (!to || to.startsWith('02c4d6')) {
            appendLog('Send CSPR (LIVE): set a real recipient (key, wallet, or CSPR.name) first — skipped.', 'warn')
          } else if (!validKey && !validHash) {
            appendLog(
              `Send CSPR (LIVE): "${to.slice(0, 10)}…" is not a valid recipient (public key or resolved CSPR.name) — skipped.`,
              'warn',
            )
          } else if (signerHex && to.toLowerCase() === signerHex.toLowerCase()) {
            appendLog(
              'Send CSPR (LIVE): the recipient is the same wallet that signs. Casper rejects sending to your own purse ("Invalid purse"). Pick a different recipient. Skipped.',
              'warn',
            )
            branchStops = true
          } else if (!enforceSpend(Number(params.amount), 'Send CSPR')) {
            /* blocked by spend limit — skip */
          } else if (
            await confirmIfNeeded('Send CSPR', `${params.amount} CSPR → ${to.slice(0, 8)}…${to.slice(-4)}`)
          ) {
            appendLog(`Send CSPR (LIVE): ${needsApproval ? 'approved — signing…' : signMsg}`, 'info')
            const txRes = await sendCsprReal({
              net, senderHex: signerHex, recipientHex: to,
              amountCspr: Number(params.amount), transferId: Number(params.transferId) || undefined,
            })
            await report('transfer', txRes)
            if (txRes.ok) {
              recordSpend(Number(params.amount))
              recordJournal({
                kind: 'transfer',
                title: `Sent ${params.amount} CSPR to ${String(params.toName || to.slice(0, 10) + '…')}`,
                amount: Number(params.amount),
                usd: getCsprPrice() ?? undefined,
                from: walletNameForAction || undefined,
                to: String(params.toName || to),
                hash: txRes.hash,
                url: explorerTxUrl(net, txRes.hash || ''),
                status: txFailed ? 'failed' : 'success',
                gasMotes: lastGas.cost,
                gasLimitMotes: lastGas.limit,
                gasConsumedMotes: lastGas.consumed,
                gasRefundMotes: lastGas.refund,
                net,
              })
              addRecentTx(signerHex, {
                hash: txRes.hash || '',
                amount: Number(params.amount),
                timestamp: new Date().toISOString(),
                out: true,
                peer: to,
              })
              // Accumulate real send stats this cycle so downstream AI / Attest / Notify
              // can reference them: {{sentcount}}, {{senttotal}}, {{amount}}, and the
              // FULL list of this batch's hashes/links ({{txhashes}}, {{txurls}}).
              bag.sentcount = (Number(bag.sentcount) || 0) + 1
              bag.senttotal = Number(((Number(bag.senttotal) || 0) + Number(params.amount)).toFixed(4))
              bag.amount = Number(params.amount)
              const thisUrl = explorerTxUrl(net, txRes.hash || '')
              bag.txhashes = `${bag.txhashes ? `${bag.txhashes}\n` : ''}${txRes.hash || ''}`
              bag.txurls = `${bag.txurls ? `${bag.txurls}\n` : ''}${thisUrl}`
              bag.txlist = `${bag.txlist ? `${bag.txlist}\n` : ''}• ${Number(params.amount)} CSPR → ${to.slice(0, 10)}… · ${thisUrl}`
            }
          }
        } else if (data.moduleType === 'stake') {
          const validator = String(params.validator).trim()
          const stakeOp = String(params.op)
          const stakeSpends = stakeOp === 'Delegate' || stakeOp === 'Redelegate'
          if (!validator || validator.startsWith('01f2e4')) {
            appendLog('Stake (LIVE): set a real validator public key first — skipped.', 'warn')
          } else if (stakeSpends && !enforceSpend(Number(params.amount), stakeOp)) {
            /* blocked by spend limit — skip */
          } else if (
            await confirmIfNeeded(stakeOp, `${params.amount} CSPR · ${validator.slice(0, 8)}…`)
          ) {
            appendLog(`${params.op} (LIVE): ${needsApproval ? 'approved — signing…' : signMsg}`, 'info')
            const stRes = await delegateReal({
              net, senderHex: signerHex, validatorHex: validator,
              amountCspr: Number(params.amount),
              op: (stakeOp as 'Delegate' | 'Undelegate' | 'Redelegate') || 'Delegate',
              newValidatorHex: String(params.newValidator || '').trim() || undefined,
            })
            await report(stakeOp, stRes)
            if (stRes.ok && stakeSpends) recordSpend(Number(params.amount))
          }
        } else if (data.moduleType === 'callcontract') {
          const contract = String(params.contract).trim()
          if (!contract || contract.startsWith('hash-a1b2')) {
            appendLog('Call contract (LIVE): set a real contract hash first — skipped.', 'warn')
          } else if (
            await confirmIfNeeded('Call contract', `${params.entrypoint}() · ${contract.slice(0, 8)}…`)
          ) {
            appendLog(`Call ${params.entrypoint}() (LIVE): ${needsApproval ? 'approved — signing…' : signMsg}`, 'info')
            await report('contract call', await callContractReal({
              net, senderHex: signerHex, contractHash: contract,
              entrypoint: String(params.entrypoint), argsJson: String(params.args),
              paymentCspr: Number(params.payment) || 2.5,
            }))
          }
        } else if (data.moduleType === 'attest') {
          const att = buildAttestation(`${params.topic}:${params.data}`, signerHex)
          const fullAnchor = String(params.anchor ?? 'Full digest (4 tx)').startsWith('Full')
          appendLog(`Attest "${params.topic}": claim ${att.claimHash.slice(0, 18)}…`, 'info')
          if (await confirmIfNeeded('Attest', `"${params.topic}" → ${att.claimHash.slice(0, 14)}…`)) {
            // Anchor the proof on-chain via self-transfer(s). "Full digest" splits the
            // 256-bit EIP-712 digest across 4 native transfer-ids (8 bytes each) so the
            // COMPLETE hash is recorded on-chain and reconstructable; "Commitment" uses
            // a single 48-bit transfer-id derived from the digest.
            // Native transfers must be ≥ 2.5 CSPR on Casper, so clamp the anchor
            // amount regardless of what the user / generator put in the field
            // (a smaller value is rejected as "Invalid transaction" / -32016).
            const amt = Math.max(2.5, Number(params.amount) || 2.5)
            const dig = att.digest.replace(/^0x/, '')
            const ids = fullAnchor
              ? [0, 1, 2, 3].map((i) => BigInt('0x' + dig.slice(i * 16, i * 16 + 16)))
              : [BigInt(att.transferId)]
            // Casper rejects a transfer to your own main purse ("Invalid purse"),
            // so the anchor must go to a DIFFERENT account. Use another of the
            // user's saved wallets (funds stay in their control); the digest still
            // rides on-chain in the transfer-id, fully verifiable.
            const anchorTo =
              loadWalletProfiles()
                .map((w) => w.publicHex)
                .find((h) => h && h.toLowerCase() !== signerHex.toLowerCase()) || ''
            if (!anchorTo) {
              appendLog(
                'Attest: needs a second saved wallet to anchor to (Casper forbids self-transfers). Add another wallet in Settings → Wallets.',
                'warn',
              )
            }
            const hashes: string[] = []
            let okAll = !!anchorTo && enforceSpend(amt * ids.length, 'Attestation anchor')
            for (let i = 0; okAll && i < ids.length; i++) {
              const res = await sendCsprReal({
                net, senderHex: signerHex, recipientHex: anchorTo, amountCspr: amt, transferId: ids[i],
              })
              if (res.ok && res.hash) {
                recordSpend(amt)
                hashes.push(res.hash)
                addRecentTx(signerHex, {
                  hash: res.hash, amount: amt, timestamp: new Date().toISOString(), out: true, peer: anchorTo,
                })
              } else {
                okAll = false
                appendLog(`Attest part ${i + 1}/${ids.length} failed: ${res.error}`, 'warn')
                break
              }
            }
            if (okAll && hashes.length) {
              const url = explorerTxUrl(net, hashes[0])
              appendLog(
                fullAnchor
                  ? `✓ FULL EIP-712 digest anchored on-chain across ${hashes.length} transfers`
                  : `✓ REAL attestation anchored — ${hashes[0]}`,
                'ok',
              )
              appendLog(`Claim hash: ${att.claimHash}`, 'info')
              appendLog(`EIP-712 digest: ${att.digest}`, 'info')
              hashes.forEach((h, i) => appendLog(`  part ${i + 1}/${hashes.length}: ${h}`, 'info'))
              appendLog(
                `Note: the ${amt} CSPR anchor${hashes.length > 1 ? ` ×${hashes.length}` : ''} went to your own wallet (recoverable, not a fee). The only real cost is gas, held and refundable on Casper 2.0.`,
                'info',
              )
              bag.claimhash = att.claimHash
              bag.digest = att.digest
              bag.attesturl = url
              bag.txurl = url
              if (hashes[0]) await confirmTx('Attestation anchor', hashes[0])
              if (walletKey) refreshWalletBalance(walletKey)
            }
          }
        } else if (data.moduleType === 'x402') {
          const key = getAgentKey()
          if (!key) {
            appendLog('x402: connect an autonomous Wallet to sign the payment — skipped.', 'warn')
          } else if (await confirmIfNeeded('x402 payment', `${params.endpoint}`)) {
            appendLog(`x402: requesting ${String(params.endpoint)} …`, 'info')
            const r = await payX402OnChain({
              url: String(params.endpoint),
              method: String(params.method || 'GET'),
              payerPublicHex: signerHex,
              net,
              maxPriceMotes:
                params.maxPrice != null && Number(params.maxPrice) > 0
                  ? BigInt(Math.round(Number(params.maxPrice) * 1e9))
                  : undefined,
              pay: async (payTo, motes) => {
                const cspr = Number(motes) / 1e9
                if (!enforceSpend(cspr, 'x402 payment')) {
                  return { ok: false, error: 'blocked by spend limit' }
                }
                const rr = await sendCsprReal({
                  net,
                  senderHex: signerHex,
                  recipientHex: payTo,
                  amountCspr: cspr,
                })
                if (rr.ok) recordSpend(cspr)
                return { ok: rr.ok, hash: rr.hash, error: rr.error }
              },
              log: (m) => appendLog(`x402: ${m}`, 'info'),
            })
            if (r.paid && r.ok) {
              // The payment settled on-chain; expose it for receipts downstream.
              if (r.txHash) {
                const xurl = explorerTxUrl(net, r.txHash)
                appendLog(`Settlement tx: ${r.txHash}`, 'info')
                appendLog(`View: ${xurl}`, 'info')
                bag.txurl = xurl
                bag.hash = r.txHash
              }
              bag.x402endpoint = String(params.endpoint || '')
              bag.x402amount = Number(r.amount) / 1e9
              bag.x402payto = String(r.payTo || '')
              // ── Response verification: paid ≠ trustworthy. Check the seller
              // actually delivered before any downstream step consumes it. ──
              const need = String(params.verifyContains || '').trim()
              const minLen = Number(params.minLength) || 0
              const body = r.body || ''
              const failLen = minLen > 0 && body.length < minLen
              const failNeed = !!need && !body.includes(need)
              if (failLen || failNeed) {
                const why = [
                  failLen ? `length ${body.length} < ${minLen}` : '',
                  failNeed ? `missing "${need.slice(0, 40)}"` : '',
                ].filter(Boolean).join('; ')
                appendLog(
                  `🔎 x402 response FAILED verification (${why}) — paid ${Number(r.amount) / 1e9} CSPR but NOT trusting the result. Branch stops.`,
                  'warn',
                )
                bag.verified = 'no'
                branchStops = true
              } else {
                bag.verified = 'yes'
                appendLog(
                  `✓ x402 paid ${Number(r.amount) / 1e9} CSPR → resource delivered${need || minLen > 0 ? ' and verified' : ''} (HTTP ${r.status})`,
                  'ok',
                )
                if (r.body) {
                  bag.x402body = r.body.slice(0, 500)
                  appendLog(`Resource: ${r.body.slice(0, 160)}`, 'step')
                }
              }
              if (walletKey) refreshWalletBalance(walletKey)
            } else if (!r.paid && r.ok) {
              appendLog(`x402: resource was free (HTTP ${r.status}) — no payment needed.`, 'info')
              if (r.body) bag.x402body = r.body.slice(0, 500)
            } else {
              appendLog(`x402 ${r.paid ? 'payment' : 'request'} issue: ${r.error || 'HTTP ' + r.status}`, 'warn')
              branchStops = true
              txFailed = true
            }
          }
        } else if (data.moduleType === 'swap') {
          const key = getAgentKey()
          const swapsCspr = String(params.tokenIn).toUpperCase() === 'CSPR'
          if (!key) {
            appendLog('Swap: connect an autonomous Wallet to sign — skipped.', 'warn')
          } else if (swapsCspr && !enforceSpend(Number(params.amount), 'Swap')) {
            /* blocked by spend limit — skip */
          } else if (await confirmIfNeeded('CSPR.trade swap', `${params.amount} ${params.tokenIn} → ${params.tokenOut}`)) {
            appendLog(`Swap: ${params.amount} ${params.tokenIn} → ${params.tokenOut} via CSPR.trade…`, 'info')
            const r = await swapReal({
              net,
              tokenIn: String(params.tokenIn),
              tokenOut: String(params.tokenOut),
              amount: String(params.amount),
              type: 'exact_in',
              slippageBps: Math.round((Number(params.slippage) || 3) * 100),
              deadlineMinutes: Number(params.deadline) || 20,
              signer: key,
              senderPublicHex: signerHex,
            })
            if (r.ok) {
              if (swapsCspr) recordSpend(Number(params.amount))
              const url = explorerTxUrl(net, r.hash || '')
              appendLog(`REAL swap submitted — ${r.hash}`, 'info')
              if (r.summary) appendLog(r.summary, 'info')
              ;(r.warnings || []).forEach((w) => appendLog(`⚠️ ${w}`, 'warn'))
              appendLog(`View: ${url}`, 'info')
              bag.txurl = url
              bag.hash = r.hash || ''
              if (r.hash) await confirmTx('Swap', r.hash)
            } else {
              appendLog(`Swap failed: ${r.error}`, 'warn')
              branchStops = true
              txFailed = true
            }
          }
        } else if (data.moduleType === 'agent') {
          // ── Autonomous Agent: an LLM tool-use loop wired to the real Casper
          //    actions, under the same spend-limit + approval guardrails. ──
          const aiCfg = settingsRef.current.aiKey
            ? {
                provider: settingsRef.current.aiProvider,
                apiKey: settingsRef.current.aiKey,
                model: settingsRef.current.aiModel,
                baseUrl: settingsRef.current.aiBaseUrl,
              }
            : undefined
          if (!aiCfg) {
            appendLog('Autonomous Agent: add an AI key in Settings → AI to run it.', 'warn')
          } else {
            const isKey = (s: string) => /^01[0-9a-fA-F]{64}$/.test(s) || /^02[0-9a-fA-F]{66}$/.test(s)
            const isHash = (s: string) => /^[0-9a-fA-F]{64}$/.test(s)
            const cloud = settingsRef.current.csprCloudKey || ''
            const role = String(params.role || 'Autonomous on-chain agent')
            // Tie each journal line to the agent badge on the canvas (Agent 1 / Agent 2)
            // so a multi-agent run reads as "who did what".
            const agentActor = (() => {
              const v = agentVarName(currentNodes, id) // 'agent' | 'agent1' | 'agent2'…
              const n = v.replace(/^agent/, '')
              return n ? `${role} (Agent ${n})` : role
            })()
            const goal =
              substituteVars(String(params.goal || '').trim(), bag) ||
              'Use your tools to inspect the wallet and report its status.'
            // 'auto' mode infers the toolbox from the goal; 'manual' uses the picked list.
            let enabledTools = effectiveTools(params.toolsMode, params.tools, goal)
            // HARD guard, independent of mode/defaults: the agent only gets the attest
            // tool if the goal EXPLICITLY asks to anchor/attest/record on-chain. This
            // stops an over-eager model (or a stale default list that still contains
            // attest) from spending CSPR on an unrequested attestation — "proof link"
            // in a goal means the explorer link of a transfer, not an anchor.
            const goalWantsAttest =
              /\b(attest|attestation|anchor|notari[sz]e|certify|tamper.?proof)\b/i.test(goal) ||
              /\b(record|log)\b[^.]*\bon(-|\s)?(chain|casper)\b/i.test(goal)
            if (!goalWantsAttest) enabledTools = enabledTools.filter((t) => t.id !== 'attest')
            const toolSpecs = enabledTools.map((t) => t.spec)
            const hasSigningTool = enabledTools.some((t) => t.signs)
            const system =
              `You are "${role}", an autonomous agent operating on the Casper ${net} network. ` +
              'Pursue the goal by calling the available tools: think, call one or more tools, read the ' +
              'results, and continue until the goal is met, then give a short final summary. ' +
              'You sign REAL transactions. Never do more than the goal asks. Use ONLY the exact ' +
              'recipient, amount and validator named in the goal. ' +
              'If a tool call is refused, blocked, or fails, STOP immediately. Do NOT work around it: ' +
              'do not change the recipient, amount, or validator, do not pick a different account, and do ' +
              'not retry. Report exactly what was refused and end. ' +
              'NEVER invent or guess URLs, transaction hashes, account addresses, or proof links: include ' +
              'ONLY values that a tool actually returned to you in this run, copied exactly. If you do not ' +
              'have a real link, do not include one. ' +
              'When messaging the user, send a single summary message; never send the same notification twice. ' +
              'BE EFFICIENT WITH STEPS (this saves rate limits): when you need several reads, request them ' +
              'ALL together in ONE step (parallel tool calls), not one per turn. Once you have the data, make ' +
              'every decision and issue every send in as few steps as possible, call notify once, then finish. ' +
              'Do not re-read something you already read, and do not add extra steps. ' +
              'Amounts are in CSPR. Be concise.'

            // HARD guardrail: once a signing action is blocked (self-transfer or
            // spend limit), lock all further signing for this run. A soft prompt
            // instruction is not enough — models will try to work around a refusal
            // by changing the recipient. This makes that impossible.
            let signingLocked = false
            // Messaging is DEFERRED and AUTHORED BY US, not the model. notify() only
            // records that the user wants a summary; we build the actual message from
            // the real actions taken this run (each with its real explorer proof
            // link) and send exactly ONE message at the end. This guarantees the
            // message always has the real links and the model can never spam or send
            // a half-empty "Sent 3 CSPR" with no proof.
            let wantsNotify = false
            const runReceipts: string[] = []
            // The real explorer proof links produced this run. A notification may
            // only include one of these, so the model cannot invent a link
            // (e.g. example.com/proof) and pass it off as proof.
            const realProofLinks = new Set<string>()
            // The agent's yes/no verdict (when it uses the Decide capability). A
            // "no" can stop the branch if the visible stopOnNo setting allows it.
            // Only the FINAL verdict is logged (after the run), so a self-correcting
            // model doesn't print a contradictory "YES then NO" pair.
            let agentVerdict: 'yes' | 'no' | null = null
            let agentVerdictReason = ''
            let decideCount = 0
            // Idempotency: a successful signing action (same send, same note, same
            // delegation) runs only ONCE per run, so a looping model cannot
            // double-send funds or anchor the same note twice.
            const completedActions = new Set<string>()
            // Read de-duplication + a global tool budget. A weaker model (e.g. an 8B)
            // can otherwise loop forever re-reading the same balances and never decide.
            // We cache each balance read and, after the second read of the same
            // account, refuse with a firm "you already have this, act now". A hard cap
            // on TOTAL tool calls is the final backstop so no run can spin out of
            // control regardless of the model.
            const readCache = new Map<string, string>()
            const readCounts = new Map<string, number>()
            let toolBudget = 0
            const TOOL_BUDGET_MAX = 24
            const exec = async (name: string, args: Record<string, unknown>): Promise<string> => {
              // Some models pass `null` (not `{}`) when a tool takes no required
              // args; guard so reading args.* never throws.
              args = args ?? {}
              try {
                // Global backstop: once the tool budget is spent, refuse everything
                // except the final notify, and tell the model to conclude now.
                toolBudget++
                if (toolBudget > TOOL_BUDGET_MAX && name !== 'notify') {
                  return 'Tool budget reached for this run. Stop calling tools. Send to any wallets you already identified as eligible (if not done), then write your final summary and finish.'
                }
                const isSigning = name === 'send_cspr' || name === 'delegate' || name === 'attest'
                if (isSigning && signingLocked) {
                  return 'Signing is locked for this run: a previous action was blocked by a guardrail. The agent may not sign anything else now. Stop and report.'
                }
                // An Autonomous Agent must sign LOCALLY (no popup). If there is no
                // local signer, refuse rather than fall back to the Casper Wallet
                // extension (wrong account + unreliable). Reads are still fine.
                if (!autonomous && (name === 'send_cspr' || name === 'delegate' || name === 'attest')) {
                  return 'Cannot sign: this Autonomous Agent has no local signer, so it will not open the Casper Wallet extension. Connect a Wallet node set to Autonomous mode to this agent (or set an agent key in Settings), then run again.'
                }
                if (name === 'get_price') {
                  const p = (await fetchCsprPrice()) ?? getCsprPrice()
                  return p != null ? `CSPR price: $${p}` : 'Price unavailable.'
                }
                if (name === 'read_balance') {
                  const acct = String((args.account ?? '') || signerHex || '').trim()
                  if (!acct) return 'No account to read: no account given and no wallet is connected.'
                  const wasName = !(isKey(acct) || isHash(acct))
                  const a = wasName ? resolveRecipientWallet(acct)?.publicHex || acct : acct
                  const cacheKey = a.toLowerCase()
                  const seen = (readCounts.get(cacheKey) || 0) + 1
                  readCounts.set(cacheKey, seen)
                  // Already read this account → return the cached value and, from the
                  // second repeat on, firmly tell the model to stop re-reading and act.
                  // This is what breaks the "read the same 4 balances forever" loop.
                  if (readCache.has(cacheKey)) {
                    const cached = readCache.get(cacheKey)!
                    if (seen >= 3)
                      return `STOP RE-READING. You already have every balance you need. ${cached}. Now DECIDE which wallets meet the rule, SEND to them, then notify and finish. Do not call read_balance again.`
                    return `(already read) ${cached}. You have this balance, do not read it again; proceed to decide and act.`
                  }
                  const info = await getAccountBalance(net, cloud, a)
                  if (!info) return 'Could not read balance.'
                  // Echo a recipient the agent can safely reuse: the wallet NAME when we
                  // resolved one (send_cspr accepts names), and the FULL key — never a
                  // shortened "0202…1410" form, which the agent would copy and then fail
                  // to send to ("not a valid recipient").
                  const label = wasName ? `${acct} (full key ${a})` : a
                  const out = `Balance of ${label}: ${info.balance} CSPR`
                  readCache.set(cacheKey, out)
                  return out
                }
                if (name === 'recent_transfers') {
                  const acct = String(args.account || signerHex)
                  const a = isKey(acct) || isHash(acct) ? acct : resolveRecipientWallet(acct)?.publicHex || acct
                  const lim = Math.max(1, Math.min(25, Number(args.limit) || 10))
                  const ts = await getRecentTransfers(net, cloud, a, lim)
                  if (!ts || !ts.length) return 'No recent transfers.'
                  return ts
                    .slice(0, lim)
                    .map((t) => `${t.out ? '-' : '+'}${t.amount} CSPR ${t.out ? 'out' : 'in'} @ ${t.timestamp}`)
                    .join('; ')
                }
                if (name === 'resolve_name') {
                  const h = await resolveCsprName(net, cloud, String(args.name || ''))
                  return h ? `${args.name} -> ${h}` : `Could not resolve ${args.name}.`
                }
                if (name === 'decide') {
                  if (decideCount >= 4)
                    return 'Decision already made several times this run. Stop; do not call decide again.'
                  const v = String(args.verdict || '').trim().toLowerCase().startsWith('n') ? 'no' : 'yes'
                  const reason = String(args.reason || '').trim().slice(0, 200)
                  decideCount++
                  agentVerdict = v
                  agentVerdictReason = reason
                  bag.agentdecision = v
                  bag[`${agentVarName(currentNodes, id)}decision`] = v
                  return `Decision recorded: ${v}.${v === 'no' ? ' The flow may stop here; do not take further action.' : ' Proceed.'}`
                }
                if (name === 'notify') {
                  // We do NOT use the model's wording. Calling notify simply records
                  // that the user wants a summary; we compose the real message from
                  // the actions taken this run (with their real proof links) and send
                  // it once after the run. So the model can pass anything (or nothing)
                  // here and it cannot send a link-less or duplicate message.
                  wantsNotify = true
                  return 'Acknowledged. A summary with the real proof links will be sent to the user automatically once, at the end of the run. Do not call notify again.'
                }
                if (name === 'send_cspr') {
                  let to = String(args.to || '').trim().replace(/^account-hash-/i, '')
                  // A shortened key copied from a balance line ("0202c8…1410") is not a
                  // real recipient. Tell the agent to use the wallet NAME or the full key
                  // instead of failing with a vague "not a valid recipient".
                  if (/[…]|\.\.\./.test(to))
                    return `Refused: "${to}" is a shortened key, not a real address. Send to the wallet NAME (e.g. "wallet 2") or paste the FULL public key, not the abbreviated "0202…abcd" form.`
                  if (to && !isKey(to) && !isHash(to)) {
                    const m = resolveRecipientWallet(to)
                    if (m?.publicHex) to = m.publicHex
                  }
                  const amt = Number(args.amount)
                  if (!(amt > 0)) return 'Refused: amount must be a positive number of CSPR.'
                  if (!isKey(to) && !isHash(to)) {
                    const raw = String(args.to || '').trim()
                    const looksPlaceholder =
                      !raw ||
                      /[<>{}]/.test(raw) ||
                      /^(recipient|address|destination|payee|placeholder|tbd|x{3,}|your[ _-]?(recipient|address|wallet))$/i.test(raw)
                    if (looksPlaceholder) {
                      signingLocked = true
                      return `Refused: NO destination address was provided — "${raw}" is a placeholder, not a real recipient. Tell the user clearly that they must set a real recipient (a Casper public key starting 01/02, or a saved wallet name) before the agent can send. Signing is now locked for this run: do not send and do not attest any transfer. Stop and report this.`
                    }
                    return `Refused: "${raw}" is not a valid recipient. Use a Casper public key (01…/02…) or a saved wallet name.`
                  }
                  if (completedActions.has(`send:${to.toLowerCase()}:${amt}`))
                    return 'Already sent this exact transfer this run. Do NOT send it again; stop.'
                  // Casper rejects native transfers below 2.5 CSPR. Catch it here,
                  // before signing, with a clean message (no raw RPC error) and lock
                  // signing so the agent can't bump the amount to work around it.
                  if (amt < 2.5) {
                    signingLocked = true
                    recordJournal({
                      actor: agentActor,
                      kind: 'transfer',
                      title: `Blocked: ${amt} CSPR is below the 2.5 CSPR minimum (to ${String(args.to)})`,
                      amount: amt,
                      usd: getCsprPrice() ?? undefined,
                      from: walletNameForAction || undefined,
                      to: String(args.to),
                      status: 'blocked',
                      net,
                    })
                    return 'Refused: Casper requires a minimum native transfer of 2.5 CSPR. Signing is now locked for this run; do not change the amount. Stop.'
                  }
                  if (signerHex && to.toLowerCase() === signerHex.toLowerCase()) {
                    signingLocked = true
                    recordJournal({
                      actor: agentActor,
                      kind: 'transfer',
                      title: `Blocked self-transfer: ${amt} CSPR to ${String(args.to)}`,
                      amount: amt,
                      usd: getCsprPrice() ?? undefined,
                      from: walletNameForAction || undefined,
                      to: String(args.to),
                      status: 'blocked',
                      net,
                    })
                    return 'Refused: cannot send to the same wallet that signs (Casper rejects self-transfers as "Invalid purse"). Signing is now locked for this run; do not try another recipient. Stop.'
                  }
                  if (!enforceSpend(amt, 'Agent send')) {
                    signingLocked = true
                    recordJournal({
                      actor: agentActor,
                      kind: 'transfer',
                      title: `Blocked by spend limit: send ${amt} CSPR to ${String(args.to)}`,
                      amount: amt,
                      usd: getCsprPrice() ?? undefined,
                      from: walletNameForAction || undefined,
                      to: String(args.to),
                      status: 'blocked',
                      net,
                    })
                    return `Blocked by spend limit: sending ${amt} CSPR would exceed the cap. Signing is now locked for this run; do not try another recipient or amount. Stop.`
                  }
                  if (!(await confirmIfNeeded('Agent: Send CSPR', `${amt} CSPR -> ${to.slice(0, 8)}…`)))
                    return 'Refused by the user.'
                  const r = await sendCsprReal({ net, senderHex: signerHex, recipientHex: to, amountCspr: amt })
                  if (!r.ok) {
                    recordJournal({
                      actor: agentActor,
                      kind: 'transfer',
                      title: `Transfer failed: ${amt} CSPR to ${String(args.to)}`,
                      amount: amt,
                      usd: getCsprPrice() ?? undefined,
                      from: walletNameForAction || undefined,
                      to: String(args.to),
                      status: 'failed',
                      net,
                    })
                    // A failed signing attempt also locks signing, so the agent
                    // cannot retry the same transfer with a tweaked argument.
                    signingLocked = true
                    branchStops = true
                    const short = String(r.error || 'unknown error').replace(/\s+/g, ' ').slice(0, 140)
                    return `Transfer failed (${short}). Signing is now locked for this run; do not retry. Stop.`
                  }
                  completedActions.add(`send:${to.toLowerCase()}:${amt}`)
                  recordSpend(amt)
                  didAct = true
                  const url = explorerTxUrl(net, r.hash || '')
                  realProofLinks.add(url)
                  const ex = await awaitExecution(net, r.hash || '')
                  if (walletKey) refreshWalletBalance(walletKey)
                  recordJournal({
                    actor: agentActor,
                    kind: 'transfer',
                    title: `Sent ${amt} CSPR to ${String(args.to)}`,
                    amount: amt,
                    usd: getCsprPrice() ?? undefined,
                    from: walletNameForAction || undefined,
                    to: String(args.to),
                    hash: r.hash,
                    url,
                    status: ex.status,
                    gasMotes: ex.cost,
                    gasLimitMotes: ex.limit,
                    gasConsumedMotes: ex.consumed,
                    gasRefundMotes: ex.refund,
                    net,
                  })
                  runReceipts.push(`Sent ${amt} CSPR to ${String(args.to)}\n${url}`)
                  return `Sent ${amt} CSPR. On-chain status: ${ex.status}.${gasNote(ex.cost)} Proof: ${url}`
                }
                if (name === 'delegate') {
                  const validator = String(args.validator || '').trim()
                  const amt = Number(args.amount)
                  if (!isKey(validator)) return 'Refused: validator must be a public key.'
                  if (!(amt > 0)) return 'Refused: amount must be positive.'
                  if (completedActions.has(`delegate:${validator.toLowerCase()}:${amt}`))
                    return 'Already delegated this exact amount to this validator this run. Do NOT repeat; stop.'
                  if (!enforceSpend(amt, 'Agent delegate')) {
                    signingLocked = true
                    return 'Blocked by spend limit. Signing is now locked for this run; stop.'
                  }
                  if (!(await confirmIfNeeded('Agent: Delegate', `${amt} CSPR · ${validator.slice(0, 8)}…`)))
                    return 'Refused by the user.'
                  const r = await delegateReal({
                    net,
                    senderHex: signerHex,
                    validatorHex: validator,
                    amountCspr: amt,
                    op: 'Delegate',
                  })
                  if (!r.ok) {
                    branchStops = true
                    return `Delegate failed: ${r.error}`
                  }
                  completedActions.add(`delegate:${validator.toLowerCase()}:${amt}`)
                  recordSpend(amt)
                  didAct = true
                  const durl = explorerTxUrl(net, r.hash || '')
                  realProofLinks.add(durl)
                  const exD = await awaitExecution(net, r.hash || '')
                  recordJournal({
                    actor: agentActor,
                    kind: 'stake',
                    title: `Delegated ${amt} CSPR to ${validator.slice(0, 10)}…`,
                    amount: amt,
                    usd: getCsprPrice() ?? undefined,
                    from: walletNameForAction || undefined,
                    hash: r.hash,
                    url: durl,
                    status: exD.status,
                    gasMotes: exD.cost,
                    gasLimitMotes: exD.limit,
                    gasConsumedMotes: exD.consumed,
                    gasRefundMotes: exD.refund,
                    net,
                  })
                  runReceipts.push(`Delegated ${amt} CSPR to ${validator.slice(0, 10)}…\n${durl}`)
                  return `Delegated ${amt} CSPR. Proof: ${durl}`
                }
                if (name === 'attest') {
                  const note = String(args.note || '').slice(0, 400)
                  // Truth guard: never anchor a note that claims funds were moved when
                  // no transfer actually succeeded this run. Stops the model from
                  // hallucinating a "Sent X CSPR" attestation after a refused/failed send.
                  {
                    const lower = note.toLowerCase()
                    const claimsMoved =
                      /\b(sent|send|paid|pay|transferred|transfer|delegated|delegate|released|moved)\b/.test(lower)
                    const negated =
                      /\b(no|not|without|unable|never|nothing|none|refuse|refused|skip|skipped|fail|failed|cannot)\b/.test(lower) ||
                      /n't/.test(lower)
                    const movedFunds = [...completedActions].some(
                      (a) => a.startsWith('send:') || a.startsWith('delegate:'),
                    )
                    if (claimsMoved && !negated && !movedFunds)
                      return 'Refused: you are about to anchor a note claiming funds were moved, but NO transfer succeeded this run. Attest only what actually happened (e.g. that no funds were moved and why), or skip the attestation. Do not claim a transfer that did not execute.'
                  }
                  if (completedActions.has(`attest:${note}`))
                    return 'Already anchored this exact note on Casper this run. Do NOT attest it again; stop.'
                  const att = buildAttestation(`agent:${note}`, signerHex)
                  const amt = 2.5
                  const anchorTo =
                    loadWalletProfiles()
                      .map((w) => w.publicHex)
                      .find((h) => h && h.toLowerCase() !== signerHex.toLowerCase()) || ''
                  if (!anchorTo)
                    return 'Cannot attest: add a second saved wallet (Casper forbids self-transfers).'
                  if (!enforceSpend(amt, 'Agent attest')) {
                    signingLocked = true
                    return 'Blocked by spend limit. Signing is now locked for this run; stop.'
                  }
                  if (!(await confirmIfNeeded('Agent: Attest', `"${note.slice(0, 24)}…"`)))
                    return 'Refused by the user.'
                  const r = await sendCsprReal({
                    net,
                    senderHex: signerHex,
                    recipientHex: anchorTo,
                    amountCspr: amt,
                    transferId: BigInt(att.transferId),
                  })
                  if (!r.ok) {
                    branchStops = true
                    return `Attest failed: ${r.error}`
                  }
                  completedActions.add(`attest:${note}`)
                  recordSpend(amt)
                  didAct = true
                  const url = explorerTxUrl(net, r.hash || '')
                  realProofLinks.add(url)
                  bag.attesturl = url
                  bag.txurl = url
                  const exA = await awaitExecution(net, r.hash || '')
                  recordJournal({
                    actor: agentActor,
                    kind: 'attest',
                    title: `Anchored a proof on Casper: "${note.slice(0, 60)}"`,
                    amount: amt,
                    usd: getCsprPrice() ?? undefined,
                    from: walletNameForAction || undefined,
                    hash: r.hash,
                    url,
                    status: exA.status,
                    gasMotes: exA.cost,
                    gasLimitMotes: exA.limit,
                    gasConsumedMotes: exA.consumed,
                    gasRefundMotes: exA.refund,
                    net,
                  })
                  runReceipts.push(`Anchored a note on Casper: "${note.slice(0, 50)}"\n${url}`)
                  return `Anchored on Casper. Claim ${att.claimHash.slice(0, 18)}… (the 2.5 CSPR anchor went to your own wallet, recoverable, not a fee) Proof: ${url}`
                }
                return `Unknown tool: ${name}`
              } catch (e) {
                return `Tool error: ${e instanceof Error ? e.message : 'failed'}`
              }
            }

            appendLog(`AI Agent "${role}" starting…`, 'info')
            let toolCallCount = 0
            const result = await runAgent(aiCfg, {
              system,
              goal,
              tools: toolSpecs,
              executeTool: exec,
              shouldStop: () => abortRef.current,
              maxSteps: Math.max(2, Math.min(12, Number(params.maxSteps) || 6)),
              onEvent: (ev) => {
                // Clean log: only the RESULT of each step (one readable line), plus
                // the final summary. The raw tool calls, JSON args and the model's
                // thinking stay in the bottom Live console for debugging.
                if (ev.kind === 'tool_call') toolCallCount++
                // notify/decide are internal bookkeeping: their results are noise in
                // the user-facing log (the summary is sent at the end, the final
                // decision is logged once after the run). Keep only real step results.
                else if (ev.kind === 'tool_result' && ev.result && ev.tool !== 'notify' && ev.tool !== 'decide')
                  appendLog(ev.result, 'info')
                else if (ev.kind === 'final') {
                  // "Reached the step limit" is an internal stop reason, not a result;
                  // showing it (with a green ✓) reads as a problem. Skip it; the
                  // action lines, the guardrail line and "Run complete" tell the story.
                  const t = (ev.text || '').trim()
                  if (t && !/^reached the step limit\.?$/i.test(t)) appendLog(`✓ ${t}`, 'ok')
                }
                else if (ev.kind === 'error' && ev.text) {
                  // A 429 is a provider quota, not a flow failure. Say so plainly and
                  // point to the fix, instead of a cryptic "Agent error: HTTP 429".
                  const is429 = /\b429\b|rate.?limit/i.test(ev.text)
                  appendLog(
                    is429
                      ? '⏳ AI provider rate limit (HTTP 429): you hit the per-minute (or daily) token limit of this AI profile. Wait ~60s before the next run, switch AI profile/model in Settings → AI, or use fewer recipients. No funds were moved.'
                      : `Agent error: ${ev.text}`,
                    'warn',
                  )
                }
              },
            })
            // Expose the agent's final answer so later agents/steps can use it:
            // {{agent}}, {{agent2}}… (same ordering as the AGENT badge on the node).
            bag[agentVarName(currentNodes, id)] = result.finalText || '(no output)'
            // An agent that errored (e.g. provider without tool calling) must show
            // red + stop the branch, not a green "done" — UNLESS it already completed
            // real on-chain actions before the error (e.g. a provider rate-limit cut
            // the reasoning short after the transfers went through). In that case the
            // work is done: keep the node green and say so, instead of the misleading
            // "the transaction did not go through".
            if (result.stopped === 'error' && runReceipts.length > 0) {
              appendLog(
                'Note: the AI provider stopped early (likely a rate limit), but the actions above completed on-chain. Summary covers what was done.',
                'warn',
              )
              recordJournal({
                actor: agentActor,
                kind: 'other',
                title: `Agent completed ${runReceipts.length} action(s), then the AI provider stopped early`,
                status: 'success',
                net,
              })
            } else if (result.stopped === 'error') {
              recordJournal({
                actor: agentActor,
                kind: 'other',
                title: `Agent run failed: ${result.finalText?.slice(0, 80) || 'error'}`,
                status: 'failed',
                net,
              })
              txFailed = true
              branchStops = true
            } else if (toolCallCount === 0) {
              // The model answered but never actually called a tool. Two common
              // causes: (1) the goal needs an action tool that isn't enabled on
              // this agent, or (2) the provider drops tool definitions.
              if (!hasSigningTool) {
                appendLog(
                  '⚠️ The agent did nothing because it has no action tool enabled. Its goal needs a signing tool (e.g. Send CSPR), but only read-only tools are turned on. Enable the tool you need in the agent\'s Tools picker (click the Send CSPR ⚡ chip), then run again.',
                  'warn',
                )
              } else {
                appendLog(
                  '⚠️ The agent answered without calling any tool — it did not actually read or do anything. Your AI provider is likely not passing tool definitions. Use a tool-capable provider (Groq is free, or Claude / OpenAI direct).',
                  'warn',
                )
              }
              recordJournal({
                actor: agentActor,
                kind: 'other',
                title: hasSigningTool
                  ? 'Agent did nothing: no tool was called (provider may not pass tools)'
                  : 'Agent could not act: no signing tool enabled (e.g. Send CSPR)',
                status: 'failed',
                net,
              })
              txFailed = true
              branchStops = true
            }
            // Log only the FINAL decision (after any self-correction), then apply
            // the visible gate: a "no" stops the branch when stopOnNo is on (this is
            // the old AI-decision behavior, now inside the agent).
            const verdict = agentVerdict as 'yes' | 'no' | null
            if (verdict) {
              appendLog(
                `🧭 Final decision: ${verdict.toUpperCase()}${agentVerdictReason ? `, ${agentVerdictReason}` : ''}`,
                verdict === 'yes' ? 'ok' : 'warn',
              )
              // A decision is a governance event worth auditing, especially a "no"
              // that stops a payment. Record it (green for yes, orange for a gating no).
              recordJournal({
                actor: agentActor,
                kind: 'other',
                title: `Decision: ${verdict.toUpperCase()}${agentVerdictReason ? `, ${agentVerdictReason}` : ''}`,
                status: verdict === 'no' ? 'blocked' : 'success',
                net,
              })
              if (verdict === 'no' && String(params.stopOnNo ?? 'Yes') !== 'No') {
                appendLog('🧭 Decision is NO, stopping the flow here.', 'warn')
                branchStops = true
              }
            }
            // A guardrail that locked signing AND let nothing through is a STOP, not a
            // success: a green check would wrongly read as "the agent did its job".
            // Show the node red and halt the branch so the canvas, log and Journal all
            // say the same thing: the agent was prevented and no funds moved.
            if (signingLocked && runReceipts.length === 0) {
              appendLog('🛡️ Guardrail stopped the agent. No funds moved.', 'warn')
              txFailed = true
              branchStops = true
            }
            // Compose the ONE summary ourselves and send it once. Three honest cases:
            //  - actions succeeded   → list them with their real proof links
            //  - a guardrail blocked → say so plainly, never invent a "proof link"
            //  - read-only run       → the model's answer, minus any URL and minus
            //                          internal sentinels like "Reached the step limit".
            if (wantsNotify && !abortRef.current && result.stopped !== 'aborted') {
              const hasLinks = runReceipts.length > 0
              let summary: string
              if (hasLinks) {
                summary = `Agent run summary:\n\n${runReceipts.join('\n\n')}`
              } else if (signingLocked) {
                summary = 'Agent run blocked by a guardrail. No funds moved this run.'
              } else {
                const ft = (result.finalText || '').trim()
                const internal = !ft || /^reached the step limit\.?$/i.test(ft) || /no answer returned/i.test(ft)
                summary = internal
                  ? 'Agent run complete. No on-chain action was taken.'
                  : ft.replace(/https?:\/\/\S+/g, '').replace(/\s{2,}/g, ' ').trim()
              }
              const sentMsg = hasLinks ? 'Summary sent on Telegram with the proof links.' : 'Summary sent on Telegram.'
              const sentMsgD = hasLinks ? 'Summary sent on Discord with the proof links.' : 'Summary sent on Discord.'
              const tgToken = settingsRef.current.telegramToken || ''
              const tgChat = settingsRef.current.telegramChatId || ''
              const dh = settingsRef.current.discordWebhook || ''
              if (tgToken && tgChat) {
                const ok = await sendTelegram(tgToken, tgChat, summary)
                appendLog(ok ? sentMsg : 'Telegram send failed (check Settings).', ok ? 'ok' : 'warn')
              } else if (dh && isDiscordWebhook(dh)) {
                const ok = await sendDiscord(dh, summary)
                appendLog(ok ? sentMsgD : 'Discord send failed (check Settings).', ok ? 'ok' : 'warn')
              } else {
                appendLog('Summary ready, but no messaging channel is configured (Settings → Integrations).', 'warn')
              }
            }
          }
        } else if (data.moduleType === 'council') {
          // ── Agent Council: several AI members vote on a proposal; a quorum
          //    rule decides, with ESCALATE as a human-in-the-loop safety valve. ──
          const aiCfg = settingsRef.current.aiKey
            ? {
                provider: settingsRef.current.aiProvider,
                apiKey: settingsRef.current.aiKey,
                model: settingsRef.current.aiModel,
                baseUrl: settingsRef.current.aiBaseUrl,
              }
            : undefined
          if (!aiCfg) {
            appendLog('Agent Council: add an AI key in Settings → AI to run the vote.', 'warn')
            txFailed = true
            branchStops = true
          } else {
            const proposal =
              substituteVars(String(params.proposal || '').trim(), bag) || '(no proposal given)'
            const members = String(params.members || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
            if (!members.length) members.push('Council member')
            const quorum = Math.max(1, Math.min(members.length, Number(params.quorum) || Math.ceil(members.length / 2)))
            appendLog(
              `🏛 Agent Council deliberating: "${proposal.slice(0, 80)}" — ${members.length} members, quorum ${quorum}.`,
              'info',
            )
            // Each member votes independently and in parallel.
            const votes = await Promise.all(
              members.map(async (role) => {
                const sys =
                  `You are "${role}" on an on-chain treasury council reviewing a proposal. ` +
                  'Vote exactly one of: APPROVE, REJECT, ABSTAIN, ESCALATE. ' +
                  'Use ESCALATE only when a human must decide (unusual, risky, or outside policy). ' +
                  'Reply on ONE line as: VOTE: <APPROVE|REJECT|ABSTAIN|ESCALATE> | <one short sentence why>.'
                const ans = ((await askText(aiCfg, sys, `Proposal: ${proposal}`)) || '').trim()
                const m = ans.match(/\b(APPROVE|REJECT|ABSTAIN|ESCALATE)\b/i)
                const vote = (m ? m[1].toUpperCase() : 'ABSTAIN') as
                  | 'APPROVE'
                  | 'REJECT'
                  | 'ABSTAIN'
                  | 'ESCALATE'
                const reason = (ans.includes('|') ? ans.slice(ans.indexOf('|') + 1) : ans).trim().slice(0, 160)
                return { role, vote, reason }
              }),
            )
            const mark = (v: string) =>
              v === 'APPROVE' ? '✅' : v === 'REJECT' ? '❌' : v === 'ESCALATE' ? '⚠️' : '➖'
            votes.forEach((v) => appendLog(`🏛 ${v.role}: ${mark(v.vote)} ${v.vote} — ${v.reason}`, 'info'))
            const approve = votes.filter((v) => v.vote === 'APPROVE').length
            const reject = votes.filter((v) => v.vote === 'REJECT').length
            const escalate = votes.filter((v) => v.vote === 'ESCALATE').length
            const abstain = votes.length - approve - reject - escalate
            const outcome: 'APPROVED' | 'REJECTED' | 'ESCALATED' =
              escalate > 0 ? 'ESCALATED' : approve >= quorum ? 'APPROVED' : 'REJECTED'
            const tally = `${approve} approve, ${reject} reject, ${escalate} escalate, ${abstain} abstain`
            appendLog(
              `🏛 Council decision: ${outcome} (${tally}; quorum ${quorum}).`,
              outcome === 'APPROVED' ? 'ok' : 'warn',
            )
            bag.council = outcome
            bag.counciltally = tally
            recordJournal({
              actor: 'Agent Council',
              kind: 'other',
              title: `Council ${outcome}: "${proposal.slice(0, 60)}" (${tally})`,
              status: outcome === 'APPROVED' ? 'success' : outcome === 'ESCALATED' ? 'blocked' : 'failed',
              net,
            })
            if (String(params.anchor) === 'Yes') {
              appendLog(
                '🏛 On-chain anchoring of the decision is the next step; the vote is recorded locally for now.',
                'info',
              )
            }
            // An escalation needs a human, so it stops the branch. An approve or a
            // clear reject is a finished decision the next step can act on via {{council}}.
            if (outcome === 'ESCALATED') branchStops = true
          }
        } else {
          handled = false
        }
        if (handled) {
          if (!txFailed && !branchStops) didAct = true
          setNodeStatus(id, txFailed ? 'error' : 'done')
          if (branchStops) {
            appendLog(
              txFailed ? '↳ Branch stops — the transaction did not go through.' : '↳ Branch stops here.',
              'warn',
            )
          } else {
            currentEdges.filter((e) => e.source === id).forEach((e) => queue.push(e.target))
          }
          continue
        }
      }

      // If an on-chain action falls through to simulation, say loudly why.
      if (['transfer', 'stake', 'callcontract', 'attest', 'x402', 'swap'].includes(data.moduleType)) {
        const why = !settingsRef.current.liveExecution
          ? 'turn ON “Execute real transactions” (Settings → Integrations → Casper)'
          : !hasAgentKey() && !walletKey
            ? 'no wallet is active — add a Wallet node (Autonomous) before this action and pick a funded wallet'
            : ''
        if (why) appendLog(`⚠️ ${def.label} ran in SIMULATION — to send for real: ${why}.`, 'warn')
      }

      const result = await def.simulate(params, {
        telegramToken: settingsRef.current.telegramToken || undefined,
        telegramChatId: settingsRef.current.telegramChatId || undefined,
        discordWebhook: settingsRef.current.discordWebhook || undefined,
        casperNet: settingsRef.current.casperNet,
        csprCloudKey: settingsRef.current.csprCloudKey || undefined,
        watchedAccount: settingsRef.current.watchedAccount || undefined,
        vars: bag,
        ai: settingsRef.current.aiKey
          ? {
              provider: settingsRef.current.aiProvider,
              apiKey: settingsRef.current.aiKey,
              model: settingsRef.current.aiModel,
              baseUrl: settingsRef.current.aiBaseUrl,
            }
          : undefined,
      })
      if (result.vars) {
        if (data.moduleType === 'ai') {
          // Give each AI node a distinct output var: {{ai}}, {{ai2}}, {{ai3}}…
          const vn = aiVarName(currentNodes, id)
          if (typeof result.vars.ai !== 'undefined') bag[vn] = result.vars.ai
          const dvn = vn === 'ai' ? 'aidecision' : `${vn}decision`
          if (typeof result.vars.aidecision !== 'undefined') bag[dvn] = result.vars.aidecision
        } else {
          Object.assign(bag, result.vars)
          if (data.moduleType === 'setvar' && String(params.persist ?? '').startsWith('Yes')) {
            Object.assign(agentMemory, result.vars)
          }
        }
      }
      appendLog(
        `${def.label} — ${result.output}`,
        result.pass === false ? 'warn' : 'step',
      )
      setNodeStatus(id, 'done')

      if (result.pass === false) {
        appendLog('↳ Branch stops here.', 'warn')
        continue
      }
      // A doer action that ran (incl. in simulation) counts as real progress.
      if (DOER_TYPES.has(data.moduleType)) didAct = true
      currentEdges.filter((e) => e.source === id).forEach((e) => queue.push(e.target))
    }

    appendLog('Run complete', 'ok')
    } catch (e) {
      appendLog(`Run error: ${e instanceof Error ? e.message : 'unexpected'} — agent reset.`, 'warn')
    } finally {
      setRunning(false)
      runningRef.current = false
    }
    // Monitors always "progress"; doers progress only when they actually acted.
    return !flowHasDoer || didAct
  }

  const stopLive = () => {
    if (liveTimer.current) clearInterval(liveTimer.current)
    liveTimer.current = null
    setLive(false)
    liveRef.current = false
    setLiveSchedule({ running: false })
    releaseWakeLock()
    debugLog('live', `Agent stopped after ${cycleCount.current} cycles`)
    appendLog(
      `Agent stopped after ${cycleCount.current} cycle${cycleCount.current > 1 ? 's' : ''}.`,
      'info',
    )
  }

  const goLive = () => {
    if (live) {
      stopLive()
      return
    }
    setRightTab('log')
    setShowRightPanel(true)
    const schedules = nodesRef.current.filter(
      (n) => (n.data as ModuleNodeData).moduleType === 'schedule',
    )
    if (schedules.length === 0) {
      appendLog('Add a Schedule trigger to go live — it defines how often the agent runs.', 'warn')
      return
    }
    // Compute the interval in ms from each schedule's interval + unit.
    // Ignore non-numeric values (e.g. "once") so the timer is never NaN.
    const unitMs = (u: string) =>
      u === 'seconds' ? 1_000 : u === 'hours' ? 3_600_000 : u === 'days' ? 86_400_000 : 60_000
    const msList = schedules
      .map((s) => {
        const p = (s.data as ModuleNodeData).params
        const n = Number(p?.interval)
        if (!Number.isFinite(n) || n <= 0) return null
        return n * unitMs(String(p?.unit ?? 'minutes'))
      })
      .filter((v): v is number => v !== null)
    const intervalMs = Math.max(5_000, msList.length ? Math.min(...msList) : 300_000)
    const runOnce = schedules.some(
      (s) => String((s.data as ModuleNodeData).params?.repeat) === 'Once after',
    )
    const human = (ms: number) => {
      const s = Math.round(ms / 1000)
      if (s < 60) return `${s} s`
      const m = Math.floor(s / 60)
      const ss = s % 60
      if (s < 3600) return ss ? `${m} min ${ss} s` : `${m} min`
      const h = Math.floor(m / 60)
      const mm = m % 60
      if (s < 86400) return mm ? `${h} h ${mm} min` : `${h} h`
      const days = Math.floor(h / 24)
      const hh = h % 24
      return hh ? `${days} d ${hh} h` : `${days} d`
    }
    const bannerLabel = runOnce ? `once in ${human(intervalMs)}` : `every ${human(intervalMs)}`
    setLiveInterval(bannerLabel)
    setLive(true)
    liveRef.current = true
    cycleCount.current = 0
    lastTick.current = 0
    offlineNotified.current = false
    noProgressStreak.current = 0
    acquireWakeLock()
    debugLog('live', `Agent started — ${bannerLabel}`)
    setLog([
      {
        t: now(),
        kind: 'ok',
        text: `Agent is LIVE — running ${bannerLabel}. Leave this tab open.`,
      },
    ])
    setLiveSchedule({ running: true, intervalMs, lastTickMs: Date.now() })
    const tick = () => {
      if (!navigator.onLine) {
        if (!offlineNotified.current) {
          appendLog('Offline — cycle skipped. Waiting for connection…', 'warn')
          offlineNotified.current = true
        }
        return
      }
      offlineNotified.current = false
      const nowMs = Date.now()
      if (lastTick.current > 0 && nowMs - lastTick.current > intervalMs * 2.2) {
        const missed = Math.max(1, Math.floor((nowMs - lastTick.current) / intervalMs) - 1)
        appendLog(
          `Computer slept or tab was suspended — ~${missed} cycle${missed > 1 ? 's' : ''} missed. Catching up now.`,
          'warn',
        )
        debugLog('live', `Sleep gap detected: ${Math.round((nowMs - lastTick.current) / 1000)}s`)
      }
      lastTick.current = nowMs
      setLiveSchedule({ lastTickMs: nowMs })
      cycleCount.current += 1
      runCycle(`Cycle ${cycleCount.current}`).then((progressed) => {
        if (!liveRef.current) return
        // A doer agent that keeps getting blocked (e.g. treasury dropped below the
        // guardrail and can't recover) would otherwise loop forever. After a few
        // no-progress cycles in a row, stop the agent automatically.
        const AUTO_STOP_AFTER = 3
        noProgressStreak.current = progressed ? 0 : noProgressStreak.current + 1
        if (noProgressStreak.current >= AUTO_STOP_AFTER) {
          appendLog(
            `Auto-stopped — ${AUTO_STOP_AFTER} cycles in a row were blocked before any on-chain action (the guardrail keeps stopping the run, and nothing it does will change that). Restart manually once conditions change.`,
            'info',
          )
          stopLive()
        }
      })
    }
    if (runOnce) {
      // One-shot: wait the delay, fire a single cycle, then stop.
      liveTimer.current = setTimeout(() => {
        tick()
        appendLog('One-shot schedule complete — agent stopped.', 'info')
        stopLive()
      }, intervalMs)
    } else {
      // Recurring: fire immediately, then every interval.
      tick()
      liveTimer.current = setInterval(tick, intervalMs)
    }
  }

  // Canvas tools — rendered floating (bottom-center) when the console is closed,
  // or docked in the center of the console header when it's open. Same buttons,
  // one source of truth.
  const canvasToolbarInner = (
    <>
      <button
        title={showConsole ? 'Hide live console' : 'Show live console'}
        className={`toolbar-console${showConsole ? ' toolbar-active' : ''}`}
        onClick={() => setShowConsole((v) => !v)}
      ><Icon name="terminal" size={15} /> <span>Console</span></button>
      <span className="toolbar-sep" />
      <button
        title="Pan mode — drag the canvas to move around"
        className={interactionMode === 'pan' ? 'toolbar-active' : ''}
        onClick={() => setMode('pan')}
      ><Icon name="hand" size={15} /></button>
      <button
        title="Select mode — drag to box-select nodes"
        className={interactionMode === 'select' ? 'toolbar-active' : ''}
        onClick={() => setMode('select')}
      ><Icon name="cursor" size={15} /></button>
      <span className="toolbar-sep" />
      <button title="Undo (Cmd+Z)" onClick={undo}><Icon name="rotate" size={15} /></button>
      <button title="Redo (Cmd+Shift+Z)" onClick={redo}><Icon name="redo" size={15} /></button>
      <span className="toolbar-sep" />
      <button title="Group selection (Cmd+G)" onClick={groupSelection}><Icon name="group" size={15} /></button>
      <button title="Ungroup" onClick={ungroupSelection}><Icon name="ungroup" size={15} /></button>
      <span className="toolbar-sep" />
      <button title="Tidy layout" onClick={tidy}><Icon name="layout" size={15} /></button>
      <button title="Duplicate selection (Cmd+D)" onClick={duplicateSelection}><Icon name="copy" size={15} /></button>
      <button title="Add note" onClick={addNote}><Icon name="note" size={15} /></button>
      <span className="toolbar-sep" />
      <button title="Delete selection" className="toolbar-danger" onClick={deleteSelection}><Icon name="trash" size={15} /></button>
      <span className="toolbar-sep" />
      <button title="Zoom out" onClick={() => zoomOut({ duration: 200 })}><Icon name="zoom-out" size={15} /></button>
      <button title="Zoom in" onClick={() => zoomIn({ duration: 200 })}><Icon name="zoom-in" size={15} /></button>
      <button title="Fit / recenter view" onClick={() => fitView({ padding: 0.2, duration: 300 })}><Icon name="fit-view" size={15} /></button>
      <button
        title={locked ? 'Unlock canvas (allow moving nodes)' : 'Lock canvas (prevent moving nodes)'}
        className={locked ? 'toolbar-active' : ''}
        onClick={() => setLocked((v) => !v)}
      ><Icon name={locked ? 'lock' : 'lock-open'} size={15} /></button>
    </>
  )

  return (
    <div className="app" style={{ ['--ui-scale' as string]: settings.scale }}>
      <HelpHints enabled={settings.help !== false} />
      <div
        className="brand"
        onClick={() => {
          // Pan the canvas by the palette width so nodes stay put on screen when
          // the sidebar collapses/expands (the canvas grows/shrinks on the left).
          const v = getViewport()
          setViewport({ ...v, x: v.x + (paletteOpen ? paletteWidth : -paletteWidth) })
          setPaletteOpen((o) => !o)
        }}
        title={paletteOpen ? 'Hide the modules sidebar' : 'Show the modules sidebar'}
      >
        <Logo size={39} />
        <div className="brand-textcol">
          <span className="brand-name">CasperFlow</span>
          <button
            className={`brand-net${settings.casperNet === 'mainnet' ? ' mainnet' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              if (settings.casperNet === 'mainnet') setSettings({ ...settings, casperNet: 'testnet' })
              else setConfirmMainnet(true)
            }}
            title="Switch network (Testnet / Mainnet)"
          >
            <span className="net-dot" /> {settings.casperNet === 'mainnet' ? 'Mainnet' : 'Testnet'}
          </button>
        </div>
      </div>
      <header
        className={`topbar${paletteOpen ? '' : ' collapsed'}`}
        style={{
          paddingLeft: paletteWidth + 26,
          ['--sidebar-w' as string]: paletteOpen ? `${paletteWidth}px` : '0px',
        }}
      >
        <div className="topbar-left">
          <WorkspaceBar
            workspaces={workspaces}
            activeId={activeId}
            onSwitch={switchWorkspace}
            onCreate={createWorkspace}
            onRename={renameWorkspace}
            onDuplicate={duplicateWorkspace}
            onDelete={deleteWorkspace}
            onExport={exportCurrent}
            onImport={importFromFile}
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={onImportFile}
        />
        <div className="topbar-actions">
          {live && (
            <span className="badge-live">
              <span className="live-dot" /> LIVE · {liveInterval}
            </span>
          )}
          <button
            className="btn-secondary btn-icon"
            onClick={() => setShowJournal(true)}
            title="A day-by-day diary of every on-chain action"
          >
            <Icon name="note" size={14} /> Journal
          </button>
          <span className="tb-div" />
          <button
            className="btn-secondary btn-icon"
            onClick={() => {
              setSettingsTab('connections')
              setShowSettings(true)
            }}
          >
            <Icon name="link" size={14} /> Integrations
          </button>
          <button
            className="btn-secondary btn-icon"
            onClick={() => {
              setSettingsTab('interface')
              setShowSettings(true)
            }}
          >
            <Icon name="gear" size={14} /> Settings
          </button>
          <span className="tb-div" />
          <button
            className={`btn-run btn-icon${running && !live ? ' active-run btn-stop' : ''}`}
            onClick={() => {
              // While a run is in flight, the same button becomes Stop (triangle → square).
              if (running && !live) {
                stopRun()
                return
              }
              setRightTab('log')
              setShowRightPanel(true)
              runCycle()
            }}
            disabled={live}
            title={running && !live ? 'Stop the current run' : 'Run the flow once'}
          >
            {running && !live && <BorderSparks color="#f87171" />}
            <Icon name={running && !live ? 'square' : 'play'} size={13} />{' '}
            {running && !live ? 'Stop' : 'Run once'}
          </button>
          <button
            className={`btn-primary btn-icon${live ? ' btn-stop' : ''}`}
            onClick={goLive}
          >
            {live && <BorderSparks color="#f87171" />}
            <Icon name={live ? 'x' : 'zap'} size={13} /> {live ? 'Stop agent' : 'Go live'}
          </button>
        </div>
      </header>
      <div className="main">
        {paletteOpen && (
        <aside className="palette" style={{ width: paletteWidth }}>
          <input
            className="palette-search"
            type="text"
            placeholder="Search modules…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {(Object.keys(CATEGORY_LABELS) as ModuleCategory[]).map((cat) => {
            const q = search.trim().toLowerCase()
            const items = MODULES.filter(
              (m) => m.category === cat && !m.hidden && m.label.toLowerCase().includes(q),
            )
            if (items.length === 0) return null
            const open = q.length > 0 || !collapsedCats.includes(cat)
            return (
              <div key={cat} className="palette-group">
                <button
                  className="palette-title palette-title-btn"
                  onClick={() => toggleCat(cat)}
                >
                  <Icon
                    name="chevron"
                    size={15}
                    className="palette-chevron"
                    style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
                  />
                  <span className="palette-dot" style={{ background: CATEGORY_COLORS[cat].border }} />
                  {CATEGORY_LABELS[cat]}
                  <span className="palette-count">{items.length}</span>
                </button>
                {open &&
                  items.map((m) => {
                    const st = statusOf(m.type)
                    return (
                      <div
                        key={m.type}
                        className={`palette-item${st === 'soon' ? ' palette-soon' : ''}`}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('application/casperflow', m.type)}
                        style={{ ['--item-color' as string]: CATEGORY_COLORS[cat].border }}
                        title={m.describe(defaultParams(m))}
                      >
                        <Icon name={m.icon} size={15} className="palette-icon" /> {m.label}
                        {st === 'soon' && <span className="palette-soon-tag">Soon</span>}
                        {st === 'beta' && <span className="palette-beta-tag">Beta</span>}
                      </div>
                    )
                  })}
              </div>
            )
          })}
          <button
            className="palette-title palette-title-btn palette-templates-cta"
            onClick={() => setShowGallery(true)}
            title="Browse agent templates"
          >
            <span className="palette-chev-spacer" />
            <span className="palette-dot" style={{ background: '#94a3b8' }} />
            Templates
            <span className="palette-count">{AGENT_TEMPLATES.filter((t) => t.id !== 'blank').length}</span>
          </button>
          <div className="palette-hint">
            Drag a module onto the canvas.<br />
            Right-click = options · Double-click = configure.
          </div>
          <div className="palette-resizer" onMouseDown={startPaletteResize} />
        </aside>
        )}
        <div
          className="canvas"
          ref={wrapper}
          style={{
            ['--panel-offset' as string]: `${(showRightPanel ? 0 : logWidth / 2) - (paletteOpen ? 0 : paletteWidth / 2)}px`,
          }}
          onContextMenuCapture={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const t = e.target as HTMLElement
            if (t.closest('.react-flow__nodesselection')) {
              menuAt(e, 'selection')
              return
            }
            const nodeEl = t.closest('.react-flow__node')
            if (nodeEl) {
              const id = nodeEl.getAttribute('data-id') ?? undefined
              menuAt(e, 'node', id)
              return
            }
            const edgeEl = t.closest('.react-flow__edge')
            if (edgeEl) {
              const id = edgeEl.getAttribute('data-id') ?? undefined
              const sel = edgesRef.current.filter((x) => x.selected).map((x) => x.id)
              // Right-clicking an already-selected cable keeps the whole multi-selection;
              // right-clicking an unselected one selects just it.
              if (id && (!sel.includes(id) || sel.length <= 1)) {
                menuEdgeSelRef.current = [id]
                setEdges((eds) => eds.map((ed) => ({ ...ed, selected: ed.id === id })))
              } else {
                menuEdgeSelRef.current = sel
              }
              menuAt(e, 'edge', id)
              return
            }
            // Pane: keep the current cable selection so the menu can delete it.
            menuEdgeSelRef.current = edgesRef.current.filter((x) => x.selected).map((x) => x.id)
            menuAt(e, 'pane')
          }}
          onPointerDownCapture={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
            const el = (e.target as HTMLElement).closest('.react-flow__node')
            if (!el) return
            const id = el.getAttribute('data-id')
            if (!id) return
            const node = nodesRef.current.find((n) => n.id === id)
            if (node && !node.selected) {
              setNodes((nds) =>
                nds.map((n) =>
                  n.selected !== (n.id === id) ? { ...n, selected: n.id === id } : n,
                ),
              )
            }
          }}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).classList?.contains('react-flow__pane')) {
              setNodes((nds) =>
                nds.map((n) =>
                  n.data.flipped ? { ...n, data: { ...n.data, flipped: false } } : n,
                ),
              )
            }
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ type: 'pulse', interactionWidth: 14 }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeContextMenu={(e, node) => menuAt(e, 'node', node.id)}
            onEdgeContextMenu={(e, edge) => {
              // Keep an existing multi-selection if the right-clicked edge is part of it;
              // otherwise select just this one. Capture the set so the menu can act on it.
              const eds = edgesRef.current
              const clicked = eds.find((x) => x.id === edge.id)
              const selCount = eds.filter((x) => x.selected).length
              if (!clicked?.selected || selCount <= 1) {
                menuEdgeSelRef.current = [edge.id]
                setEdges((es) => es.map((ed) => ({ ...ed, selected: ed.id === edge.id })))
              } else {
                menuEdgeSelRef.current = eds.filter((x) => x.selected).map((x) => x.id)
              }
              menuAt(e, 'edge', edge.id)
            }}
            onPaneContextMenu={(e) => {
              menuEdgeSelRef.current = edgesRef.current.filter((x) => x.selected).map((x) => x.id)
              menuAt(e as React.MouseEvent, 'pane')
            }}
            onPaneClick={() => {
              setMenu(null)
              setNodes((nds) =>
                nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
              )
              setEdges((eds) =>
                eds.map((e) => (e.selected ? { ...e, selected: false } : e)),
              )
              // Clicking empty canvas clears properties → back to the log.
              setSelectedNodeId(null)
              setRightTab('log')
            }}
            onNodeClick={(e, node) => {
              const multi = e.metaKey || e.ctrlKey
              setNodes((nds) =>
                nds.map((n) => {
                  if (multi) {
                    return n.id === node.id ? { ...n, selected: !node.selected } : n
                  }
                  return n.selected !== (n.id === node.id)
                    ? { ...n, selected: n.id === node.id }
                    : n
                }),
              )
              // Open this node's properties in the right panel.
              setSelectedNodeId(node.id)
              setRightTab('props')
            }}
            onNodeDragStart={(e, node) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey) return
              if (!node.selected) {
                setNodes((nds) =>
                  nds.map((n) =>
                    n.selected !== (n.id === node.id)
                      ? { ...n, selected: n.id === node.id }
                      : n,
                  ),
                )
              }
            }}
            selectNodesOnDrag={false}
            elevateNodesOnSelect={false}
            nodeDragThreshold={5}
            panOnDrag={interactionMode === 'pan' ? true : [1, 2]}
            selectionOnDrag={interactionMode === 'select'}
            selectionMode={SelectionMode.Partial}
            onSelectionStart={(e) => {
              const me = e as unknown as MouseEvent
              selStartRef.current = { x: me.clientX, y: me.clientY }
            }}
            onSelectionEnd={(e) => {
              // After a rubber-band drag, also select every cable the box crossed.
              const start = selStartRef.current
              selStartRef.current = null
              if (!start) return
              const me = e as unknown as MouseEvent
              const a = screenToFlowPosition({ x: start.x, y: start.y })
              const b = screenToFlowPosition({ x: me.clientX, y: me.clientY })
              const r: Rect = {
                x: Math.min(a.x, b.x),
                y: Math.min(a.y, b.y),
                w: Math.abs(a.x - b.x),
                h: Math.abs(a.y - b.y),
              }
              // Ignore a mere click (no real drag) so we never clear by accident.
              if (r.w < 5 && r.h < 5) return
              selectEdgesInRect(r, me.shiftKey || me.metaKey)
            }}
            onNodeDrag={(_, node) => {
              if (settings.collide) setNodes((nds) => pushApart(nds, node.id))
            }}
            onNodeDragStop={(_, node) => {
              setNodes((nds) => {
                let out = leaveGroupIfOutside(nds, node.id)
                out = adoptIntoGroup(out, node.id)
                out = fitGroups(out)
                if (settings.collide) {
                  out = pushApart(out, node.id)
                  out = fitGroups(out)
                }
                return out
              })
              refreshInternals(
                nodesRef.current
                  .filter((n) => n.type === 'module')
                  .map((n) => n.id),
              )
            }}
            snapToGrid={settings.snap}
            snapGrid={[20, 20]}
            nodesDraggable={!locked}
            nodesConnectable={!locked}
            elementsSelectable={!locked}
            zoomOnDoubleClick={false}
            connectionRadius={32}
            minZoom={0.15}
            maxZoom={2.5}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
            proOptions={{ hideAttribution: true }}
          >
            {settings.grid && <Background gap={24} color="#2a3550" />}
            {settings.minimap && (
              <MiniMap
                pannable
                maskColor="rgba(7, 10, 18, 0.72)"
                nodeBorderRadius={12}
                nodeStrokeWidth={2}
                nodeColor={(n) => {
                  const def = moduleByType((n.data as ModuleNodeData).moduleType)
                  return def ? `${CATEGORY_COLORS[def.category].border}40` : '#47556940'
                }}
                nodeStrokeColor={(n) => {
                  const def = moduleByType((n.data as ModuleNodeData).moduleType)
                  return def ? CATEGORY_COLORS[def.category].border : '#475569'
                }}
              />
            )}
          </ReactFlow>
          <div className="ai-cmdbar">
            {cmdBusy && <BorderSparks color="#a78bfa" />}
            <textarea
              ref={cmdRef}
              className="ai-cmdbar-input"
              rows={1}
              placeholder="Ask AI to build or change this agent — e.g. “add a Telegram alert when it sells”"
              value={cmdValue}
              onChange={(e) => setCmdValue(e.target.value)}
              onInput={resizeCmd}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  runAiCommand()
                }
              }}
              disabled={cmdBusy}
            />
            <button
              className="ai-cmdbar-btn"
              onClick={runAiCommand}
              disabled={cmdBusy || !cmdValue.trim()}
              title="Apply — build or edit the agent"
            >
              {cmdBusy ? <span className="spinner" /> : <Icon name="sparkles" size={16} />}
            </button>
          </div>
          {!showConsole && <div className="canvas-toolbar">{canvasToolbarInner}</div>}
          {menu && (
            <ContextMenu
              menu={menu}
              nodeKind={
                (nodes.find((n) => n.id === menu.id)?.type as 'module' | 'group' | 'note') ??
                'module'
              }
              inGroup={!!nodes.find((n) => n.id === menu.id)?.parentId}
              selectionCount={nodes.filter((n) => n.selected && n.type === 'module' && !n.parentId).length}
              selectedEdgeCount={menuEdgeSelRef.current.length}
              edgeCount={edges.length}
              onClose={() => setMenu(null)}
              onGroupSelection={groupSelection}
              onUngroup={ungroupById}
              onRemoveFromGroup={removeFromGroup}
              onUngroupAllOf={ungroupAllOf}
              onDuplicateSelection={duplicateSelection}
              onDeleteSelection={deleteSelection}
              onAddNote={addNote}
              onNodeParams={flipNode}
              onNodeDuplicate={duplicateNode}
              onNodeDelete={deleteNode}
              onEdgeDelete={deleteEdge}
              onDeleteSelectedEdges={deleteSelectedEdges}
              onDeleteAllEdges={deleteAllEdges}
              onSelectAllEdges={selectAllEdges}
              onClearCanvas={clearCanvas}
            />
          )}
        </div>
        {!showRightPanel && (
          <button
            className="rightpanel-reopen"
            onClick={() => setShowRightPanel(true)}
            title="Show panel"
          >
            <Icon name="chevron" size={16} style={{ transform: 'rotate(180deg)' }} />
          </button>
        )}
        {showRightPanel && (
        <aside className="logpanel" style={{ width: logWidth }}>
          <div className="logpanel-resizer" onMouseDown={startLogResize} />
          <div className="rightpanel-tabs">
            <div className="rp-tabgroup">
              {(() => {
                const sn = nodes.find((n) => n.id === selectedNodeId)
                const sdef = sn ? moduleByType((sn.data as ModuleNodeData).moduleType) : undefined
                const lbl = sdef ? sdef.label.replace(/\s*\([^)]*\)/g, '').trim() : ''
                const color = sdef ? CATEGORY_COLORS[sdef.category]?.border : undefined
                return (
                  <button
                    className={`rp-tab${rightTab === 'props' ? ' active' : ''}`}
                    onClick={() => setRightTab('props')}
                    style={
                      color
                        ? ({ '--rp-accent': color, '--rp-accent-text': color } as React.CSSProperties)
                        : undefined
                    }
                  >
                    <Icon name="gear" size={14} /> {lbl ? `${lbl} Properties` : 'Properties'}
                  </button>
                )
              })()}
              <button
                className={`rp-tab${rightTab === 'log' ? ' active' : ''}`}
                onClick={() => setRightTab('log')}
              >
                <Icon name="file-code" size={14} /> Log
              </button>
            </div>
            <div className="rp-actions">
              {rightTab === 'log' && (
                <>
                  {clearedLogs.length > 0 && (
                    <button
                      className="rp-action"
                      onClick={() => {
                        // Bring back the most recently cleared log.
                        setClearedLogs((h) => {
                          const [last, ...rest] = h
                          if (last) setLog(last)
                          return rest
                        })
                      }}
                      title={`Restore the last cleared log (${clearedLogs.length} in history)`}
                    >
                      <Icon name="rotate" size={15} />
                    </button>
                  )}
                  <button
                    className="rp-action"
                    onClick={() => {
                      // Keep a snapshot so an accidental clear can be undone.
                      setClearedLogs((h) => (log.length ? [log, ...h].slice(0, 10) : h))
                      setLog([])
                      // Also reset every node back to its idle state (clears the
                      // green "done" / red "error" rings + the check / cross icons).
                      setNodes((nds) =>
                        nds.map((n) =>
                          (n.data as ModuleNodeData)?.status &&
                          (n.data as ModuleNodeData).status !== 'idle'
                            ? { ...n, data: { ...n.data, status: 'idle' } }
                            : n,
                        ),
                      )
                    }}
                    title="Clear the log and reset node states"
                    disabled={log.length === 0}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                  <span className="rp-div" />
                </>
              )}
              <button
                className="rp-collapse"
                onClick={() => setShowRightPanel(false)}
                title="Collapse panel"
              >
                <Icon name="panel-right" size={16} />
              </button>
            </div>
          </div>
          {rightTab === 'props' ? (
            (() => {
              const sn = nodes.find((n) => n.id === selectedNodeId)
              if (!sn || sn.type !== 'module') {
                return (
                  <div className="props-empty">
                    <Icon name="cursor" size={22} />
                    <span>Click an action on the canvas to edit its properties here.</span>
                  </div>
                )
              }
              const def = moduleByType((sn.data as ModuleNodeData).moduleType)
              return (
                <div className="props-body">
                  <div className="props-head">
                    <Icon
                      name={def?.icon ?? 'gear'}
                      size={16}
                      style={{ color: def ? CATEGORY_COLORS[def.category].border : '#94a3b8' }}
                    />
                    <span>{def?.label ?? 'Action'}</span>
                  </div>
                  <NodeConfig key={sn.id} id={sn.id} data={sn.data as ModuleNodeData} />
                </div>
              )
            })()
          ) : (
            <div className="log-wrap">
              <div className="log" ref={logRef}>
                {log.map((e, i) => (
                  <div key={i} className={`log-line log-${e.kind}`}>
                    <span className="log-time">{e.t}</span>
                    <span className="log-text">{linkify(e.text)}</span>
                  </div>
                ))}
              </div>
              {log.length > 0 && (
                <button
                  className="log-explain-fab"
                  onClick={explainRun}
                  title="Optional: let the AI explain what happened in this run"
                >
                  <Icon name="sparkles" size={14} /> Explain run
                </button>
              )}
            </div>
          )}
        </aside>
        )}
      </div>
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
          initialTab={settingsTab}
          onOpenWiki={() => {
            setShowSettings(false)
            setShowWiki(true)
          }}
        />
      )}
      {showConsole && (
        <ConsolePanel
          onClose={() => setShowConsole(false)}
          leftOffset={paletteOpen ? paletteWidth : 0}
          rightOffset={showRightPanel ? logWidth : 0}
          height={consoleHeight}
          onHeightChange={setConsoleHeight}
          centerSlot={
            <div
              className="console-tools-slot"
              style={paletteOpen ? undefined : { transform: `translateX(${paletteWidth / 2}px)` }}
            >
              <div className="canvas-toolbar in-console">{canvasToolbarInner}</div>
            </div>
          }
        />
      )}
      {pendingApproval && (
        <div className="approval-overlay">
          <div className="approval-modal">
            <div className="approval-modal-icon">
              <Icon name="shield" size={22} />
            </div>
            <div className="approval-modal-title">
              Approve transaction
              {pendingApproval.total > 1 && (
                <span className="approval-modal-count">
                  {' '}
                  {pendingApproval.index} of {pendingApproval.total}
                </span>
              )}
            </div>
            <div className="approval-modal-action">{pendingApproval.action}</div>
            <div className="approval-modal-detail">{pendingApproval.detail}</div>
            <div className="approval-modal-from">
              from {pendingApproval.wallet ? `"${pendingApproval.wallet}" · ` : ''}
              {pendingApproval.from.slice(0, 8)}…{pendingApproval.from.slice(-6)} ·{' '}
              {pendingApproval.net}
            </div>
            <div className="approval-modal-actions">
              <button className="btn-secondary settings-test" onClick={() => resolveApproval(false)}>
                Reject
              </button>
              <button className="btn-primary settings-test" onClick={() => resolveApproval(true)}>
                <Icon name="check" size={13} /> Approve & sign
              </button>
            </div>
          </div>
        </div>
      )}
      {goLivePrompt && walletMissing && (
        <div className="golive-prompt">
          <div className="golive-prompt-row">
            <div className="golive-prompt-icon">
              <Icon name="wallet" size={20} />
            </div>
            <div className="golive-prompt-text">
              <strong>Choose the paying wallet first</strong>
              <span>
                This agent sends CSPR, but no paying wallet is selected. Open the Wallet card and pick the
                wallet that pays before you run.
              </span>
            </div>
          </div>
          <div className="golive-prompt-actions">
            <button className="btn-secondary settings-test" onClick={() => setGoLivePrompt(false)}>
              Not yet
            </button>
            <button
              className="btn-primary settings-test"
              onClick={() => {
                setGoLivePrompt(false)
                const w = nodesRef.current.find((n) => (n.data as ModuleNodeData).moduleType === 'wallet')
                if (w) {
                  setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === w.id })))
                  setRightTab('props')
                  setShowRightPanel(true)
                }
              }}
            >
              <Icon name="wallet" size={13} /> Choose wallet
            </button>
          </div>
        </div>
      )}
      {goLivePrompt && !walletMissing && (
        <div className="golive-prompt">
          <div className="golive-prompt-row">
            <div className="golive-prompt-icon">
              <Icon name="zap" size={20} />
            </div>
            <div className="golive-prompt-text">
              <strong>Your agent is ready</strong>
              <span>Start running it now, or keep editing?</span>
            </div>
          </div>
          <button
            type="button"
            className="golive-sign-toggle"
            onClick={() => setAutoSign((v) => !v)}
          >
            <span className={`gst-switch${autoSign ? ' on' : ''}`}>
              <span className="gst-knob" />
            </span>
            <span className="gst-label">
              <strong>{autoSign ? 'Sign transactions automatically' : 'Sign each transaction manually'}</strong>
              <span>
                {autoSign
                  ? 'Fully autonomous — no wallet popup. Needs a funded wallet.'
                  : 'You approve every transaction (wallet popup each time).'}
              </span>
            </span>
          </button>
          <div className="golive-prompt-actions">
            <button className="btn-secondary settings-test" onClick={() => setGoLivePrompt(false)}>
              Not yet
            </button>
            <button
              className="btn-run settings-test"
              onClick={() => {
                autoSignRef.current = autoSign
                setGoLivePrompt(false)
                setRightTab('log')
                setShowRightPanel(true)
                runCycle()
              }}
              title="Execute the workflow a single time"
            >
              <Icon name="play" size={13} /> Run once
            </button>
            <button
              className="btn-primary settings-test"
              onClick={() => {
                autoSignRef.current = autoSign
                setGoLivePrompt(false)
                goLive()
              }}
            >
              <Icon name="zap" size={13} /> Go live
            </button>
          </div>
        </div>
      )}
      {showWiki && <WikiPanel onClose={() => setShowWiki(false)} />}
      {showJournal && (
        <JournalView
          onClose={() => setShowJournal(false)}
          aiConfig={
            settings.aiKey
              ? {
                  provider: settings.aiProvider,
                  apiKey: settings.aiKey,
                  model: settings.aiModel,
                  baseUrl: settings.aiBaseUrl,
                }
              : undefined
          }
        />
      )}
      {confirmMainnet && (
        <div className="confirm-overlay" onClick={() => setConfirmMainnet(false)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon"><Icon name="shield" size={22} /></div>
            <h3 className="confirm-title">Switch to Mainnet?</h3>
            <p className="confirm-text">
              You are about to switch CasperFlow to the <b>Casper Mainnet</b>. On mainnet,
              agents sign and submit <b>real transactions that move real CSPR</b>. Make sure
              you only use a wallet you intend to spend from. Keep building and testing on
              Testnet unless you are ready to go live.
            </p>
            <div className="confirm-actions">
              <button className="btn-secondary settings-test" onClick={() => setConfirmMainnet(false)}>
                Cancel
              </button>
              <button
                className="btn-primary settings-test"
                onClick={() => {
                  setSettings({ ...settings, casperNet: 'mainnet' })
                  setConfirmMainnet(false)
                }}
              >
                Switch to Mainnet
              </button>
            </div>
          </div>
        </div>
      )}
      {showGallery && (
        <TemplateGallery
          onPick={createFromTemplate}
          onBuildWithAI={buildWithAI}
          aiReady={!!settings.aiKey}
          onClose={() => setShowGallery(false)}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  )
}
