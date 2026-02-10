# MCP Wallet Signer

MCP server that routes blockchain transactions to browser wallets for signing. Install with just `claude mcp add` - no separate servers to run.

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
