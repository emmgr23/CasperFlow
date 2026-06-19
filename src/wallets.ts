// Wallet profiles: reusable signing identities saved in the browser.
// Each profile holds a secret (PEM, hex, or seed phrase) and a signing mode.
// Seed-phrase import is EXPERIMENTAL (Casper ed25519 path m/44'/506'/0'/0'/0').

import { PrivateKey, KeyAlgorithm } from 'casper-js-sdk'
import { mnemonicToSeed } from '@scure/bip39'
import { hmac } from '@noble/hashes/hmac'
import { sha512 } from '@noble/hashes/sha512'
import { secp256k1 } from '@noble/curves/secp256k1'
import { getAccountBalance, type CasperNet } from './casper'
import { debugLog } from './runtime'

export type WalletFormat = 'pem' | 'hex' | 'seed'
export type SigningMode = 'autonomous' | 'manual'
export type WalletAlgo = 'ed25519' | 'secp256k1'

export interface WalletProfile {
  id: string
  name: string
  format: WalletFormat
  secret: string
  algo: WalletAlgo
  publicHex: string
  mode: SigningMode
  path?: string // HD derivation path used for seed wallets
}

const STORE = 'casperflow-wallets'

// Reactive store: components subscribe to stay in sync across the canvas + settings.
const listeners = new Set<() => void>()
export function subscribeWallets(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const notify = () => listeners.forEach((l) => l())

export function loadWalletProfiles(): WalletProfile[] {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '[]')
  } catch {
    return []
  }
}

function persist(list: WalletProfile[]) {
  localStorage.setItem(STORE, JSON.stringify(list))
  notify()
}

export function deleteWalletProfile(id: string): WalletProfile[] {
  const next = loadWalletProfiles().filter((p) => p.id !== id)
  persist(next)
  return next
}

export function upsertWalletProfile(p: WalletProfile): WalletProfile[] {
  const list = loadWalletProfiles()
  const i = list.findIndex((x) => x.id === p.id)
  if (i >= 0) list[i] = p
  else list.push(p)
  persist(list)
  return list
}

export function updateWalletProfile(id: string, patch: Partial<WalletProfile>): WalletProfile[] {
  const list = loadWalletProfiles().map((p) => (p.id === id ? { ...p, ...patch } : p))
  persist(list)
  return list
}

export function getWalletProfile(id: string): WalletProfile | undefined {
  return loadWalletProfiles().find((p) => p.id === id)
}

const algoEnum = (a: WalletAlgo) => (a === 'secp256k1' ? KeyAlgorithm.SECP256K1 : KeyAlgorithm.ED25519)
const toHex = (b: Uint8Array) =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')

function parsePath(path: string): { index: number; hardened: boolean }[] {
  return path
    .replace(/^m\//, '')
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      const hardened = seg.endsWith("'") || seg.endsWith('h')
      return { index: parseInt(seg.replace(/['h]/g, ''), 10), hardened }
    })
}

// SLIP-0010 ed25519 derivation (all segments hardened) — pure JS.
async function deriveSeedEd25519(mnemonic: string, path: string): Promise<string> {
  const seed = await mnemonicToSeed(mnemonic)
  let I = hmac(sha512, new TextEncoder().encode('ed25519 seed'), seed)
  let key = I.slice(0, 32)
  let chain = I.slice(32)
  for (const seg of parsePath(path)) {
    const i = (seg.index | 0x80000000) >>> 0 // ed25519 requires hardened
    const data = new Uint8Array(37)
    data[0] = 0x00
    data.set(key, 1)
    data[33] = (i >>> 24) & 0xff
    data[34] = (i >>> 16) & 0xff
    data[35] = (i >>> 8) & 0xff
    data[36] = i & 0xff
    I = hmac(sha512, chain, data)
    key = I.slice(0, 32)
    chain = I.slice(32)
  }
  return toHex(key)
}

// BIP32 secp256k1 derivation — implemented with @noble only (browser-safe).
async function deriveSeedSecp256k1(mnemonic: string, path: string): Promise<string> {
  const n = secp256k1.CURVE.n
  const ser32 = (i: number) => {
    const b = new Uint8Array(4)
    b[0] = (i >>> 24) & 0xff
    b[1] = (i >>> 16) & 0xff
    b[2] = (i >>> 8) & 0xff
    b[3] = i & 0xff
    return b
  }
  const b2i = (b: Uint8Array) => {
    let x = 0n
    for (const y of b) x = (x << 8n) | BigInt(y)
    return x
  }
  const i2b = (x: bigint) => {
    const b = new Uint8Array(32)
    for (let i = 31; i >= 0; i--) {
      b[i] = Number(x & 0xffn)
      x >>= 8n
    }
    return b
  }
  const seed = await mnemonicToSeed(mnemonic)
  let I = hmac(sha512, new TextEncoder().encode('Bitcoin seed'), seed)
  let key = I.slice(0, 32)
  let chain = I.slice(32)
  for (const seg of parsePath(path)) {
    const index = seg.hardened ? (seg.index | 0x80000000) >>> 0 : seg.index
    const data = new Uint8Array(37)
    if (index >= 0x80000000) {
      data[0] = 0
      data.set(key, 1)
    } else {
      data.set(secp256k1.getPublicKey(key, true), 0)
    }
    data.set(ser32(index), 33)
    I = hmac(sha512, chain, data)
    const ki = (b2i(I.slice(0, 32)) + b2i(key)) % n
    key = i2b(ki)
    chain = I.slice(32)
  }
  return toHex(key)
}

async function deriveSeedPrivateHex(
  mnemonic: string,
  algo: WalletAlgo,
  path: string,
): Promise<string> {
  return algo === 'secp256k1'
    ? deriveSeedSecp256k1(mnemonic, path)
    : deriveSeedEd25519(mnemonic, path)
}

// Candidate (algorithm, path) pairs tried for seed phrases, most likely first.
export const SEED_CANDIDATES: { algo: WalletAlgo; path: string }[] = [
  { algo: 'secp256k1', path: "m/44'/506'/0'/0/0" },
  { algo: 'ed25519', path: "m/44'/506'/0'" },
  { algo: 'secp256k1', path: "m/44'/506'/0'/0'/0'" },
  { algo: 'ed25519', path: "m/44'/506'/0'/0'/0'" },
  { algo: 'secp256k1', path: "m/44'/506'/0'" },
  { algo: 'ed25519', path: "m/44'/506'/0'/0/0" },
]

function readCsprSettings(): { net: CasperNet; key: string } {
  try {
    const s = JSON.parse(localStorage.getItem('casperflow-settings-v1') || '{}')
    return { net: s.casperNet === 'mainnet' ? 'mainnet' : 'testnet', key: s.csprCloudKey || '' }
  } catch {
    return { net: 'testnet', key: '' }
  }
}

// Derive a Casper PrivateKey from a stored secret (for signing at run time).
export async function deriveKey(
  format: WalletFormat,
  secret: string,
  algo: WalletAlgo,
  path?: string,
): Promise<PrivateKey> {
  const s = secret.trim()
  if (format === 'pem') return PrivateKey.fromPem(s, algoEnum(algo))
  if (format === 'hex') return PrivateKey.fromHex(s.replace(/^0x/, ''), algoEnum(algo))
  // seed: reproduce the exact key using the stored algorithm + path
  const p = path || "m/44'/506'/0'/0/0"
  const privHex = await deriveSeedPrivateHex(s, algo, p)
  return PrivateKey.fromHex(privHex, algoEnum(algo))
}

// Build a profile, deriving its public key. Tries both algorithms for pem/hex.
export async function buildProfile(opts: {
  id?: string
  name: string
  format: WalletFormat
  secret: string
  mode: SigningMode
}): Promise<{ ok: boolean; profile?: WalletProfile; error?: string }> {
  const { name, format, secret, mode } = opts
  const id = opts.id || `w${Date.now()}`
  try {
    if (format === 'seed') {
      // Derive every candidate, then pick the one that exists on-chain (so the
      // phrase resolves to the user's real funded account, ed25519 OR secp256k1).
      const derived: { algo: WalletAlgo; path: string; publicHex: string }[] = []
      for (const c of SEED_CANDIDATES) {
        try {
          const hex = await deriveSeedPrivateHex(secret.trim(), c.algo, c.path)
          const pub = PrivateKey.fromHex(hex, algoEnum(c.algo)).publicKey.toHex()
          derived.push({ algo: c.algo, path: c.path, publicHex: pub })
        } catch (e) {
          debugLog('wallet', `Candidate ${c.algo} ${c.path} failed: ${e instanceof Error ? e.message : 'error'}`)
        }
      }
      debugLog('wallet', `Derived ${derived.length}/${SEED_CANDIDATES.length} candidates from phrase.`)
      if (derived.length === 0) {
        return { ok: false, error: 'Could not derive a key from this recovery phrase.' }
      }
      let chosen = derived[0]
      const { net, key: cloudKey } = readCsprSettings()
      if (cloudKey) {
        for (const d of derived) {
          const info = await getAccountBalance(net, cloudKey, d.publicHex)
          if (info) {
            chosen = d
            break
          }
        }
      }
      return {
        ok: true,
        profile: {
          id,
          name,
          format,
          secret,
          algo: chosen.algo,
          path: chosen.path,
          publicHex: chosen.publicHex,
          mode,
        },
      }
    }
    for (const algo of ['ed25519', 'secp256k1'] as WalletAlgo[]) {
      try {
        const key = await deriveKey(format, secret, algo)
        return {
          ok: true,
          profile: { id, name, format, secret, algo, publicHex: key.publicKey.toHex(), mode },
        }
      } catch {
        /* try the other algorithm */
      }
    }
    return { ok: false, error: 'Could not parse this key (expected a PEM or hex secret key).' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid key' }
  }
}
