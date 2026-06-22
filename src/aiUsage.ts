// Per-profile daily AI usage (calls + tokens), stored locally and reset each day.
// A profile is keyed by provider:model:last-6-of-key, so the same key/model pair
// shares its counter wherever it's used. Reset is per calendar day (local time),
// an approximation of the provider's own daily reset.

const KEY = 'casperflow-ai-usage-v1'

type Ident = { provider: string; model: string; apiKey: string }
type Rec = { date: string; calls: number; tokens: number }
type Store = Record<string, Rec>

const todayStr = () => new Date().toISOString().slice(0, 10)

export function usageKeyFor(c: Ident): string {
  return `${c.provider}:${c.model}:${(c.apiKey || '').slice(-6)}`
}

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as Store
  } catch {
    return {}
  }
}

function write(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable */
  }
}

export function getUsage(c: Ident): { calls: number; tokens: number } {
  const r = read()[usageKeyFor(c)]
  if (!r || r.date !== todayStr()) return { calls: 0, tokens: 0 }
  return { calls: r.calls, tokens: r.tokens }
}

export function recordUsage(c: Ident, tokens: number) {
  const s = read()
  const k = usageKeyFor(c)
  const today = todayStr()
  const r = s[k] && s[k].date === today ? s[k] : { date: today, calls: 0, tokens: 0 }
  r.calls += 1
  r.tokens += Math.max(0, Math.round(tokens || 0))
  s[k] = r
  write(s)
  subs.forEach((f) => f())
}

// Lightweight subscription so the Settings UI refreshes live as calls happen.
type Fn = () => void
const subs = new Set<Fn>()
export function subscribeUsage(fn: Fn): () => void {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}
