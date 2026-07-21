# Security Policy

CasperFlow builds autonomous agents that sign and submit **real** transactions on
the Casper Network. We take security seriously and appreciate responsible
disclosure.

## Supported scope

This policy covers the CasperFlow web application (`src/`), the published MCP
server (`mcp-server/`), and the x402 demo server (`x402-server/`).

CasperFlow is a testnet-first project. Never use mainnet keys or real funds while
testing.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report privately using GitHub's built-in **Security Advisories**:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability** (Privately report a vulnerability).
3. Describe the issue, its impact, and steps to reproduce.

You can also contact the repository owner directly at
[@emmgr23](https://github.com/emmgr23).

We aim to acknowledge reports within a few days and to provide a remediation
timeline after triage.

## Handling of keys and secrets

- CasperFlow signs locally; private keys and API keys never leave the browser or
  the machine running the MCP / x402 servers.
- Do not commit secret keys, `.pem` files, `.env` files, or API tokens. The
  `.gitignore` excludes common secret paths — please double-check before pushing.
- If you believe a secret has been committed, rotate it immediately and report it
  through the channel above.

## Good practice for users

- Use a dedicated **testnet** key funded from the faucet, separate from any
  mainnet account.
- Set a **Spend limit** node on autonomous agents so an agent can never move more
  than a capped amount.
- Review the on-chain proof links an agent produces before trusting a run.
