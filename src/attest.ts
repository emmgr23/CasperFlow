// EIP-712 attestations on Casper, following the official casper-eip-712 pattern:
//   Attestation(address subject, bytes32 claim_hash)
// We compute a standards-compliant claim hash + EIP-712 digest in the browser
// (keccak256 via @noble). The agent then anchors a timestamped proof on Casper.
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

// Casper testnet chain id (from the casper-eip-712 reference).
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
      new Uint8Array(32), // verifyingContract (zero) padded to 32
    ),
  )
}

const ATTEST_TYPEHASH = keccak(enc.encode('Attestation(address subject,bytes32 claim_hash)'))

export interface Attestation {
  record: string // the exact content that was attested
  claimHash: string // keccak256(record) — 0x…
  digest: string // EIP-712 digest — 0x…
  transferId: number // short on-chain commitment derived from the digest
}

// Build an EIP-712 Attestation for an agent's decision/output.
export function buildAttestation(record: string, subjectHex = ''): Attestation {
  const claimHash = keccak(enc.encode(record))
  // subject (address, 20 bytes) left-padded to 32; default zero.
  const subject = new Uint8Array(32)
  const clean = subjectHex.replace(/^0x/, '')
  if (clean.length >= 40) {
    const addr = Uint8Array.from(
      clean.slice(0, 40).match(/.{2}/g)!.map((h) => parseInt(h, 16)),
    )
    subject.set(addr, 12)
  }
  const structHash = keccak(concat(ATTEST_TYPEHASH, subject, claimHash))
  const digest = keccak(concat(new Uint8Array([0x19, 0x01]), domainSeparator(), structHash))
  const digestHex = toHex(digest)
  // 48-bit commitment from the digest, safe as a JS number for the transfer id.
  const transferId = Number(BigInt('0x' + digestHex.slice(0, 12)))
  return {
    record,
    claimHash: '0x' + toHex(claimHash),
    digest: '0x' + digestHex,
    transferId,
  }
}
