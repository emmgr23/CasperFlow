// EIP-712 attestation (ported from CasperFlow's browser attest.ts, unchanged math):
//   Attestation(address subject, bytes32 claim_hash)
import { keccak_256 } from '@noble/hashes/sha3'

const enc = new TextEncoder()
export const toHex = (b: Uint8Array) =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')

const concat = (...arrs: Uint8Array[]) => {
  const len = arrs.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(len)
  let o = 0
  for (const a of arrs) {
    out.set(a, o)
    o += a.length
  }
  return out
}

const u256be = (n: bigint) => {
  const b = new Uint8Array(32)
  for (let i = 31; i >= 0; i--) {
    b[i] = Number(n & 0xffn)
    n >>= 8n
  }
  return b
}

const CHAIN_ID = 1314614895n
const keccak = (d: Uint8Array) => keccak_256(d)

function domainSeparator(): Uint8Array {
  const typeHash = keccak(
    enc.encode('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
  )
  return keccak(
    concat(
      typeHash,
      keccak(enc.encode('CasperFlow')),
      keccak(enc.encode('1')),
      u256be(CHAIN_ID),
      new Uint8Array(32),
    ),
  )
}

const ATTEST_TYPEHASH = keccak(enc.encode('Attestation(address subject,bytes32 claim_hash)'))

export interface Attestation {
  record: string
  claimHash: string
  digest: string
  transferId: number
}

export function buildAttestation(record: string, subjectHex = ''): Attestation {
  const claimHash = keccak(enc.encode(record))
  const subject = new Uint8Array(32)
  const clean = subjectHex.replace(/^0x/, '')
  if (clean.length >= 40) {
    const addr = Uint8Array.from(clean.slice(0, 40).match(/.{2}/g)!.map((h) => parseInt(h, 16)))
    subject.set(addr, 12)
  }
  const structHash = keccak(concat(ATTEST_TYPEHASH, subject, claimHash))
  const digest = keccak(concat(new Uint8Array([0x19, 0x01]), domainSeparator(), structHash))
  const digestHex = toHex(digest)
  const transferId = Number(BigInt('0x' + digestHex.slice(0, 12)))
  return { record, claimHash: '0x' + toHex(claimHash), digest: '0x' + digestHex, transferId }
}
