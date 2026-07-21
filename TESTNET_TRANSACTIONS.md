# Sample testnet transactions & on-chain artifacts

All CasperFlow actions settle on **Casper testnet** and are viewable on
`testnet.cspr.live`. Below are real transactions produced by the app's autonomous
agent, with a description of what each one demonstrates.

## Agent account

The autonomous agent signs locally with a dedicated testnet key:

- **Public key:** `0203510844f1cdf751c2ccb6950be6e57477d9dd9ee3cb4c1deb6676d1f304dc1475`
- **Account on explorer:** https://testnet.cspr.live/account/0203510844f1cdf751c2ccb6950be6e57477d9dd9ee3cb4c1deb6676d1f304dc1475

## Sample transactions

| # | Type | What it demonstrates | Transaction |
|---|------|----------------------|-------------|
| 1 | Autonomous transfer | The agent read its on-chain balance, decided the treasury was above threshold, and **sent 5 CSPR** to a second wallet by itself (signed locally, no popup). Status: Success. | [`d93df443…db642b`](https://testnet.cspr.live/transaction/d93df443e283fb236eef214f26e90fbc40d2762e32cf7dc80eebbb2574db642b) |
| 2 | EIP-712 attestation | The agent **anchored a tamper-proof attestation** of its decision on Casper (EIP-712 typed-data digest committed on-chain). This is the "verifiable AI" proof that pairs with the payment above. | [`c72b7ce4…5bd021a`](https://testnet.cspr.live/transaction/c72b7ce4419e3932793e5712027a8afc5b91f126a5d24018a4779509f5bd021a) |
| 3 | EIP-712 attestation | An earlier agent run anchoring a decision on Casper. Status: Success. | [`00da4ad6…3519a1bd`](https://testnet.cspr.live/transaction/00da4ad61ae02f1b587e19da029203f05fe3f965e7d51c6d2fb4d13f3519a1bd) |

Each transaction is reproducible by following [TESTING.md](TESTING.md).

## How CasperFlow interacts with Casper (contract model)

CasperFlow is an **agent / client layer** on top of Casper. It composes on-chain
actions with `casper-js-sdk` v5, signing `TransactionV1` locally:

- **Native transfers** — autonomous payments (Test A) and x402 settlement.
- **EIP-712 attestations** — AI decisions are committed on-chain using the official
  `@casper-ecosystem/casper-eip-712` typed-data standard, so a decision's digest is
  provable and auditable.
- **Contract calls** — the **Call contract** node invokes any already-deployed
  Casper contract by its **contract/package hash** (user-supplied), e.g. CEP-18
  token operations or a DEX entry point via CSPR.trade.
- **x402 micropayments** — pay-per-request settlement verified on-chain via
  CSPR.cloud (see `x402-server/`).

Because CasperFlow is a client/agent layer, it does not ship its own custom
contract package; it drives Casper through native transactions, the EIP-712
standard, and calls to existing contracts. The Casper actions are also exposed as
an MCP server so other AI tools can call them:

- **MCP server (npm):** https://www.npmjs.com/package/casperflow-mcp

## Reproducing / verifying

1. Follow [TESTING.md](TESTING.md) to run the Treasury Guardian on testnet.
2. Open the `testnet.cspr.live/transaction/<hash>` link printed in the run log.
3. Confirm **Status: Success** and the transfer/attestation details.
