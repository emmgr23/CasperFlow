// Real Casper on-chain reads via CSPR.cloud REST API.
// Free API key: https://console.cspr.cloud  (testnet & mainnet)

import { PublicKey } from 'casper-js-sdk'
import { debugLog } from './runtime'

export type CasperNet = 'testnet' | 'mainnet'

// In dev we route through the Vite proxy (see vite.config.ts) to avoid CORS,
// since CSPR.cloud is a server-to-server API and blocks direct browser calls.
// In a production build, deploy an equivalent proxy or serverless function.
const DEV = (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? false
const BASE: Record<CasperNet, string> = DEV
  ? { testnet: '/cspr-testnet', mainnet: '/cspr-mainnet' }
  : { testnet: 'https://api.testnet.cspr.cloud', mainnet: 'https://api.cspr.cloud' }

const MOTES = 1_000_000_000 // 1 CSPR = 1e9 motes

export interface AccountInfo {
  balance: number // in CSPR
  publicKey: string
}

export async function getAccountBalance(
  net: CasperNet,
  apiKey: string,
  publicKey: string,
): Promise<AccountInfo | null> {
  if (!apiKey || !publicKey) return null
  try {
    const r = await fetch(`${BASE[net]}/accounts/${publicKey}`, {
      headers: { authorization: apiKey, accept: 'application/json' },
    })
    if (!r.ok) {
      // 404 = account not seen on-chain yet (unfunded) — that's normal, stay quiet.
      if (r.status !== 404) debugLog('casper', `Balance read failed: HTTP ${r.status} (${net})`)
      return null
    }
    const j = await r.json()
    const raw = j?.data?.balance ?? j?.balance
    if (raw == null) return null
    return { balance: Number(raw) / MOTES, publicKey }
  } catch (e) {
    debugLog('casper', `Balance read error: ${e instanceof Error ? e.message : 'network/CORS'}`)
    return null
  }
}

// Resolve a CSPR.name (e.g. "alice.cspr") to its on-chain account hash via CSPR.cloud.
// Returns the 64-char account hash hex (no prefix), or an error message.
export async function resolveCsprName(
  net: CasperNet,
  apiKey: string,
  name: string,
): Promise<{ hash: string } | { error: string }> {
  const clean = name.trim().toLowerCase()
  if (!apiKey) return { error: 'Add a CSPR.cloud key in Settings → Connections → Casper.' }
  if (!clean) return { error: 'Enter a CSPR.name (e.g. alice.cspr).' }
  try {
    const r = await fetch(`${BASE[net]}/cspr-name-resolutions/${encodeURIComponent(clean)}`, {
      headers: { authorization: apiKey, accept: 'application/json' },
    })
    if (r.status === 404) return { error: `"${clean}" is not registered on ${net}.` }
    if (!r.ok) return { error: `Resolution failed (HTTP ${r.status}).` }
    const j = await r.json()
    const hash = j?.data?.resolved_hash
    if (!hash || !/^[0-9a-fA-F]{64}$/.test(hash)) return { error: 'No address linked to this name.' }
    return { hash: String(hash).toLowerCase() }
  } catch (e) {
    debugLog('casper', `CSPR.name resolve error: ${e instanceof Error ? e.message : 'network'}`)
    return { error: 'Network error resolving the name.' }
  }
}

// Live on-chain DEX rate (e.g. CSPR.trade) for a fungible-token pair, via CSPR.cloud.
// Returns how many target tokens 1 source token is worth (read-only, free).
export async function getDexRate(
  net: CasperNet,
  apiKey: string,
  fromPackageHash: string,
  toPackageHash: string,
  dexId?: number,
): Promise<{ rate: number; dexId: number; at: string } | { error: string }> {
  const from = fromPackageHash.trim().replace(/^0x/, '')
  const to = toPackageHash.trim().replace(/^0x/, '')
  if (!apiKey) return { error: 'Add a CSPR.cloud key in Settings → Integrations → Casper.' }
  if (!/^[0-9a-fA-F]{64}$/.test(from) || !/^[0-9a-fA-F]{64}$/.test(to)) {
    return { error: 'Both tokens must be 64-char contract package hashes.' }
  }
  try {
    const q = `target_contract_package_hash=${to}${dexId ? `&dex_id=${dexId}` : ''}`
    const r = await fetch(`${BASE[net]}/ft/${from}/dex-rates/latest?${q}`, {
      headers: { authorization: apiKey, accept: 'application/json' },
    })
    if (r.status === 404) return { error: 'No DEX rate found for this pair.' }
    if (!r.ok) return { error: `Rate read failed (HTTP ${r.status}).` }
    const j = await r.json()
    const amt = j?.data?.amount
    if (amt == null) return { error: 'No rate returned for this pair.' }
    return { rate: Number(amt), dexId: Number(j?.data?.dex_id ?? dexId ?? 0), at: String(j?.data?.timestamp ?? '') }
  } catch (e) {
    debugLog('casper', `DEX rate error: ${e instanceof Error ? e.message : 'network'}`)
    return { error: 'Network error reading the DEX rate.' }
  }
}

export interface Transfer {
  amount: number // CSPR
  hash: string // deploy hash (for the explorer link)
  timestamp: string // ISO time
  out: boolean // true = sent from this account, false = received
  peer: string // the other party's account hash
  pending?: boolean // just submitted, not yet indexed by CSPR.cloud
}

export async function getRecentTransfers(
  net: CasperNet,
  apiKey: string,
  publicKey: string,
  limit = 5,
): Promise<Transfer[] | null> {
  if (!apiKey || !publicKey) return null
  let myHash = ''
  try {
    myHash = PublicKey.fromHex(publicKey)
      .accountHash()
      .toHex()
      .replace(/^account-hash-/, '')
      .toLowerCase()
  } catch {
    /* leave empty — direction will default to received */
  }
  try {
    const r = await fetch(`${BASE[net]}/accounts/${publicKey}/transfers?page=1&page_size=${limit}`, {
      headers: { authorization: apiKey, accept: 'application/json' },
    })
    if (!r.ok) {
      if (r.status !== 404) debugLog('casper', `Transfers read failed: HTTP ${r.status}`)
      return null
    }
    const j = await r.json()
    const rows = j?.data ?? []
    return rows.map((t: Record<string, unknown>) => {
      const initiator = String(t.initiator_account_hash ?? '').toLowerCase()
      const to = String(t.to_account_hash ?? '').toLowerCase()
      const out = !!myHash && initiator === myHash
      return {
        amount: Number(t.amount ?? 0) / MOTES,
        hash: String(t.deploy_hash ?? ''),
        timestamp: String(t.timestamp ?? ''),
        out,
        peer: out ? to : initiator,
      }
    })
  } catch {
    return null
  }
}

export const shortKey = (k: string) =>
  k.length > 12 ? `${k.slice(0, 6)}…${k.slice(-4)}` : k
