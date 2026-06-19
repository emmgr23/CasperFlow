/// <reference types="vite/client" />

declare module 'ed25519-hd-key' {
  export function derivePath(
    path: string,
    seed: string,
    offset?: number,
  ): { key: Uint8Array; chainCode: Uint8Array }
  export function getPublicKey(privateKey: Uint8Array, withZeroByte?: boolean): Uint8Array
  export function getMasterKeyFromSeed(seed: string): { key: Uint8Array; chainCode: Uint8Array }
}
