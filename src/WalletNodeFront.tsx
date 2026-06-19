import { useEffect, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { loadWalletProfiles, subscribeWallets, type WalletProfile } from './wallets'
import { useWalletLive } from './useWalletLive'
import { explorerTxUrl } from './tx'
import type { Params } from './modules'
import Icon from './Icon'

const fmtCspr = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' CSPR'
const fmtDate = (iso: string) => {
  if (!iso) return 'pending'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
}

// Interactive front face of a Wallet node: pick a wallet, see its live balance,
// and toggle a list of recent transactions — all without flipping the card.
export default function WalletNodeFront({ id, params }: { id: string; params: Params }) {
  const { updateNodeData } = useReactFlow()
  const [profiles, setProfiles] = useState<WalletProfile[]>(loadWalletProfiles())
  const [showTx, setShowTx] = useState(false)
  const [open, setOpen] = useState(false)
  const pickRef = useRef<HTMLDivElement>(null)

  useEffect(() => subscribeWallets(() => setProfiles(loadWalletProfiles())), [])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (pickRef.current && !pickRef.current.contains(e.target as HTMLElement)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const shortPk = (pk: string) => `${pk.slice(0, 6)}…${pk.slice(-4)}`

  const activeId = String(params.walletProfileId || '')
  const active = profiles.find((p) => p.id === activeId)
  const pk = active?.publicHex || ''
  const { balance, transfers, loading, error } = useWalletLive(pk, showTx)
  const hasError = balance === null && !!error

  const selectProfile = (p: WalletProfile) =>
    updateNodeData(id, {
      params: {
        ...params,
        walletProfileId: p.id,
        walletName: p.name,
        walletPublic: p.publicHex,
        walletFormat: p.format,
        walletAlgo: p.algo,
        walletSecret: p.secret,
        walletPath: p.path || '',
      },
    })

  return (
    <div className="wfront nodrag nowheel" onDoubleClick={(e) => e.stopPropagation()}>
      <div className="wpick" ref={pickRef}>
        <button
          className={`wpick-trigger${active ? ' filled' : ''}`}
          onClick={() => setOpen((o) => !o)}
        >
          {active ? (
            <span className="wpick-cur">
              <span className="wpick-cur-name">{active.name}</span>
              <span className="wpick-cur-pk">{shortPk(active.publicHex)}</span>
            </span>
          ) : (
            <span className="wpick-placeholder">
              {profiles.length ? 'Select a wallet' : 'No wallets yet — add one'}
            </span>
          )}
          <Icon name="chevron" size={13} style={{ transform: open ? 'rotate(90deg)' : 'none', opacity: 0.5 }} />
        </button>

        {open && (
          <div className="wpick-menu">
            {profiles.map((p) => (
              <button
                key={p.id}
                className={`wpick-item${p.id === activeId ? ' active' : ''}`}
                onClick={() => {
                  selectProfile(p)
                  setOpen(false)
                }}
              >
                <span className="wpick-item-name">{p.name}</span>
                <span className="wpick-item-pk">{shortPk(p.publicHex)}</span>
                {p.id === activeId && <Icon name="check" size={13} className="wpick-item-check" />}
              </button>
            ))}
            <button
              className="wpick-add"
              onClick={() => {
                updateNodeData(id, { flipped: true })
                setOpen(false)
              }}
            >
              <Icon name="gear" size={12} /> Configure / add a wallet…
            </button>
          </div>
        )}
      </div>

      {active && (
        <div className="wfront-bal-row">
          <span className={`wfront-bal${hasError ? ' err' : ''}`} title={hasError ? error : undefined}>
            <span className={`live-dot${hasError ? ' err' : ''}`} />
            {balance !== null
              ? fmtCspr(balance)
              : hasError
                ? 'connection error'
                : loading
                  ? 'connecting…'
                  : '—'}
          </span>
          <button
            className={`wfront-tx-btn${showTx ? ' active' : ''}`}
            onClick={() => setShowTx((s) => !s)}
            title="Show recent transactions"
          >
            <Icon name="repeat" size={11} /> Tx
          </button>
        </div>
      )}

      {active && showTx && (
        <div className="wfront-txlist">
          {!transfers && <div className="wfront-empty">Loading transactions…</div>}
          {transfers && transfers.length === 0 && (
            <div className="wfront-empty">No transactions yet for this wallet.</div>
          )}
          {transfers &&
            transfers.map((t, i) => (
              <a
                key={i}
                className={`wfront-tx${t.pending ? ' pending' : ''}`}
                href={explorerTxUrl('testnet', t.hash)}
                target="_blank"
                rel="noreferrer"
              >
                <span className={`wfront-tx-dir ${t.out ? 'out' : 'in'}`}>{t.out ? '↑' : '↓'}</span>
                <span className="wfront-tx-amt">
                  {t.out ? '−' : '+'}
                  {fmtCspr(t.amount)}
                </span>
                <span className="wfront-tx-time">
                  {t.pending ? '⏳ pending…' : fmtDate(t.timestamp)}
                </span>
              </a>
            ))}
        </div>
      )}
    </div>
  )
}
