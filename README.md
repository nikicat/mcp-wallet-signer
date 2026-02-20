# MCP Wallet Signer

[![npm version](https://img.shields.io/npm/v/mcp-wallet-signer)](https://www.npmjs.com/package/mcp-wallet-signer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Badge](https://lobehub.com/badge/mcp/user-mcp-wallet-signer)](https://lobehub.com/mcp/user-mcp-wallet-signer)

**Your private keys never leave your browser.** Every transaction requires explicit user approval in your wallet.

Most blockchain MCPs require you to paste a private key into a config file — giving the AI agent full, unsupervised access to your funds. MCP Wallet Signer takes a different approach: it routes every transaction to your actual browser wallet (MetaMask, Rabby, etc.) via [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963), so you review and approve each action just like any other dapp interaction. No keys in config files, no risk of silent transactions.

### Compatible With

<a href="https://claude.ai/download"><img src="https://img.shields.io/badge/Claude_Desktop-available-blue" alt="Claude Desktop"></a>
<a href="https://docs.anthropic.com/en/docs/claude-code"><img src="https://img.shields.io/badge/Claude_Code-available-blue" alt="Claude Code"></a>
<a href="https://cursor.com"><img src="https://img.shields.io/badge/Cursor-available-blue" alt="Cursor"></a>
<a href="https://windsurf.com"><img src="https://img.shields.io/badge/Windsurf-available-blue" alt="Windsurf"></a>

Works with any MCP-compatible client via stdio transport.

## Installation

### Claude Code CLI

```bash
claude mcp add evm-wallet -- npx mcp-wallet-signer
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "evm-wallet": {
      "command": "npx",
      "args": ["mcp-wallet-signer"]
    }
  }
}
```

### Run directly

```bash
npx mcp-wallet-signer
pnpx mcp-wallet-signer
bunx mcp-wallet-signer
```

## MCP Tools

| Tool | Description | Browser Required |
|------|-------------|------------------|
| `connect_wallet` | Connect wallet, return address | Yes |
| `send_transaction` | Send ETH/tokens, call contracts | Yes |
| `sign_message` | Sign arbitrary message (personal_sign) | Yes |
| `sign_typed_data` | Sign EIP-712 typed data | Yes |
| `get_balance` | Read ETH balance (via RPC) | No |

## How It Works

1. Agent calls an MCP tool (e.g., `send_transaction`)
2. Server opens browser to a local signing page
3. User connects wallet and approves the action
4. Result (address, tx hash, signature) returned to agent

## Supported Chains

Built-in RPC URLs for:
- Ethereum (1)
- Sepolia (11155111)
- Polygon (137)
- Arbitrum One (42161)
- Optimism (10)
- Base (8453)
- Avalanche (43114)
- BNB Smart Chain (56)

## Configuration

Environment variables (optional):

| Variable | Description | Default |
|----------|-------------|---------|
| `EVM_MCP_PORT` | HTTP server port | 3847 |
| `EVM_MCP_DEFAULT_CHAIN` | Default chain ID | 1 |

## Development

Requires [Deno](https://deno.land/) v2.0+.

```bash
# Install dependencies
deno install
cd web && deno install && cd ..

# Run MCP server in dev mode
deno task dev

# Run web UI dev server (separate terminal)
deno task dev:web

# Run tests
deno task test

# Build web UI
deno task build:web

# Build for npm
deno task build:npm

# Format code
deno task fmt

# Lint code
deno task lint
```

## Project Structure

```
├── src/
│   ├── index.ts          # Entry point
│   ├── mcp-server.ts     # MCP tool definitions
│   ├── http-server.ts    # Lazy-started HTTP server
│   ├── pending-store.ts  # Promise-based request tracking
│   ├── browser.ts        # Browser launcher
│   ├── config.ts         # Chain/RPC configuration
│   └── types.ts          # Type definitions
├── web/                  # Svelte UI
│   ├── src/
│   │   ├── App.svelte
│   │   ├── lib/
│   │   │   ├── api.ts    # API client
│   │   │   └── wallet.ts # viem wallet interactions
│   │   └── components/
│   │       ├── ConnectWallet.svelte
│   │       ├── TransactionSigner.svelte
│   │       └── MessageSigner.svelte
│   └── ...
└── tests/
    ├── pending-store.test.ts
    └── e2e/
```

## License

MIT
