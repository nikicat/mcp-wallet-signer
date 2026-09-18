# mcp-wallet-signer

MCP stdio server that routes signing to **your own browser wallet** — the private key never
leaves the browser, and every request waits for your approval in the wallet.

> [!NOTE]
> Since 0.7.0 this is a thin shim over
> [`browser-web3-signer`](https://github.com/nikicat/browser-web3-signer), which owns the
> localhost bridge, the approval page and the browser tab. New setups may prefer its CLI —
> an agent can just run `browser-web3-signer evm send …` — but MCP clients already pointed at
> `npx mcp-wallet-signer` keep working.

```bash
claude mcp add wallet-signer -- npx -y mcp-wallet-signer
```

```json
{
  "mcpServers": {
    "wallet-signer": { "command": "npx", "args": ["-y", "mcp-wallet-signer"] }
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

The balance tools and the TRON tools were dropped in 0.7.0 — balances never needed a wallet, and
TRON signing is one `browser-web3-signer tron` command away. See the
[repo README](https://github.com/nikicat/mcp-wallet-signer) for the full list of changes.

MIT
