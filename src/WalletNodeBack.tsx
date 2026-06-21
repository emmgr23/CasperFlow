import { useEffect, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import {
  loadWalletProfiles,
  upsertWalletProfile,
  deleteWalletProfile,
  subscribeWallets,
  buildProfile,
  type WalletProfile,
  type WalletFormat,
} from './wallets'
import { useWalletLive } from './useWalletLive'
import { explorerTxUrl } from './tx'
import type { Params } from './modules'
import Icon from './Icon'

const fmtCspr = (n: number) =>
  n.toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' CSPR'
const fmtDate = (iso: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
}

// Custom back-face for the Wallet action node: pick/connect a wallet, choose the
// signing mode, and see its live balance + recent activity.
export default function WalletNodeBack({ id, params }: { id: string; params: Params }) {
  const { updateNodeData } = useReactFlow()
  const [profiles, setProfiles] = useState<WalletProfile[]>(loadWalletProfiles())
  const [tab, setTab] = useState<'setup' | 'activity'>('setup')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [format, setFormat] = useState<WalletFormat>('pem')
  const [secret, setSecret] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => subscribeWallets(() => setProfiles(loadWalletProfiles())), [])

  const mode = String(params.mode) === 'manual' ? 'manual' : 'autonomous'
  const activeId = String(params.walletProfileId || '')
  const active = profiles.find((p) => p.id === activeId)
  const pk = active?.publicHex || ''
  const { balance, transfers, loading, error, errorLabel, refresh } = useWalletLive(pk, true)

  const setP = (patch: Params) => updateNodeData(id, { params: { ...params, ...patch } })

  const selectProfile = (p: WalletProfile) =>
    setP({
      walletProfileId: p.id,
      walletName: p.name,
      walletPublic: p.publicHex,
      walletFormat: p.format,
      walletAlgo: p.algo,
      walletSecret: p.secret,
      walletPath: p.path || '',
    })

  const clearSelection = () =>
    setP({ walletProfileId: '', walletName: '', walletPublic: '', walletSecret: '' })

  const save = async () => {
    if (!secret.trim()) {
      setStatus('Paste a key or recovery phrase first.')
      return
    }
    setBusy(true)
    setStatus(format === 'seed' ? 'Deriving key from phrase…' : 'Loading key…')
    const r = await buildProfile({ name: name.trim() || 'My wallet', format, secret, mode })
    setBusy(false)
    if (!r.ok || !r.profile) {
      setStatus(r.error || 'Could not load this key.')
      return
    }
    upsertWalletProfile(r.profile)
    selectProfile(r.profile)
    setAdding(false)
    setSecret('')
    setName('')
    setStatus(
      `Connected ✓ ${r.profile.algo} · ${r.profile.publicHex.slice(0, 10)}…${r.profile.publicHex.slice(-4)}`,
    )
    setTab('setup')
  }

  const del = (pid: string) => {
    deleteWalletProfile(pid)
    if (activeId === pid) clearSelection()
  }

  return (
    <div className="wallet-back nodrag nowheel">
      {active && (
        <div className="wallet-bal-summary">
          <div className="wallet-bal-row">
            <span className={`wallet-balance-big${balance === null && error ? ' err' : ''}`}>
              {balance !== null ? fmtCspr(balance) : loading ? 'Loading…' : error ? errorLabel : '—'}
            </span>
            <button className="wallet-refresh-mini" onClick={refresh} disabled={loading} title="Refresh now">
              <Icon name="rotate" size={13} />
            </button>
          </div>
          <div className="wallet-balance-sub">
            <span className={`wallet-profile-dot${balance === null && error ? ' err' : ''}`} /> live balance · auto-refreshes
          </div>
          {balance === null && !loading && (
            <div className="wallet-fund-hint" style={{ marginTop: 6 }}>
              {error || 'No on-chain balance yet.'}{' '}
              <a href="https://testnet.cspr.live/tools/faucet" target="_blank" rel="noreferrer">
                fund via faucet
              </a>
            </div>
          )}
        </div>
      )}

      {active && (
        <div className="wallet-tabs">
          {(['setup', 'activity'] as const).map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t === 'setup' ? 'Setup' : 'Activity'}
            </button>
          ))}
        </div>
      )}

      {(!active || tab === 'setup') && (
        <>
          <div className="node-field">
            <label>Signing mode</label>
            <div className="approval-toggle">
              <button
                className={mode === 'autonomous' ? 'active' : ''}
                onClick={() => setP({ mode: 'autonomous' })}
              >
                Autonomous
              </button>
              <button className={mode === 'manual' ? 'active' : ''} onClick={() => setP({ mode: 'manual' })}>
                Ask approval
              </button>
            </div>
            <div className="wallet-hint">
              {mode === 'autonomous'
                ? 'Signs locally, no popup — true automation.'
                : 'Asks you to approve each transaction in-app before signing.'}
            </div>
          </div>

          <div className="node-field">
            <label>Wallet</label>
            <div className="wallet-picker">
              <select
                value={active ? active.id : ''}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '__new__') {
                    setAdding(true)
                    return
                  }
                  setAdding(false)
                  const p = profiles.find((x) => x.id === v)
                  if (p) selectProfile(p)
                  else clearSelection()
                }}
              >
                <option value="">{profiles.length ? '— Select a wallet —' : 'No wallets yet'}</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.publicHex.slice(0, 6)}…{p.publicHex.slice(-4)}
                  </option>
                ))}
                <option value="__new__">➕ Connect a new wallet…</option>
              </select>
              <button className="wallet-new-btn" title="Connect a new wallet" onClick={() => setAdding(true)}>
                <Icon name="user-plus" size={14} />
              </button>
            </div>

            {active && !adding && (
              <>
                <div className="wallet-current">
                  <span className="wallet-profile-dot" />
                  <span className="wallet-current-pk">
                    {active.publicHex.slice(0, 12)}…{active.publicHex.slice(-6)} · {active.format}
                  </span>
                  <button
                    className="wallet-profile-del"
                    title="Copy full address"
                    onClick={() => {
                      navigator.clipboard?.writeText(active.publicHex)
                      setStatus('Address copied.')
                    }}
                  >
                    <Icon name="copy" size={12} />
                  </button>
                  <button className="wallet-profile-del" title="Delete this wallet" onClick={() => del(active.id)}>
                    <Icon name="trash" size={12} />
                  </button>
                </div>
                <div className="wallet-fund-hint">
                  This agent acts from its own address. Fund it with test CSPR:{' '}
                  <a href="https://testnet.cspr.live/tools/faucet" target="_blank" rel="noreferrer">
                    open faucet
                  </a>{' '}
                  and paste the copied address.
                </div>
              </>
            )}
          </div>

          {adding && (
            <div className="node-field wallet-add">
              <label>Connect a wallet</label>
              <input
                type="text"
                placeholder="Name (e.g. Treasury)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <select value={format} onChange={(e) => setFormat(e.target.value as WalletFormat)}>
                <option value="pem">Secret key (PEM)</option>
                <option value="hex">Secret key (hex)</option>
                <option value="seed">Recovery phrase (12/24 words) — experimental</option>
              </select>
              <textarea
                className="wallet-secret"
                rows={format === 'seed' ? 2 : 4}
                spellCheck={false}
                placeholder={
                  format === 'pem'
                    ? '-----BEGIN PRIVATE KEY-----\n…'
                    : format === 'hex'
                      ? 'hex secret key'
                      : 'word1 word2 word3 …'
                }
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
              <div className="wallet-add-actions">
                <button className="btn-primary settings-test" onClick={save} disabled={busy}>
                  {busy ? 'Working…' : 'Connect & save'}
                </button>
                {profiles.length > 0 && (
                  <button
                    className="btn-secondary settings-test"
                    onClick={() => {
                      setAdding(false)
                      setStatus('')
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

          {status && <div className="wallet-status">{status}</div>}
          <div className="wallet-warn">⚠️ Testnet only — keys are stored in your browser.</div>
        </>
      )}

      {active && tab === 'activity' && (
        <div className="wallet-activity">
          <div className="wallet-activity-head">
            <span>Last {transfers?.length ?? 0} transfers</span>
            <button className="wallet-refresh-mini" onClick={refresh} title="Refresh">
              <Icon name="rotate" size={12} />
            </button>
          </div>
          {!transfers && <div className="wallet-hint">{error || 'Loading activity…'}</div>}
          {transfers && transfers.length === 0 && (
            <div className="wallet-hint">No transfers yet for this account.</div>
          )}
          {transfers &&
            transfers.map((t, i) => (
              <a
                key={i}
                className="wallet-tx"
                href={explorerTxUrl('testnet', t.hash)}
                target="_blank"
                rel="noreferrer"
              >
                <span className={`wallet-tx-dir ${t.out ? 'out' : 'in'}`}>{t.out ? '↑' : '↓'}</span>
                <span className="wallet-tx-main">
                  <span className="wallet-tx-amt">
                    {t.out ? '−' : '+'}
                    {fmtCspr(t.amount)}
                  </span>
                  <span className="wallet-tx-time">
                    {t.pending ? '⏳ pending…' : fmtDate(t.timestamp) || 'pending'}
                  </span>
                </span>
                <span className="wallet-tx-peer">
                  {t.peer ? `${t.peer.slice(0, 6)}…${t.peer.slice(-4)}` : ''}
                </span>
              </a>
            ))}
        </div>
      )}
    </div>
  )
}
