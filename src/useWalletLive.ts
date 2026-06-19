import { useCallback, useEffect, useState } from 'react'
import { getAccountBalance, getRecentTransfers, type Transfer, type CasperNet } from './casper'
import { getRecentTxs, prunePendingTx, subscribeRuntime } from './runtime'

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
    const info = await getAccountBalance(net, key, publicHex)
    if (info) {
      setBalance(info.balance)
      setError('')
    } else {
      setError('Could not read balance — check the CSPR.cloud key & network.')
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
    const idv = setInterval(refresh, 8_000)
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

  return { balance, transfers: merged, loading, error, refresh }
}
