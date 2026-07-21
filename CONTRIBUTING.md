# Contributing to CasperFlow

Thanks for your interest in CasperFlow — a no-code visual builder for autonomous
AI agents on the Casper Network. Contributions of all kinds are welcome: bug
reports, features, documentation, and tests.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
By participating, you are expected to uphold it.

## Getting started

Requirements: **Node 20+** and npm.

```bash
git clone https://github.com/emmgr23/CasperFlow.git
cd CasperFlow
npm install
npm run dev        # start the app on http://localhost:5173
```

Optional (for the x402 demo): a separate paid endpoint server lives in
`x402-server/` — see [`x402-server/README.md`](x402-server/README.md).

The published MCP server lives in `mcp-server/` (npm: `casperflow-mcp`).

## Before you open a pull request

Please make sure the project builds and type-checks cleanly:

```bash
npx tsc --noEmit   # type-check
npm run build      # production build
```

The CI workflow runs the same checks on every pull request, plus CodeQL security
analysis. PRs should be green before review.

## Branching & commits

- Branch from `main` using a short descriptive name (e.g. `fix/agent-attest-guard`).
- Write clear, imperative commit messages ("Fix duplicate oracle key").
- Keep pull requests focused; one logical change per PR is easier to review.
- Fill in the pull request template so reviewers have context.

## Reporting bugs & requesting features

Open an issue using the appropriate template (bug report or feature request).
Include steps to reproduce, expected vs. actual behavior, and your environment.

## Security

Do **not** open public issues for security vulnerabilities. Follow the process in
[SECURITY.md](SECURITY.md).

## Testing on Casper testnet

CasperFlow signs and submits real transactions on Casper **testnet**. Keep all
testing on testnet and use a funded testnet key. Step-by-step instructions are in
[TESTING.md](TESTING.md).

## License

By contributing, you agree that your contributions will be licensed under the
same license as this project (see [LICENSE](LICENSE)).
