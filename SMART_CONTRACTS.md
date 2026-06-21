# CasperFlow — No-code Smart Contracts

CasperFlow lets you deploy and use real Casper smart contracts from the canvas,
with **no Rust and no compilation**. The approach is "semi-automatic": you pick
behaviours from dropdowns, and CasperFlow maps those choices to the install
arguments of a small library of **pre-compiled, audited standard contracts**
(CEP-18, CEP-78). One WASM per standard, configured by parameters.

> Why not fully custom contracts? Rust → WASM can't be compiled in the browser,
> and the space of arbitrary contract logic is unbounded. So CasperFlow covers
> the **well-defined contract families** (token, NFT, …) where the standard WASM
> already exposes the behaviour as install-time modalities. Truly custom logic is
> a future backend-compiler track (Odra + AI), see `contracts/`.

---

## 1. One-time setup — drop the WASM in `/public`

CasperFlow loads the compiled contract bytes from `/public` at deploy time. Add
the two standard binaries once:

| Contract | File to place | Where to get it |
|---|---|---|
| CEP-18 fungible token | `public/cep18.wasm` | [`casper-ecosystem/cep18`](https://github.com/casper-ecosystem/cep18) → Releases → `cep18.wasm` (or `cargo odra build` in that repo) |
| CEP-78 NFT collection | `public/cep78.wasm` | [`casper-ecosystem/cep-78-enhanced-nft`](https://github.com/casper-ecosystem/cep-78-enhanced-nft) → Releases → contract wasm (rename to `cep78.wasm`) |

```
CasperFlow/
└── public/
    ├── cep18.wasm   ← fungible token
    └── cep78.wasm   ← NFT collection
```

If a file is missing, the node says exactly which one to add — nothing else
breaks. Until then, the deploy nodes run in **simulation** (no transaction).

> The binaries are **not** committed to the repo (they are large and you should
> verify their provenance yourself). They are gitignored by default.

---

## 2. The nodes

### Deploy token (CEP-18) — `action`
Dropdowns → install args:

| Dropdown | Maps to | Values |
|---|---|---|
| Supply | `enable_mint_burn` | Fixed forever → `0` · Mintable/burnable → `1` |
| On-chain events | `events_mode` | On (CES) → `1` · Off → `0` |

Plus name, symbol, decimals (`U8`), total supply (`U256`, base units).

### Deploy NFT collection (CEP-78) — `action`
This is the flagship "semi-automatic contract" — the CEP-78 standard is *modal*
by design, so each dropdown is one install modality:

| Dropdown | Maps to (`U8`) | Values |
|---|---|---|
| Ownership | `ownership_mode` | Transferable `2` · Soulbound `1` · Minter-owned `0` |
| Who can mint | `minting_mode` | Only me (installer) `0` · Public `1` |
| Metadata | `metadata_mutability` | Immutable `0` · Mutable `1` |
| Burnable | `burn_mode` | Yes `0` · No `1` |

Safe defaults are set for the rest: `nft_kind = Digital (1)`,
`nft_metadata_kind = CEP78 (0)`, `identifier_mode = Ordinal (0)`,
`events_mode = CES (1)`, `owner_reverse_lookup_mode = NoLookup (0)`,
`json_schema = ""`, `allow_minting = true`.

> CEP-78 constraint: `Mutable` metadata is only valid with Ordinal identifiers
> and the CEP78/CustomValidated metadata kind — which are the defaults here, so
> the combinations the dropdowns allow are always valid.

### Mint NFT — `action`
Calls the collection's `mint` entrypoint. Builds the metadata JSON from the
name + image URL fields, and sets `token_owner` to a recipient public key (blank
= the signer). Wire it after **Deploy NFT collection** and it reads the new
contract hash from `{{collection}}`.

---

## 3. Honest status

- The deploy/mint **code paths are complete** and type-checked. The exact
  install-arg set is **version-sensitive** (CEP-78 1.5.x vs 2.0); the arg names
  used here follow the published standard and are isolated in `src/tx.ts`
  (`deployTokenReal`, `deployNftReal`, `mintNftReal`) so they're trivial to
  tweak against the WASM you drop in, using **Settings → Logs** on the first
  real testnet run.
- Everything respects the **Spend limit** guardrail and the in-app approval flow
  like every other signable action.

---

## 4. Roadmap — beyond presets

- **More families:** escrow, vesting, multisig, attestation registry — same
  "pre-compiled WASM + dropdown modalities" model. The escrow source lives in
  `contracts/escrow/` (powers the x402 conditional-payment roadmap).
- **Truly custom contracts:** a backend service that compiles Odra from a config
  (+ an AI that writes the Odra) — the only way to go past fixed families,
  intentionally kept off the critical path.
