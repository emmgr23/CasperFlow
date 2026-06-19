// Real Casper testnet/mainnet transactions, signed by the Casper Wallet.
// Built on casper-js-sdk v5 (NativeTransferBuilder + RpcClient).
//
// Honest note: the exact wallet-signature attachment for v5 transactions is
// version-sensitive. This is the documented approach; we iterate on the first
// real run using Settings → Logs.

import {
  HttpHandler,
  RpcClient,
  CasperNetwork,
  NativeTransferBuilder,
  PublicKey,
  AccountHash,
  PrivateKey,
  KeyAlgorithm,
  Args,
  CLValue,
  type Transaction,
} from 'casper-js-sdk'
import { signWithWallet } from './wallet'
import { debugLog } from './runtime'

export type CasperNet = 'testnet' | 'mainnet'

// ── Autonomous signing: an in-app "agent key" signs transactions locally with
// NO wallet popup, so automations never block. Testnet only, stays in-browser.
let agentSigner: { key: PrivateKey; publicHex: string } | null = null

export function setAgentKeyFromPem(pem: string): { ok: boolean; publicHex?: string; error?: string } {
  if (!pem.trim()) {
    agentSigner = null
    return { ok: true }
  }
  for (const algo of [KeyAlgorithm.ED25519, KeyAlgorithm.SECP256K1]) {
    try {
      const key = PrivateKey.fromPem(pem, algo)
      const publicHex = key.publicKey.toHex()
      agentSigner = { key, publicHex }
      return { ok: true, publicHex }
    } catch {
      /* try the other algorithm */
    }
  }
  agentSigner = null
  return { ok: false, error: 'Could not parse this key — expected a Casper secret-key PEM.' }
}

export function generateAgentKey(): { pem: string; publicHex: string } {
  const key = PrivateKey.generate(KeyAlgorithm.ED25519)
  const publicHex = key.publicKey.toHex()
  agentSigner = { key, publicHex }
  return { pem: key.toPem(), publicHex }
}

export const getAgentPublicHex = () => agentSigner?.publicHex ?? null
export const hasAgentKey = () => !!agentSigner
export const getAgentKey = (): PrivateKey | null => agentSigner?.key ?? null
// 32-byte account hash hex of the agent's public key (x402 `from` field).
export const getAgentAccountHashHex = (): string | null => {
  if (!agentSigner) return null
  try {
    return agentSigner.key.publicKey.accountHash().toHex()
  } catch {
    return null
  }
}

// Set (or clear) the active local signer — used by the Wallet action node.
// When set, transactions sign locally with no wallet popup (autonomous).
export function setActiveSigner(key: PrivateKey | null, publicHex?: string) {
  agentSigner = key ? { key, publicHex: publicHex || key.publicKey.toHex() } : null
}

const CHAIN: Record<CasperNet, string> = {
  testnet: 'casper-test',
  mainnet: 'casper',
}

// In dev we route through the Vite proxy (see vite.config.ts) to avoid CORS.
const DEV = (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? false
const ORIGIN = typeof window !== 'undefined' ? window.location.origin : ''

function readCsprKey(): string {
  try {
    return JSON.parse(localStorage.getItem('casperflow-settings-v1') || '{}').csprCloudKey || ''
  } catch {
    return ''
  }
}

const MOTES = 1_000_000_000

// Prefer the user's CSPR.cloud node (reliable, their key already works); fall back
// to the public Casper Association node. Both via the Vite proxy in dev (CORS).
function rpcOf(net: CasperNet): RpcClient {
  const key = readCsprKey()
  let url: string
  const headers: Record<string, string> = {}
  if (key) {
    url = DEV ? `${ORIGIN}/csprnode-${net}/rpc` : `https://node.${net}.cspr.cloud/rpc`
    headers.Authorization = key
  } else {
    url = DEV ? `${ORIGIN}/rpc-${net}/rpc` : `https://node.${net}.casper.network/rpc`
  }
  const handler = new HttpHandler(url)
  if (Object.keys(headers).length) handler.setCustomHeaders(headers)
  return new RpcClient(handler)
}

export interface TxResult {
  ok: boolean
  hash?: string
  error?: string
}

const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.replace(/^0x/, '')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

// Sign a built transaction (locally with the agent key, or via the wallet),
// submit it, and return the hash.
async function signSubmit(
  transaction: Transaction,
  senderHex: string,
  net: CasperNet,
  label: string,
): Promise<TxResult> {
  if (agentSigner) {
    // Autonomous: sign locally, no popup. The SDK hashes + attaches the approval.
    debugLog('tx', `Signing locally with agent key (autonomous, no popup): ${label}`)
    transaction.sign(agentSigner.key)
  } else {
    const sender = PublicKey.fromHex(senderHex)
    const json = JSON.stringify(transaction.toJSON())
    debugLog('tx', `Requesting wallet signature: ${label}`)
    const signatureHex = await signWithWallet(json, senderHex)
    if (!signatureHex) return { ok: false, error: 'Signature cancelled or wallet unavailable' }
    transaction.setSignature(hexToBytes(signatureHex), sender)
  }
  try {
    const result = await rpcOf(net).putTransaction(transaction as never)
    const hash =
      (result as { transactionHash?: { toHex?: () => string } | string }).transactionHash
    const hashStr = typeof hash === 'string' ? hash : (hash?.toHex?.() ?? 'submitted')
    debugLog('tx', `Submitted ${label}: ${hashStr}`)
    return { ok: true, hash: hashStr }
  } catch (e) {
    let detail = e instanceof Error ? e.message : String(e)
    try {
      const full = JSON.stringify(e, Object.getOwnPropertyNames(e as object))
      if (full && full !== '{}') detail = full.slice(0, 400)
    } catch {
      /* keep message */
    }
    debugLog('tx', `putTransaction error: ${detail}`)
    return { ok: false, error: detail }
  }
}

export async function sendCsprReal(opts: {
  net: CasperNet
  senderHex: string
  recipientHex: string
  amountCspr: number
  transferId?: number | bigint
}): Promise<TxResult> {
  const { net, senderHex, recipientHex, amountCspr, transferId } = opts
  try {
    const fromHex = hasAgentKey() ? getAgentPublicHex()! : senderHex
    const to = recipientHex.trim().replace(/^account-hash-/i, '')
    const isPublicKey = /^0(1[0-9a-fA-F]{64}|2[0-9a-fA-F]{66})$/.test(to)
    const isAccountHash = /^[0-9a-fA-F]{64}$/.test(to)
    const builder = new NativeTransferBuilder()
      .from(PublicKey.fromHex(fromHex))
      .amount(Math.round(amountCspr * MOTES).toString())
      .chainName(CHAIN[net])
      .payment(100_000_000)
    // CSPR.name resolves to an account hash; pasted/selected wallets give a public key.
    if (isPublicKey) {
      builder.target(PublicKey.fromHex(to))
    } else if (isAccountHash) {
      builder.targetAccountHash(AccountHash.fromString(`account-hash-${to}`))
    } else {
      return { ok: false, error: 'Recipient is not a valid public key or account hash.' }
    }
    if (transferId && transferId > 0) builder.id(transferId as unknown as number)
    return await signSubmit(builder.build(), fromHex, net, `${amountCspr} CSPR transfer`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    debugLog('tx', `Transfer failed: ${msg}`)
    return { ok: false, error: msg }
  }
}

export async function delegateReal(opts: {
  net: CasperNet
  senderHex: string
  validatorHex: string
  amountCspr: number
  op: 'Delegate' | 'Undelegate' | 'Redelegate'
  newValidatorHex?: string
}): Promise<TxResult> {
  const { net, senderHex, validatorHex, amountCspr, op, newValidatorHex } = opts
  try {
    const fromHex = hasAgentKey() ? getAgentPublicHex()! : senderHex
    const casper = await CasperNetwork.create(rpcOf(net), 2)
    const delegator = PublicKey.fromHex(fromHex)
    const validator = PublicKey.fromHex(validatorHex)
    const motes = Math.round(amountCspr * MOTES).toString()
    const gas = 2_500_000_000
    const ttl = 1_800_000
    let transaction
    if (op === 'Undelegate') {
      transaction = casper.createUndelegateTransaction(delegator, validator, CHAIN[net], motes, gas, ttl)
    } else if (op === 'Redelegate' && newValidatorHex) {
      transaction = casper.createRedelegateTransaction(
        delegator, validator, PublicKey.fromHex(newValidatorHex), CHAIN[net], motes, gas, ttl,
      )
    } else {
      transaction = casper.createDelegateTransaction(delegator, validator, CHAIN[net], motes, gas, ttl)
    }
    return await signSubmit(transaction, fromHex, net, `${op} ${amountCspr} CSPR`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    debugLog('tx', `Stake failed: ${msg}`)
    return { ok: false, error: msg }
  }
}

export async function callContractReal(opts: {
  net: CasperNet
  senderHex: string
  contractHash: string
  entrypoint: string
  argsJson: string
  paymentCspr: number
}): Promise<TxResult> {
  const { net, senderHex, contractHash, entrypoint, argsJson, paymentCspr } = opts
  try {
    const fromHex = hasAgentKey() ? getAgentPublicHex()! : senderHex
    const casper = await CasperNetwork.create(rpcOf(net), 2)
    // Best-effort: convert a flat {key: value} JSON into CLValue args.
    const parsed = JSON.parse(argsJson || '{}') as Record<string, unknown>
    const argMap: Record<string, CLValue> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number') argMap[k] = CLValue.newCLUInt512(v)
      else argMap[k] = CLValue.newCLString(String(v))
    }
    const args = Args.fromMap(argMap)
    const transaction = casper.createContractCallTransaction(
      PublicKey.fromHex(fromHex),
      contractHash,
      entrypoint,
      CHAIN[net],
      Math.round(paymentCspr * MOTES),
      1_800_000,
      args,
    )
    return await signSubmit(transaction, fromHex, net, `${entrypoint}() call`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    debugLog('tx', `Contract call failed: ${msg}`)
    return { ok: false, error: msg }
  }
}

export const explorerTxUrl = (net: CasperNet, hash: string) =>
  net === 'testnet'
    ? `https://testnet.cspr.live/deploy/${hash}`
    : `https://cspr.live/deploy/${hash}`
