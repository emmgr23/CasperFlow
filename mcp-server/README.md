# CasperFlow MCP server

Exposes CasperFlow's **real Casper Network actions** as [Model Context Protocol](https://modelcontextprotocol.io) tools, so any MCP client — nanobot, Claude, Claude Code, Cursor, etc. — can drive Casper directly.

## Tools

| Tool | What it does |
| --- | --- |
| `casper_account_info` | Agent wallet public key, network, live balance |
| `casper_get_balance` | Live CSPR balance of any public key |
| `casper_resolve_name` | Resolve a CSPR.name (e.g. `alice.cspr`) → account hash |
| `casper_send_cspr` | Sign + submit a real native CSPR transfer (key, account hash, or resolved CSPR.name) |
| `casper_delegate` | Sign + submit a real delegation (stake) to a validator |
| `casper_attest` | Build an EIP-712 attestation and anchor it on-chain (returns claim hash + explorer link) |

## Use it (no install, via npx)

Once published to npm, any MCP client runs the server automatically — no clone, no build:

```json
{
  "mcpServers": {
    "casperflow": {
      "command": "npx",
      "args": ["-y", "casperflow-mcp"],
      "env": {
        "CASPER_NETWORK": "testnet",
        "CSPR_CLOUD_KEY": "your-cspr-cloud-key",
        "CASPER_SECRET_KEY_HEX": "your-testnet-secret-key-hex"
      }
    }
  }
}
```

## Publish once (maintainer)

```bash
cd mcp-server
npm install
npm login
npm publish      # builds automatically via prepublishOnly
```

If the name `casperflow-mcp` is taken, use a scoped name (e.g. `@youruser/casperflow-mcp`) in `package.json` and in the `args` above.

## Local dev / build

```bash
cd mcp-server
npm install
npm run build    # outputs dist/
npm start
```

## Configure (environment variables)

| Variable | Required | Notes |
| --- | --- | --- |
| `CASPER_NETWORK` | no | `testnet` (default) or `mainnet` |
| `CSPR_CLOUD_KEY` | reads | Free key from https://console.cspr.cloud |
| `CASPER_SECRET_KEY_HEX` | writes | Hex secret key used to sign. **Testnet only — never use a key holding real funds.** |
| `CASPER_KEY_ALGO` | no | `ed25519` (default) or `secp256k1` |

## Use with an MCP client

Example client config (e.g. `~/.nanobot/config.json` `mcpServers`, or a Claude/Cursor MCP config):

```json
{
  "mcpServers": {
    "casperflow": {
      "command": "node",
      "args": ["/absolute/path/to/CasperFlow/mcp-server/dist/index.js"],
      "env": {
        "CASPER_NETWORK": "testnet",
        "CSPR_CLOUD_KEY": "your-cspr-cloud-key",
        "CASPER_SECRET_KEY_HEX": "your-testnet-secret-key-hex"
      }
    }
  }
}
```

Then your agent can say things like *"send 2.5 CSPR to alice.cspr and attest the payment"* and it will call these tools.

## Security

This server signs transactions locally with the key you provide. Use a **dedicated testnet key**. Do not point it at a key holding mainnet funds.
