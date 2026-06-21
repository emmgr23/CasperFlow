# CasperFlow Escrow (CEP-style conditional payment)

Conditional escrow for x402 agent payments: funds are held on Casper and
released to the seller **only when delivery is verified**, otherwise refunded to
the buyer. This is the on-chain half of CasperFlow's escrow roadmap (the in-app
half — pay → verify response → stop branch — already ships in the x402 node).

## Flow

```
buyer agent ──deposit(seller) [+CSPR]──▶  Escrow
                                            │  holds funds, status = open
resolver  ──release(id)──▶ pay seller   ◀──┘   (delivery verified)
resolver  ──refund(id) ──▶ refund buyer        (delivery failed / timed out)
```

The `resolver` is whoever is trusted to judge delivery: the buyer's own agent, a
verifier set, or a small **multisig built from Casper's weighted account keys** —
CasperFlow's natural differentiator.

## Build (do this on your machine — not committed)

```bash
# install Odra's cargo tooling once
cargo install cargo-odra --locked

cd contracts/escrow
cargo odra build            # produces wasm/casperflow_escrow.wasm
```

Then copy the wasm to `public/escrow.wasm` so CasperFlow can install it no-code,
exactly like `cep18.wasm` / `cep78.wasm` (see `../../SMART_CONTRACTS.md`).

## Status — honest

This is **source written to the published Odra 1.4 API but not yet compiled in
CI**. Treat the first `cargo odra build` as the validation step; the module is
deliberately tiny (deposit / release / refund / get_deal) so any API drift is a
quick fix. Do not use on mainnet without an audit.

## Next

- `release_to`/partial release for milestone payments.
- `deadline` + permissionless `refund` after timeout (so a buyer isn't stuck if
  the resolver disappears).
- A matching CasperFlow node: **Escrow pay (x402)** = deposit → verify → release.
