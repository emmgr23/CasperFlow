// Shared runtime state: agent memory (persisted variables) + debug log.

// ── Agent memory (Set variable with "remember across runs") ──
export const agentMemory: Record<string, string | number> = {}

export function clearAgentMemory() {
  for (const k of Object.keys(agentMemory)) delete agentMemory[k]
  notify()
}

// ── Debug log (ring buffer, shown in Settings → Logs) ──
export interface DebugEntry {
  t: string
  tag: string
  msg: string
}

const buf: DebugEntry[] = []
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function debugLog(tag: string, msg: string) {
  buf.push({ t: new Date().toLocaleTimeString('en-GB'), tag, msg })
  if (buf.length > 300) buf.shift()
  notify()
}

export const getDebugLog = (): DebugEntry[] => [...buf]

export function clearDebugLog() {
  buf.length = 0
  notify()
}

export function subscribeRuntime(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

// ── Capture browser console + uncaught errors into the Live console ──
let consoleCaptured = false
function stringifyArg(a: unknown): string {
  if (typeof a === 'string') return a
  if (a instanceof Error) return a.message
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}
export function captureConsole() {
  if (consoleCaptured || typeof window === 'undefined') return
  consoleCaptured = true
  // Benign framework noise we don't want cluttering the Live console.
  const NOISE = [
    'nodeTypes',
    'edgeTypes',
    '[React Flow]',
    "Couldn't create edge",
    'React DevTools',
    'Download the React',
    'ReactDOM.render',
    'defaultProps',
  ]
  const wrap =
    (kind: 'warn' | 'error', orig: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      try {
        const msg = args.map(stringifyArg).join(' ')
        if (!NOISE.some((n) => msg.includes(n))) debugLog(`console:${kind}`, msg)
      } catch {
        /* ignore */
      }
      orig(...args)
    }
  console.warn = wrap('warn', console.warn.bind(console))
  console.error = wrap('error', console.error.bind(console))
  window.addEventListener('error', (e) => debugLog('error', e.message || 'Uncaught error'))
  window.addEventListener('unhandledrejection', (e) =>
    debugLog('error', `Unhandled promise: ${stringifyArg((e as PromiseRejectionEvent).reason)}`),
  )
}

// ── Live schedule state (drives the countdown ring on Schedule nodes) ──
export interface LiveSchedule {
  running: boolean
  intervalMs: number
  lastTickMs: number // Date.now() of the most recent cycle start
}

let liveSchedule: LiveSchedule = { running: false, intervalMs: 0, lastTickMs: 0 }

export const getLiveSchedule = (): LiveSchedule => liveSchedule

export function setLiveSchedule(patch: Partial<LiveSchedule>) {
  liveSchedule = { ...liveSchedule, ...patch }
  notify()
}

// ── Just-submitted transactions, shown instantly while CSPR.cloud indexes them ──
export interface RecentTx {
  hash: string
  amount: number
  timestamp: string
  out: boolean
  peer: string
  pending?: boolean
}
const recentTxs: Record<string, RecentTx[]> = {}
export function addRecentTx(publicHex: string, tx: RecentTx) {
  const key = (publicHex || '').toLowerCase()
  if (!key) return
  recentTxs[key] = [{ ...tx, pending: true }, ...(recentTxs[key] || [])].slice(0, 10)
  notify()
}
export function getRecentTxs(publicHex: string): RecentTx[] {
  return recentTxs[(publicHex || '').toLowerCase()] || []
}
// Drop pending txs that are now indexed (hash known) or older than maxAge (confirmed).
export function prunePendingTx(publicHex: string, knownHashes: Set<string>, maxAgeMs = 120_000) {
  const key = (publicHex || '').toLowerCase()
  const list = recentTxs[key]
  if (!list || !list.length) return
  const now = Date.now()
  const next = list.filter(
    (t) =>
      !knownHashes.has((t.hash || '').toLowerCase()) &&
      now - new Date(t.timestamp).getTime() < maxAgeMs,
  )
  if (next.length !== list.length) {
    recentTxs[key] = next
    notify()
  }
}
