// Real x402 client for Casper. Implements the HTTP 402 handshake and signs an
// EIP-712 TransferAuthorization (EIP-3009 style) using the official Casper
// standard package @casper-ecosystem/casper-eip-712, then replays the request.
//
// Honest status: the 402 handshake and the EIP-712 signing follow the official
// Casper x402 spec (make-software/casper-x402 + casper-eip-712). The exact
// payment-payload wire format should be validated against a live facilitator
// (the Go demo runs free on testnet) — it is isolated below for easy tweaking.
import type { PrivateKey } from 'casper-js-sdk'

// Loaded lazily (non-literal specifier) so the app still builds before the
// `npm install @casper-ecosystem/casper-eip-712` step.
const EIP712_PKG = ['@casper-ecosystem', 'casper-eip-712'].join('/')

const toHex = (b: Uint8Array) =>
  Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')
const hexToBytes = (h: string) => {
  const c = h.replace(/^0x/, '')
  const o = new Uint8Array(c.length / 2)
  for (let i = 0; i < o.length; i++) o[i] = parseInt(c.slice(i * 2, i * 2 + 2), 16)
  return o
}
const randHex32 = () => toHex(crypto.getRandomValues(new Uint8Array(32)))
const b64 = (s: string) => btoa(s)

export interface X402Result {
  ok: boolean
  status: number
  paid: boolean
  body?: string
  amount?: string
  payTo?: string
  asset?: string
  txHash?: string
  error?: string
}

export async function payX402(opts: {
  url: string
  method: string
  signer: PrivateKey
  payerPublicHex: string
  payerAccountHashHex: string // 32-byte hex (no prefix)
  net: 'testnet' | 'mainnet'
  maxPriceUnits?: bigint // optional client-side cap (in token base units)
}): Promise<X402Result> {
  const url = /^https?:\/\//.test(opts.url) ? opts.url : `https://${opts.url}`

  // 1) Initial request — a free resource returns 200, a paid one returns 402.
  let res: Response
  try {
    res = await fetch(url, { method: opts.method })
  } catch (e) {
    return { ok: false, status: 0, paid: false, error: `Request failed: ${e instanceof Error ? e.message : 'network/CORS'}` }
  }
  if (res.status !== 402) {
    return { ok: res.ok, status: res.status, paid: false, body: (await res.text()).slice(0, 2000) }
  }

  // 2) Parse the x402 PaymentRequirements.
  let reqJson: Record<string, unknown>
  try {
    reqJson = await res.json()
  } catch {
    return { ok: false, status: 402, paid: false, error: '402 returned no JSON payment requirements.' }
  }
  const accepts = (reqJson.accepts as Record<string, unknown>[]) || (reqJson.paymentRequirements as Record<string, unknown>[]) || []
  const accept = accepts.find((a) => String(a.network || '').startsWith('casper')) || accepts[0]
  if (!accept) return { ok: false, status: 402, paid: false, error: 'No Casper payment option offered by this endpoint.' }

  const extra = (accept.extra as Record<string, unknown>) || {}
  const amount = String(accept.maxAmountRequired ?? accept.amount ?? accept.price ?? '0')
  const payTo = String(accept.payTo ?? accept.payee ?? '').replace(/^0x/, '').replace(/^00/, '')
  const assetPkg = String(accept.asset ?? extra.contractPackageHash ?? extra.asset ?? '').replace(/^0x/, '')
  const network = String(accept.network ?? `casper:${opts.net === 'mainnet' ? 'casper' : 'casper-test'}`)
  if (opts.maxPriceUnits != null && BigInt(amount) > opts.maxPriceUnits) {
    return { ok: false, status: 402, paid: false, amount, error: `Price ${amount} exceeds your max — not paying.` }
  }

  // 3) Build + hash the EIP-712 TransferAuthorization with the official package.
  let eip: {
    hashTypedData: (d: unknown, t: unknown, p: string, m: unknown, o?: unknown) => string | Uint8Array
    CASPER_DOMAIN_TYPES?: unknown
  }
  try {
    eip = (await import(/* @vite-ignore */ EIP712_PKG)) as typeof eip
  } catch {
    return { ok: false, status: 402, paid: false, error: 'Install @casper-ecosystem/casper-eip-712 to enable x402 signing.' }
  }
  const nowSec = Math.floor(Date.now() / 1000)
  const validBefore = nowSec + 600
  const domain = {
    name: String(extra.name ?? 'CSPR'),
    version: String(extra.version ?? '1'),
    chain_name: network,
    contract_package_hash: '0x' + assetPkg,
  }
  const types = {
    TransferAuthorization: [
      { name: 'from', type: 'bytes32' },
      { name: 'to', type: 'bytes32' },
      { name: 'value', type: 'uint256' },
      { name: 'valid_after', type: 'uint64' },
      { name: 'valid_before', type: 'uint64' },
      { name: 'nonce', type: 'bytes32' },
    ],
  }
  const nonce = '0x' + randHex32()
  const message = {
    from: '0x' + opts.payerAccountHashHex.replace(/^0x/, ''),
    to: '0x' + payTo,
    value: BigInt(amount),
    valid_after: 0n,
    valid_before: BigInt(validBefore),
    nonce,
  }
  const domainTypes = eip.CASPER_DOMAIN_TYPES
  const digest = eip.hashTypedData(domain, types, 'TransferAuthorization', message, domainTypes ? { domainTypes } : undefined)
  const digestBytes = typeof digest === 'string' ? hexToBytes(digest) : digest

  // 4) Sign the digest locally with the connected wallet key.
  const signFn = (opts.signer as unknown as { rawSign?: (m: Uint8Array) => Promise<Uint8Array>; sign: (m: Uint8Array) => Uint8Array })
  const sig = signFn.rawSign ? await signFn.rawSign(digestBytes) : signFn.sign(digestBytes)

  // 5) Assemble the payment payload and replay (wire format to confirm vs facilitator).
  const paymentPayload = {
    x402Version: (reqJson.x402Version as number) ?? 1,
    scheme: String(accept.scheme ?? 'exact'),
    network,
    payload: {
      signature: '0x' + toHex(sig),
      publicKey: opts.payerPublicHex,
      authorization: {
        from: message.from,
        to: message.to,
        value: amount,
        validAfter: '0',
        validBefore: String(validBefore),
        nonce,
      },
    },
  }
  const header = b64(JSON.stringify(paymentPayload))
  let res2: Response
  try {
    res2 = await fetch(url, { method: opts.method, headers: { 'PAYMENT-SIGNATURE': header, 'X-PAYMENT': header } })
  } catch (e) {
    return { ok: false, status: 0, paid: true, amount, payTo, error: `Payment replay failed: ${e instanceof Error ? e.message : 'network'}` }
  }
  let txHash = ''
  const settle = res2.headers.get('X-PAYMENT-RESPONSE') || res2.headers.get('PAYMENT-RESPONSE') || ''
  if (settle) {
    try {
      const j = JSON.parse(atob(settle))
      txHash = String(j.transaction ?? j.txHash ?? j.deploy ?? '')
    } catch {
      /* ignore */
    }
  }
  return { ok: res2.ok, status: res2.status, paid: true, body: (await res2.text()).slice(0, 2000), amount, payTo, asset: assetPkg, txHash }
}

// x402 "pay-and-prove": the agent receives a 402, pays the required amount on
// Casper with a REAL transfer (via the `pay` callback), then replays the request
// presenting the settlement tx hash. The server verifies that transfer on-chain
// (CSPR.cloud) and returns the resource. End-to-end, real value settled on Casper.
export async function payX402OnChain(opts: {
  url: string
  method: string
  payerPublicHex: string
  net: 'testnet' | 'mainnet'
  maxPriceMotes?: bigint
  pay: (payToHex: string, amountMotes: bigint) => Promise<{ ok: boolean; hash?: string; error?: string }>
  log?: (m: string) => void
}): Promise<X402Result> {
  const url = /^https?:\/\//.test(opts.url) ? opts.url : `http://${opts.url}`
  const log = opts.log ?? (() => {})

  let res: Response
  try {
    res = await fetch(url, { method: opts.method })
  } catch (e) {
    return { ok: false, status: 0, paid: false, error: `Request failed: ${e instanceof Error ? e.message : 'network/CORS'}` }
  }
  if (res.status !== 402) {
    return { ok: res.ok, status: res.status, paid: false, body: (await res.text()).slice(0, 2000) }
  }

  let reqJson: Record<string, unknown>
  try {
    reqJson = await res.json()
  } catch {
    return { ok: false, status: 402, paid: false, error: '402 returned no JSON payment requirements.' }
  }
  const accepts = (reqJson.accepts as Record<string, unknown>[]) || []
  const accept = accepts.find((a) => String(a.network || '').startsWith('casper')) || accepts[0]
  if (!accept) return { ok: false, status: 402, paid: false, error: 'No Casper payment option offered by this endpoint.' }
  const amount = BigInt(String(accept.maxAmountRequired ?? accept.amount ?? accept.price ?? '0'))
  const payTo = String(accept.payTo ?? accept.payee ?? '').trim()
  const network = String(accept.network ?? (opts.net === 'mainnet' ? 'casper:casper' : 'casper:casper-test'))
  if (!payTo) return { ok: false, status: 402, paid: false, error: 'Endpoint did not provide a payTo address.' }
  if (opts.maxPriceMotes != null && amount > opts.maxPriceMotes) {
    return { ok: false, status: 402, paid: false, amount: amount.toString(), error: `Price ${amount} exceeds your max — not paying.` }
  }

  log(`402: paying ${Number(amount) / 1e9} CSPR to ${payTo.slice(0, 10)}… on Casper`)
  const p = await opts.pay(payTo, amount)
  if (!p.ok || !p.hash) {
    return { ok: false, status: 402, paid: false, amount: amount.toString(), payTo, error: `On-chain payment failed: ${p.error || 'unknown'}` }
  }
  log(`paid — settlement tx ${p.hash.slice(0, 16)}… — presenting proof, server is verifying on-chain`)

  const header = b64(
    JSON.stringify({
      x402Version: (reqJson.x402Version as number) ?? 1,
      scheme: String(accept.scheme ?? 'exact'),
      network,
      payload: { transaction: p.hash, payer: opts.payerPublicHex },
    }),
  )
  let res2: Response
  try {
    res2 = await fetch(url, { method: opts.method, headers: { 'X-PAYMENT': header, 'PAYMENT-SIGNATURE': header } })
  } catch (e) {
    return { ok: false, status: 0, paid: true, amount: amount.toString(), payTo, txHash: p.hash, error: `Replay failed: ${e instanceof Error ? e.message : 'network'}` }
  }
  return {
    ok: res2.ok,
    status: res2.status,
    paid: true,
    body: (await res2.text()).slice(0, 2000),
    amount: amount.toString(),
    payTo,
    txHash: p.hash,
  }
}
