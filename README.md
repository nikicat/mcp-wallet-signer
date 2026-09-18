# mcp-wallet-signer

[![npm version](https://img.shields.io/npm/v/mcp-wallet-signer)](https://www.npmjs.com/package/mcp-wallet-signer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> [!WARNING]
> **Superseded by [browser-web3-signer](https://github.com/nikicat/browser-web3-signer)** — the
> same browser-wallet signing flow, reimplemented in Rust with a CLI plus Rust/TypeScript/Go
> libraries. Everything published from this repo is now a thin compatibility shim over it, so
> existing installs keep working; new code should use `browser-web3-signer` directly.

**Your private keys never leave your browser.** Every transaction requires explicit approval in
your own wallet (MetaMask, Rabby, TronLink, …).

Most blockchain tooling wants a private key in a config file — full, unsupervised access to your
funds. These packages route each request to the browser wallet you already use, so you review and
approve it like any other dapp interaction.

## Packages

| Package | What it is now |
|---------|----------------|
| [`mcp-wallet-signer`](packages/mcp-wallet-signer) | MCP stdio server: four signing tools over `browser-web3-signer` |
| [`browser-evm-signer`](packages/browser-evm-signer) | The old `WalletSigner` EVM library API, re-backed by the Rust bridge |
| [`browser-tron-signer`](packages/browser-tron-signer) | The same for TRON (TronLink, TRC-20, contract deploys) |

All three spawn `browser-web3-signer serve`, which owns the localhost bridge, the approval page
and the browser tab. The binary for your platform is installed as a dependency; nothing else to
set up.

### MCP server

```bash
claude mcp add wallet-signer -- npx -y mcp-wallet-signer
```

Or, for Claude Desktop / Cursor / Windsurf and any other stdio MCP client:

```json
{
  "mcpServers": {
    "wallet-signer": {
      "command": "npx",
      "args": ["-y", "mcp-wallet-signer"]
    }
  }
}
```

| Tool | Description |
|------|-------------|
| `connect_wallet` | Connect a wallet, return the address |
| `send_transaction` | Send value or call a contract, return the tx hash |
| `sign_message` | `personal_sign` a message, return the signature |
| `sign_typed_data` | Sign EIP-712 typed data, return the signature |

`EVM_MCP_DEFAULT_CHAIN` sets the chain id used when a call omits one (default: 1).

### Libraries

```ts
import { WalletSigner } from "browser-evm-signer";

const signer = new WalletSigner({ defaultChainId: 8453 });
const { address } = await signer.connectWallet();
const { txHash } = await signer.sendTransaction({ to: "0x…", value: "1000000000000000000" });
```

## What changed in the shims

- **Gone:** `PendingStore`, `pendingStore`, `createHttpServer`, `startTestServer`,
  `buildConnectUrl`, `buildSignUrl`, `openBrowser` — the in-process HTTP bridge they drove no
  longer exists.
- **`approvalUrl`** is now the bridge's base URL. The bridge opens the approval page itself and
  does not hand the per-request URL back.
- **`port`** (the constructor option) is ignored: the bridge binds its own free port.
  `getPort()` / `DEFAULT_PORT` still resolve, for source compatibility.
- **MCP:** the balance tools (`get_balance`, `get_token_balance`) and the TRON tools are gone
  from the MCP server. Balances never needed a wallet — any RPC-reading MCP server or `cast call`
  does them without an approval prompt — and TRON signing is a CLI away. `WalletSigner.getBalance`
  and `.getTokenBalance` are untouched in both libraries.
- **Deprecated on npm and JSR.** `browser-evm-signer@0.3.0` never worked at all: its `exports`
  pointed at `./esm/mod.js` while the tarball shipped `./esm/browser-evm-signer/src/mod.js`,
  which took `mcp-wallet-signer@0.6.0` down with it
  ([#2](https://github.com/nikicat/mcp-wallet-signer/issues/2)).

The pre-shim Deno implementation — the in-process bridge, the Svelte approval UI, the
`wallet-signer-core` package — is in the history, up to commit
[`636fd3b`](https://github.com/nikicat/mcp-wallet-signer/tree/636fd3b).

## Development

```bash
npm install
npm test     # builds, then runs each package's tests against a fake bridge
```

Releases are per package: tag `<package>@<version>` and publish a GitHub release.

## License

MIT
