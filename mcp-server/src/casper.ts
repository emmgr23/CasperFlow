// Core Casper logic for the MCP server (headless Node port of CasperFlow's
// tx.ts / casper.ts). Signs locally with a key from the environment.
import {
  HttpHandler,
  RpcClient,
  CasperNetwork,
  NativeTransferBuilder,
  PublicKey,
  AccountHash,
  PrivateKey,
  KeyAlgorithm,
} from 'casper-js-sdk'
import { buildAttestation } from './attest.js'

export type CasperNet = 'testnet' | 'mainnet'

const MOTES = 1_000_000_000
const CHAIN: Record<CasperNet, string> = { testnet: 'casper-test', mainnet: 'casper' }

export interface Config {
  net: CasperNet
  csprCloudKey: string
  signer: PrivateKey | null
  publicHex: string
}

// Build the runtime config from environment variables.
export function loadConfig(): Config {
  const net: CasperNet = process.env.CASPER_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'
  const csprCloudKey = process.env.CSPR_CLOUD_KEY || ''
  const algo = (process.env.CASPER_KEY_ALGO || 'ed25519').toLowerCase() === 'secp256k1'
    ? KeyAlgorithm.SECP256K1
    : KeyAlgorithm.ED25519
  let signer: PrivateKey | null = null
  let publicHex = ''
  const hex = (process.env.CASPER_SECRET_KEY_HEX || '').trim()
  if (hex) {
    signer = PrivateKey.fromHex(hex, algo)
    publicHex = signer.publicKey.toHex()
  }
  return { net, csprCloudKey, signer, publicHex }
}

const restBase = (net: CasperNet) =>
  net === 'mainnet' ? 'https://api.cspr.cloud' : 'https://api.testnet.cspr.cloud'

function rpcOf(cfg: Config): RpcClient {
  let url: string
  const headers: Record<string, string> = {}
  if (cfg.csprCloudKey) {
    url = `https://node.${cfg.net}.cspr.cloud/rpc`
    headers.Authorization = cfg.csprCloudKey
  } else {
    url = `https://node.${cfg.net}.casper.network/rpc`
  }
  const handler = new HttpHandler(url)
  if (Object.keys(headers).length) handler.setCustomHeaders(headers)
  return new RpcClient(handler)
}

const explorerUrl = (net: CasperNet, hash: string) =>
  `https://${net === 'mainnet' ? 'cspr.live' : 'testnet.cspr.live'}/deploy/${hash}`

// ── Reads (CSPR.cloud REST) ──
export async function getBalance(cfg: Config, publicKey: string): Promise<number | null> {
  if (!cfg.csprCloudKey) throw new Error('CSPR_CLOUD_KEY is required for balance reads.')
  const r = await fetch(`${restBase(cfg.net)}/accounts/${publicKey}`, {
    headers: { authorization: cfg.csprCloudKey, accept: 'application/json' },
  })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`Balance read failed: HTTP ${r.status}`)
  const j: any = await r.json()
  const raw = j?.data?.balance ?? j?.balance
  return raw == null ? null : Number(raw) / MOTES
}

export async function resolveCsprName(cfg: Config, name: string): Promise<string> {
  if (!cfg.csprCloudKey) throw new Error('CSPR_CLOUD_KEY is required to resolve names.')
  const clean = name.trim().toLowerCase()
  const r = await fetch(`${restBase(cfg.net)}/cspr-name-resolutions/${encodeURIComponent(clean)}`, {
    headers: { authorization: cfg.csprCloudKey, accept: 'application/json' },
  })
  if (r.status === 404) throw new Error(`"${clean}" is not registered on ${cfg.net}.`)
  if (!r.ok) throw new Error(`Resolution failed: HTTP ${r.status}`)
  const j: any = await r.json()
  const hash = j?.data?.resolved_hash
  if (!hash || !/^[0-9a-fA-F]{64}$/.test(hash)) throw new Error('No address linked to this name.')
  return String(hash).toLowerCase()
}

// ── Signed writes ──
export interface TxResult {
  hash: string
  url: string
}

function requireSigner(cfg: Config): PrivateKey {
  if (!cfg.signer) throw new Error('CASPER_SECRET_KEY_HEX is required to sign transactions.')
  return cfg.signer
}

async function submit(cfg: Config, tx: any, signer: PrivateKey): Promise<TxResult> {
  tx.sign(signer)
  const result: any = await rpcOf(cfg).putTransaction(tx)
  const h = result?.transactionHash
  const hash = typeof h === 'string' ? h : (h?.toHex?.() ?? 'submitted')
  return { hash, url: explorerUrl(cfg.net, hash) }
}

export async function sendCspr(
  cfg: Config,
  recipient: string,
  amountCspr: number,
  transferId?: number,
): Promise<TxResult> {
  const signer = requireSigner(cfg)
  const to = recipient.trim().replace(/^account-hash-/i, '')
  const isKey = /^0(1[0-9a-fA-F]{64}|2[0-9a-fA-F]{66})$/.test(to)
  const isHash = /^[0-9a-fA-F]{64}$/.test(to)
  const builder = new NativeTransferBuilder()
    .from(cfg.signer!.publicKey)
    .amount(Math.round(amountCspr * MOTES).toString())
    .chainName(CHAIN[cfg.net])
    .payment(100_000_000)
  if (isKey) builder.target(PublicKey.fromHex(to))
  else if (isHash) builder.targetAccountHash(AccountHash.fromString(`account-hash-${to}`))
  else throw new Error('Recipient must be a public key or an account hash.')
  if (transferId && transferId > 0) builder.id(transferId)
  return submit(cfg, builder.build(), signer)
}

export async function delegate(
  cfg: Config,
  validatorHex: string,
  amountCspr: number,
): Promise<TxResult> {
  const signer = requireSigner(cfg)
  const casper = await CasperNetwork.create(rpcOf(cfg), 2)
  const tx = casper.createDelegateTransaction(
    cfg.signer!.publicKey,
    PublicKey.fromHex(validatorHex),
    CHAIN[cfg.net],
    Math.round(amountCspr * MOTES).toString(),
    2_500_000_000,
    1_800_000,
  )
  return submit(cfg, tx, signer)
}

// Attest: build an EIP-712 claim and anchor it on-chain via a self-transfer
// carrying the digest's 48-bit commitment as the transfer id.
export async function attest(cfg: Config, topic: string, data: string) {
  const signer = requireSigner(cfg)
  const att = buildAttestation(`${topic}:${data}`, cfg.publicHex)
  const builder = new NativeTransferBuilder()
    .from(cfg.signer!.publicKey)
    .target(cfg.signer!.publicKey)
    .amount((2.5 * MOTES).toString())
    .chainName(CHAIN[cfg.net])
    .payment(100_000_000)
    .id(att.transferId)
  const res = await submit(cfg, builder.build(), signer)
  return { ...res, claimHash: att.claimHash, digest: att.digest, record: att.record }
}
