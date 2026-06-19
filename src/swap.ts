// Real CSPR.trade swap via the official @make-software/cspr-trade-mcp-sdk.
// Non-custodial pattern: the SDK BUILDS the unsigned swap (remote), we SIGN it
// locally with the wallet key, and submit. Works on testnet (free) or mainnet.
//
// Honest status: BETA. Browser use of the SDK may hit CORS on the CSPR.trade API
// (a dev/prod proxy can fix it) and the exact unsigned-transaction format is
// confirmed on the first real run — both isolated below.
import { Deploy, Transaction, type PrivateKey } from 'casper-js-sdk'

// Non-literal specifier so the app still builds before the SDK is installed.
const SDK_PKG = ['@make-software', 'cspr-trade-mcp-sdk'].join('/')

export interface SwapResult {
  ok: boolean
  hash?: string
  summary?: string
  warnings?: string[]
  error?: string
}

// Sign an unsigned Casper transaction JSON (Deploy preferred — CSPR.trade's
// sign_deploy flow — falling back to TransactionV1) and return the signed JSON.
function signTxJson(txJson: string, signer: PrivateKey): string {
  const parsed = JSON.parse(txJson)
  try {
    const dep = Deploy.fromJSON(parsed)
    dep.sign(signer)
    const staticToJSON = (Deploy as unknown as { toJSON?: (d: Deploy) => unknown }).toJSON
    return JSON.stringify(staticToJSON ? staticToJSON(dep) : (dep as unknown as { toJSON: () => unknown }).toJSON())
  } catch {
    const tx = Transaction.fromJSON(parsed)
    tx.sign(signer)
    return JSON.stringify(tx.toJSON())
  }
}

export async function swapReal(opts: {
  net: 'testnet' | 'mainnet'
  tokenIn: string
  tokenOut: string
  amount: string
  type: 'exact_in' | 'exact_out'
  slippageBps?: number
  deadlineMinutes?: number
  signer: PrivateKey
  senderPublicHex: string
}): Promise<SwapResult> {
  let mod: { CsprTradeClient: new (cfg: { network: string }) => Record<string, (a: unknown) => Promise<Record<string, unknown>>> }
  try {
    mod = (await import(/* @vite-ignore */ SDK_PKG)) as typeof mod
  } catch {
    return { ok: false, error: 'Install @make-software/cspr-trade-mcp-sdk to enable real swaps.' }
  }
  try {
    const client = new mod.CsprTradeClient({ network: opts.net })
    const bundle = (await client.buildSwap({
      tokenIn: opts.tokenIn,
      tokenOut: opts.tokenOut,
      amount: opts.amount,
      type: opts.type,
      slippageBps: opts.slippageBps ?? 300,
      deadlineMinutes: opts.deadlineMinutes ?? 20,
      senderPublicKey: opts.senderPublicHex,
    })) as {
      transactionJson: string
      summary?: string
      warnings?: string[]
      approvalRequired?: { transactionJson: string }
    }

    // Some swaps require a CEP-18 approval transaction first.
    if (bundle.approvalRequired?.transactionJson) {
      const signedApproval = signTxJson(bundle.approvalRequired.transactionJson, opts.signer)
      await client.submitTransaction(signedApproval as unknown as Record<string, unknown>)
    }

    const signed = signTxJson(bundle.transactionJson, opts.signer)
    const res = (await client.submitTransaction(signed as unknown as Record<string, unknown>)) as {
      transactionHash?: string
    }
    return { ok: true, hash: res?.transactionHash ?? '', summary: bundle.summary, warnings: bundle.warnings }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'swap failed (likely CORS / API / format — see console)' }
  }
}
