import { useEffect, useState } from 'react'
import { getAccountBalance, type CasperNet } from './casper'

// Read the saved net + CSPR.cloud key the same way the rest of the app does.
function readCspr(): { net: CasperNet; key: string } {
  try {
    const s = JSON.parse(localStorage.getItem('casperflow-settings-v1') || '{}')
    return { net: s.casperNet === 'mainnet' ? 'mainnet' : 'testnet', key: s.csprCloudKey || '' }
  } catch {
    return { net: 'testnet', key: '' }
  }
}

const isKeyOrHash = (s: string) =>
  /^01[0-9a-f]{64}$/i.test(s) || /^02[0-9a-f]{66}$/i.test(s) || /^[0-9a-f]{64}$/i.test(s)

type State = 'idle' | 'loading' | 'new' | { bal: number }

// Shows the recipient's live on-chain balance under a Send CSPR node, as a quick
// sanity check: an existing funded account, or a brand-new one (0 CSPR). Read
// once when the recipient changes; not polled.
export default function RecipientBalance({ to }: { to: string }) {
  const [state, setState] = useState<State>('idle')
  const acct = (to || '').trim()
  const { net, key } = readCspr()

  useEffect(() => {
    if (!isKeyOrHash(acct) || !key) {
      setState('idle')
      return
    }
    let active = true
    setState('loading')
    getAccountBalance(net, key, acct)
      .then((info) => {
        if (!active) return
        setState(info ? { bal: info.balance } : 'new')
      })
      .catch(() => active && setState('new'))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acct, net, key])

  if (!isKeyOrHash(acct) || !key || state === 'idle') return null
  return (
    <div className="ndt-balance">
      {state === 'loading'
        ? 'checking recipient…'
        : state === 'new'
          ? 'new account (unfunded)'
          : `recipient balance: ${state.bal.toLocaleString('en-US', { maximumFractionDigits: 2 })} CSPR`}
    </div>
  )
}
