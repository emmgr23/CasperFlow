import { useEffect, useRef, useState } from 'react'
import { loadWalletProfiles, subscribeWallets, type WalletProfile } from './wallets'
import { resolveCsprName, type CasperNet } from './casper'
import Icon from './Icon'

type Mode = 'key' | 'wallet' | 'name'

function readCspr(): { net: CasperNet; key: string } {
  try {
    const s = JSON.parse(localStorage.getItem('casperflow-settings-v1') || '{}')
    return { net: s.casperNet === 'mainnet' ? 'mainnet' : 'testnet', key: s.csprCloudKey || '' }
  } catch {
    return { net: 'testnet', key: '' }
  }
}

const shortAddr = (h: string) => (h.length > 16 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h)

// Recipient input for Send CSPR: paste a public key, pick a saved wallet,
// or resolve a CSPR.name (e.g. alice.cspr) to its on-chain account hash.
export default function RecipientField({
  params,
  setParams,
}: {
  params: Record<string, string | number>
  setParams: (patch: Record<string, string | number>) => void
}) {
  const to = String(params.to ?? '')
  const initialMode = (String(params.toMode || '') as Mode) || 'key'
  const [mode, setMode] = useState<Mode>(initialMode)
  const [profiles, setProfiles] = useState<WalletProfile[]>(loadWalletProfiles())
  const [open, setOpen] = useState(false)
  const [nameInput, setNameInput] = useState(String(params.toName || ''))
  const [resolving, setResolving] = useState(false)
  const [resolveErr, setResolveErr] = useState('')
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

  const switchMode = (m: Mode) => {
    setMode(m)
    setParams({ toMode: m })
    setResolveErr('')
  }

  const pickWallet = (p: WalletProfile) => {
    setParams({ to: p.publicHex, toName: p.name, toMode: 'wallet' })
    setOpen(false)
  }

  const doResolve = async () => {
    const { net, key } = readCspr()
    setResolving(true)
    setResolveErr('')
    const res = await resolveCsprName(net, key, nameInput)
    setResolving(false)
    if ('hash' in res) {
      setParams({ to: res.hash, toName: nameInput.trim().toLowerCase(), toMode: 'name' })
    } else {
      setResolveErr(res.error)
      setParams({ to: '' })
    }
  }

  const activeWallet = mode === 'wallet' ? profiles.find((p) => p.publicHex === to) : undefined

  return (
    <div className="recip">
      <div className="recip-tabs">
        {(['key', 'wallet', 'name'] as Mode[]).map((m) => (
          <button
            key={m}
            className={`recip-tab${mode === m ? ' active' : ''}`}
            onClick={() => switchMode(m)}
          >
            {m === 'key' ? 'Public key' : m === 'wallet' ? 'My wallets' : 'CSPR.name'}
          </button>
        ))}
      </div>

      {mode === 'key' && (
        <input
          type="text"
          className="recip-input"
          placeholder="02… or 01… public key"
          value={to}
          onChange={(e) => setParams({ to: e.target.value.trim() })}
        />
      )}

      {mode === 'wallet' && (
        <div className="wpick" ref={pickRef}>
          <button className={`wpick-trigger${activeWallet ? ' filled' : ''}`} onClick={() => setOpen((o) => !o)}>
            {activeWallet ? (
              <span className="wpick-cur">
                <span className="wpick-cur-name">{activeWallet.name}</span>
                <span className="wpick-cur-pk">{shortAddr(activeWallet.publicHex)}</span>
              </span>
            ) : (
              <span className="wpick-placeholder">
                {profiles.length ? 'Pick a wallet' : 'No wallets saved yet'}
              </span>
            )}
            <Icon name="chevron" size={13} style={{ transform: open ? 'rotate(90deg)' : 'none', opacity: 0.5 }} />
          </button>
          {open && (
            <div className="wpick-menu">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  className={`wpick-item${p.publicHex === to ? ' active' : ''}`}
                  onClick={() => pickWallet(p)}
                >
                  <span className="wpick-item-name">{p.name}</span>
                  <span className="wpick-item-pk">{shortAddr(p.publicHex)}</span>
                  {p.publicHex === to && <Icon name="check" size={13} className="wpick-item-check" />}
                </button>
              ))}
              {profiles.length === 0 && <div className="wpick-empty">Add wallets in a Wallet node first.</div>}
            </div>
          )}
        </div>
      )}

      {mode === 'name' && (
        <>
          <div className="recip-name-row">
            <input
              type="text"
              className="recip-input"
              placeholder="alice.cspr"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') doResolve()
              }}
            />
            <button className="recip-resolve" onClick={doResolve} disabled={resolving || !nameInput.trim()}>
              {resolving ? 'Resolving…' : 'Resolve'}
            </button>
          </div>
          {resolveErr && <div className="recip-err">{resolveErr}</div>}
          {!resolveErr && to && /^[0-9a-fA-F]{64}$/.test(to) && (
            <div className="recip-ok">
              <Icon name="check" size={12} /> {nameInput || params.toName} → {shortAddr(to)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
