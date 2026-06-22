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
  Key,
  KeyTypeID,
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
    // Sign locally with the connected wallet key (no browser-extension popup).
    // Any in-app approval, in Manual mode, already happened before this point.
    debugLog('tx', `Signing locally with the connected wallet key: ${label}`)
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

// Deploy a CEP-18 fungible token, no code. The compiled CEP-18 WASM must be
// available (place cep18.wasm in /public). Args follow the casper-ecosystem/cep18
// install signature; the exact set is validated on the first real testnet run.
export async function deployTokenReal(opts: {
  net: CasperNet
  senderHex: string
  name: string
  symbol: string
  decimals: number
  totalSupply: string // base units, as a decimal string
  paymentCspr: number
  enableMintBurn?: boolean // dropdown: can new supply be minted / burned later?
  emitEvents?: boolean // dropdown: emit CES events for indexers
  wasmUrl?: string
}): Promise<TxResult> {
  try {
    const fromHex = hasAgentKey() ? getAgentPublicHex()! : opts.senderHex
    const url = opts.wasmUrl || '/cep18.wasm'
    let bytes: Uint8Array
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      bytes = new Uint8Array(await r.arrayBuffer())
    } catch {
      return {
        ok: false,
        error: `Contract WASM not found at ${url}. Add the compiled CEP-18 wasm to /public to enable real deploys (see SMART_CONTRACTS.md).`,
      }
    }
    const casper = await CasperNetwork.create(rpcOf(opts.net), 2)
    const args = Args.fromMap({
      name: CLValue.newCLString(opts.name),
      symbol: CLValue.newCLString(opts.symbol),
      decimals: CLValue.newCLUint8(opts.decimals),
      total_supply: CLValue.newCLUInt256(opts.totalSupply),
      // events_mode: 0 = no events, 1 = CES (indexable on-chain events)
      events_mode: CLValue.newCLUint8(opts.emitEvents ? 1 : 0),
      // enable_mint_burn: 0 = fixed supply, 1 = mintable / burnable later
      enable_mint_burn: CLValue.newCLUint8(opts.enableMintBurn ? 1 : 0),
    })
    const tx = casper.createSessionWasmTransaction(
      PublicKey.fromHex(fromHex),
      CHAIN[opts.net],
      Math.round(opts.paymentCspr * MOTES),
      1_800_000,
      bytes,
      args,
    )
    return await signSubmit(tx, fromHex, opts.net, `Deploy CEP-18 token "${opts.symbol}"`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    debugLog('tx', `Token deploy failed: ${msg}`)
    return { ok: false, error: msg }
  }
}

// ── CEP-78 NFT collection deploy — the "semi-automatic" contract: the caller
// picks behaviours (ownership, minting, mutability, burnable…) from dropdowns,
// and those choices map to the CEP-78 install modalities below. One audited,
// pre-compiled WASM (place cep78.wasm in /public); no Rust compilation needed.
// Numeric codes follow the casper-nft/cep78 standard; validated on first run.
export async function deployNftReal(opts: {
  net: CasperNet
  senderHex: string
  name: string
  symbol: string
  totalSupply: number // max number of NFTs the collection can ever hold
  ownershipMode: number // 0 Minter · 1 Assigned (soulbound) · 2 Transferable
  mintingMode: number // 0 Installer only · 1 Public · 2 ACL
  metadataMutability: number // 0 Immutable · 1 Mutable
  burnMode: number // 0 Burnable · 1 Non-burnable
  allowMinting: boolean
  nftKind?: number // 0 Physical · 1 Digital · 2 Virtual (default Digital)
  metadataKind?: number // 0 CEP78 · 1 NFT721 · 2 Raw · 3 CustomValidated
  identifierMode?: number // 0 Ordinal · 1 Hash (default Ordinal)
  eventsMode?: number // 0 None · 1 CES (default CES)
  paymentCspr: number
  wasmUrl?: string
}): Promise<TxResult> {
  try {
    const fromHex = hasAgentKey() ? getAgentPublicHex()! : opts.senderHex
    const url = opts.wasmUrl || '/cep78.wasm'
    let bytes: Uint8Array
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      bytes = new Uint8Array(await r.arrayBuffer())
    } catch {
      return {
        ok: false,
        error: `Contract WASM not found at ${url}. Add the compiled CEP-78 wasm to /public to enable real NFT deploys (see SMART_CONTRACTS.md).`,
      }
    }
    const casper = await CasperNetwork.create(rpcOf(opts.net), 2)
    const args = Args.fromMap({
      collection_name: CLValue.newCLString(opts.name),
      collection_symbol: CLValue.newCLString(opts.symbol),
      total_token_supply: CLValue.newCLUint64(opts.totalSupply),
      ownership_mode: CLValue.newCLUint8(opts.ownershipMode),
      nft_kind: CLValue.newCLUint8(opts.nftKind ?? 1),
      nft_metadata_kind: CLValue.newCLUint8(opts.metadataKind ?? 0),
      identifier_mode: CLValue.newCLUint8(opts.identifierMode ?? 0),
      metadata_mutability: CLValue.newCLUint8(opts.metadataMutability),
      json_schema: CLValue.newCLString(''),
      minting_mode: CLValue.newCLUint8(opts.mintingMode),
      allow_minting: CLValue.newCLValueBool(opts.allowMinting),
      burn_mode: CLValue.newCLUint8(opts.burnMode),
      events_mode: CLValue.newCLUint8(opts.eventsMode ?? 1),
      owner_reverse_lookup_mode: CLValue.newCLUint8(0),
    })
    const tx = casper.createSessionWasmTransaction(
      PublicKey.fromHex(fromHex),
      CHAIN[opts.net],
      Math.round(opts.paymentCspr * MOTES),
      1_800_000,
      bytes,
      args,
    )
    return await signSubmit(tx, fromHex, opts.net, `Deploy CEP-78 collection "${opts.symbol}"`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    debugLog('tx', `NFT deploy failed: ${msg}`)
    return { ok: false, error: msg }
  }
}

// Mint one NFT into a deployed CEP-78 collection. The recipient is given as a
// public key (converted to a Key account-hash). Metadata is a JSON string the
// node builds from the name / image-URL fields. Entrypoint + args follow the
// CEP-78 `mint` signature (CEP78 metadata kind); validated on first real run.
export async function mintNftReal(opts: {
  net: CasperNet
  senderHex: string
  contractHash: string
  ownerHex: string // recipient public key (blank = the signer)
  metadataJson: string
  paymentCspr: number
}): Promise<TxResult> {
  try {
    const fromHex = hasAgentKey() ? getAgentPublicHex()! : opts.senderHex
    const ownerHex = opts.ownerHex && /^0[12][0-9a-fA-F]+$/.test(opts.ownerHex) ? opts.ownerHex : fromHex
    const ownerKey = Key.createByType(
      PublicKey.fromHex(ownerHex).accountHash().toPrefixedString(),
      KeyTypeID.Account,
    )
    const casper = await CasperNetwork.create(rpcOf(opts.net), 2)
    const args = Args.fromMap({
      token_owner: CLValue.newCLKey(ownerKey),
      token_meta_data: CLValue.newCLString(opts.metadataJson),
    })
    const transaction = casper.createContractCallTransaction(
      PublicKey.fromHex(fromHex),
      opts.contractHash,
      'mint',
      CHAIN[opts.net],
      Math.round(opts.paymentCspr * MOTES),
      1_800_000,
      args,
    )
    return await signSubmit(transaction, fromHex, opts.net, `Mint NFT`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    debugLog('tx', `NFT mint failed: ${msg}`)
    return { ok: false, error: msg }
  }
}

// After a transaction is submitted, poll the node for its EXECUTION result so we
// can tell the user whether it actually SUCCEEDED on-chain — not just that it was
// accepted into the mempool. Returns 'pending' if it hasn't executed in time.
export async function awaitExecution(
  net: CasperNet,
  hash: string,
  opts?: { tries?: number; delayMs?: number },
): Promise<{
  status: 'success' | 'failed' | 'pending'
  error?: string
  cost?: number // net cost charged, in motes
  limit?: number // gas authorized / held upfront, in motes
  consumed?: number // gas actually consumed, in motes
  refund?: number // amount refunded, in motes
}> {
  const tries = opts?.tries ?? 12
  const delayMs = opts?.delayMs ?? 3500
  const client = rpcOf(net)
  for (let i = 0; i < tries; i++) {
    try {
      const res = (await client.getTransactionByTransactionHash(hash)) as {
        executionInfo?: {
          executionResult?: {
            errorMessage?: string
            cost?: number
            limit?: number
            consumed?: number
            refund?: number
          }
        }
      }
      const exec = res?.executionInfo?.executionResult
      if (exec) {
        const gas = { cost: exec.cost, limit: exec.limit, consumed: exec.consumed, refund: exec.refund }
        if (exec.errorMessage) return { status: 'failed', error: exec.errorMessage, ...gas }
        return { status: 'success', ...gas }
      }
    } catch {
      // Not indexed yet / transient RPC error — keep polling.
    }
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return { status: 'pending' }
}

export const explorerTxUrl = (net: CasperNet, hash: string) =>
  net === 'testnet'
    ? `https://testnet.cspr.live/deploy/${hash}`
    : `https://cspr.live/deploy/${hash}`
