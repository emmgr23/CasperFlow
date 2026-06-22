// Permanent ledger of real on-chain actions, across runs and workspaces, stored
// locally so it survives sessions. This is the data layer for the Dashboard: the
// AI narrates these recorded FACTS (it never invents numbers), and the exact rows
// are shown underneath. Distinct from the ephemeral per-run Log.

export interface JournalEntry {
  id: string
  time: number // epoch ms
  actor?: string // agent role / flow name that did it
  kind: 'transfer' | 'attest' | 'x402' | 'stake' | 'deploy' | 'mint' | 'other'
  title: string // human one-line summary
  amount?: number // CSPR moved
  to?: string // recipient (name or key)
  hash?: string
  url?: string // explorer link
  status: 'success' | 'failed' | 'pending'
  gasMotes?: number // gas cost in motes (held + refundable on Casper 2.0)
  net?: string
}

const KEY = 'casperflow-journal-v1'
const MAX = 800

function read(): JournalEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function write(list: JournalEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* storage unavailable */
  }
}

const subs = new Set<() => void>()
export function subscribeJournal(fn: () => void): () => void {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}

export function getJournal(): JournalEntry[] {
  return read()
}

export function clearJournal(): void {
  write([])
  subs.forEach((f) => f())
}

export function recordJournal(e: Omit<JournalEntry, 'id' | 'time'> & { time?: number }): void {
  const entry: JournalEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    time: e.time ?? Date.now(),
    ...e,
  }
  const list = read()
  list.unshift(entry)
  write(list)
  subs.forEach((f) => f())
}
