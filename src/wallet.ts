// Casper Wallet (browser extension) integration.
// Docs: https://github.com/make-software/casper-wallet-sdk

import { debugLog } from './runtime'

interface CasperWalletProviderInstance {
  requestConnection(): Promise<boolean>
  disconnectFromSite(): Promise<boolean>
  isConnected(): Promise<boolean>
  getActivePublicKey(): Promise<string>
  sign(deployJson: string, signingPublicKeyHex: string): Promise<{
    cancelled: boolean
    signatureHex?: string
    signature?: Uint8Array
  }>
}

declare global {
  interface Window {
    CasperWalletProvider?: (options?: { timeout?: number }) => CasperWalletProviderInstance
    CasperWalletEventTypes?: Record<string, string>
  }
}

let provider: CasperWalletProviderInstance | null = null

export const isWalletInstalled = () => typeof window.CasperWalletProvider === 'function'

// Sign an arbitrary transaction/deploy JSON with the connected wallet.
// Returns the signature hex, or null if cancelled/failed.
export async function signWithWallet(
  payloadJson: string,
  publicKeyHex: string,
): Promise<string | null> {
  const p = getProvider()
  if (!p) return null
  try {
    const res = await p.sign(payloadJson, publicKeyHex)
    if (res.cancelled) {
      debugLog('wallet', 'Signing cancelled by user')
      return null
    }
    return res.signatureHex ?? null
  } catch (e) {
    debugLog('wallet', `Sign error: ${e instanceof Error ? e.message : 'unknown'}`)
    return null
  }
}

function getProvider(): CasperWalletProviderInstance | null {
  if (!isWalletInstalled()) return null
  if (!provider) provider = window.CasperWalletProvider!({ timeout: 30 * 60 * 1000 })
  return provider
}

export async function connectWallet(): Promise<string | null> {
  const p = getProvider()
  if (!p) {
    debugLog('wallet', 'Casper Wallet extension not detected')
    return null
  }
  try {
    const ok = await p.requestConnection()
    if (!ok) {
      debugLog('wallet', 'Connection request rejected by user')
      return null
    }
    const key = await p.getActivePublicKey()
    debugLog('wallet', `Connected: ${key.slice(0, 10)}…`)
    return key
  } catch (e) {
    debugLog('wallet', `Connect error: ${e instanceof Error ? e.message : 'unknown'}`)
    return null
  }
}

export async function disconnectWallet(): Promise<void> {
  const p = getProvider()
  if (!p) return
  try {
    await p.disconnectFromSite()
    debugLog('wallet', 'Disconnected')
  } catch {
    /* ignore */
  }
}

export async function reconnectIfConnected(): Promise<string | null> {
  const p = getProvider()
  if (!p) return null
  try {
    if (await p.isConnected()) return await p.getActivePublicKey()
  } catch {
    /* not connected */
  }
  return null
}

// Subscribe to wallet events (account switch / disconnect from the extension UI).
export function onWalletEvents(handlers: {
  onKeyChanged?: (key: string) => void
  onDisconnected?: () => void
}): () => void {
  const types = window.CasperWalletEventTypes
  if (!types) return () => {}
  const keyChanged = (e: Event) => {
    try {
      const detail = JSON.parse((e as CustomEvent).detail)
      if (detail?.activeKey) handlers.onKeyChanged?.(detail.activeKey)
    } catch {
      /* ignore */
    }
  }
  const disconnected = () => handlers.onDisconnected?.()
  window.addEventListener(types.ActiveKeyChanged, keyChanged)
  window.addEventListener(types.Disconnected, disconnected)
  return () => {
    window.removeEventListener(types.ActiveKeyChanged, keyChanged)
    window.removeEventListener(types.Disconnected, disconnected)
  }
}
