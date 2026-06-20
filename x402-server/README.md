# CasperFlow x402 demo server

A tiny paid HTTP endpoint that demonstrates the x402 flow on Casper, end to end:

1. `GET /premium` with no payment returns **HTTP 402** + Casper payment requirements.
2. The client pays the required amount on Casper (a real CSPR transfer) and replays
   the request with an `X-PAYMENT` header carrying the settlement tx hash.
3. The server **verifies that transfer on-chain via CSPR.cloud**, then returns the
   premium content plus an `X-PAYMENT-RESPONSE` receipt header.

Zero dependencies. Requires Node 18+.

## Run

```bash
cd CasperFlow
CSPR_CLOUD_KEY="your-cspr-cloud-key" PAY_TO="<a-public-key-you-control>" node x402-server/server.mjs
```

Environment variables:

- `CSPR_CLOUD_KEY` (required): your free CSPR.cloud API key, used to verify payments.
- `PAY_TO` (required): the public key that receives the payment. Use a wallet you
  control that is **different** from the paying agent (Casper rejects self-transfers).
- `PRICE_MOTES` (optional): price per request in motes. Default `2500000000` (2.5 CSPR,
  the Casper native-transfer minimum).
- `NETWORK` (optional): `testnet` (default) or `mainnet`.
- `PORT` (optional): default `4021`.

The paid endpoint is then `http://localhost:4021/premium`, which is the default
target of the **x402 payment** action in CasperFlow.

> This is a demo server. It settles real value on Casper testnet and verifies it
> on-chain. Keep it on testnet.
