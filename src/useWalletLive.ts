import { useCallback, useEffect, useState } from 'react'
import { getAccountBalance, getRecentTransfers, type Transfer, type CasperNet, type CsprError } from './casper'
import { getRecentTxs, prunePendingTx, subscribeRuntime } from './runtime'

// Turn a CSPR.cloud failure into a short label (for the node) + a full message.
function describeCsprError(e: CsprError | null): { label: string; message: string } {
  switch (e?.kind) {
    case 'rate-limit':
      return {
        label: 'rate limited',
        message: 'CSPR.cloud rate limit (HTTP 429) — too many requests. It recovers on its own in a moment.',
      }
    case 'auth':
      return {
        label: 'key rejected',
        message: `CSPR.cloud rejected the key (HTTP ${e.status}) — check it in Settings, or the free quota may be used up.`,
      }
    case 'not-found':
      return { label: 'unfunded', message: 'This account is not on-chain yet — fund it via the faucet.' }
    case 'network':
      return { label: 'offline', message: 'Network / proxy error — is the dev server running and online?' }
    default:
      return { label: 'read error', message: 'Could not read balance — check the CSPR.cloud key & network.' }
  }
}

// Reads the CSPR.cloud key + network straight from saved settings so node
// components can fetch live data without prop-drilling.
function readCsprSettings(): { net: CasperNet; key: string } {
  try {
    const s = JSON.parse(localStorage.getItem('casperflow-settings-v1') || '{}')
    return { net: s.casperNet === 'mainnet' ? 'mainnet' : 'testnet', key: s.csprCloudKey || '' }
  } catch {
    return { net: 'testnet', key: '' }
  }
}

// Live balance (and optionally the last transfers) for a public key.
// Polls every 12s and exposes a manual refresh.
export function useWalletLive(publicHex: string, withTransfers = false) {
  const [balance, setBalance] = useState<number | null>(null)
  const [transfers, setTransfers] = useState<Transfer[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorLabel, setErrorLabel] = useState('')
  const [, force] = useState(0)

  // Re-render when a transaction is submitted (to show it instantly as pending).
  useEffect(() => subscribeRuntime(() => force((n) => n + 1)), [])

  const refresh = useCallback(async () => {
    const { net, key } = readCsprSettings()
    if (!publicHex) return
    if (!key) {
      setError('Add a CSPR.cloud key in Settings → Connections → Casper to see balance.')
      return
    }
    setLoading(true)
    let errInfo: CsprError | null = null
    const info = await getAccountBalance(net, key, publicHex, (e) => {
      errInfo = e
    })
    if (info) {
      setBalance(info.balance)
      setError('')
      setErrorLabel('')
    } else {
      const d = describeCsprError(errInfo)
      setError(d.message)
      setErrorLabel(d.label)
    }
    if (withTransfers) {
      const t = await getRecentTransfers(net, key, publicHex, 10)
      const list = t ?? []
      // Clear pending entries that are now indexed (or confirmed by age).
      prunePendingTx(publicHex, new Set(list.map((x) => (x.hash || '').toLowerCase())))
      setTransfers(list) // never leave it null after a fetch (avoids stuck "Loading")
    }
    setLoading(false)
  }, [publicHex, withTransfers])

  useEffect(() => {
    if (!publicHex) {
      setBalance(null)
      setTransfers(null)
      return
    }
    refresh()
    // 20s keeps the balance fresh without hammering CSPR.cloud (avoids 429s,
    // especially right after a run that already made many on-chain reads).
    const idv = setInterval(refresh, 20_000)
    return () => clearInterval(idv)
  }, [publicHex, refresh])

  // Merge just-submitted (pending) txs on top of the indexed history, deduped by hash.
  let merged = transfers
  if (publicHex) {
    const pending = getRecentTxs(publicHex)
    if (pending.length) {
      const known = new Set((transfers ?? []).map((t) => (t.hash || '').toLowerCase()))
      const fresh = pending.filter((p) => p.hash && !known.has(p.hash.toLowerCase()))
      merged = [...fresh, ...(transfers ?? [])]
    }
  }

  return { balance, transfers: merged, loading, error, errorLabel, refresh }
}
