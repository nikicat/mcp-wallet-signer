# browser-tron-signer

[![npm version](https://img.shields.io/npm/v/browser-tron-signer)](https://www.npmjs.com/package/browser-tron-signer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Sign TRON transactions from Node.js using TronLink.** No private keys in your code — ever.

Most TRON libraries require you to paste a private key or mnemonic into your app. `browser-tron-signer` takes a different approach: it opens TronLink in your browser for every signing action. You review and approve each transaction just like any dapp interaction.

Sister package to [`browser-evm-signer`](https://www.npmjs.com/package/browser-evm-signer). Both share an internal `wallet-signer-core` substrate that's bundled into each package at build time (not a runtime dep).

## Why?

- **No private keys in code** — keys stay in TronLink, never touch your server
- **User approves every action** — connect, send, sign all require explicit TronLink approval
- **Native TRX + TRC-20** — `sendTransaction` for TRX transfers, `triggerContract` for any smart-contract call
- **TIP-712 typed data** — signs structured data via `tronWeb.trx._signTypedData`
- **3 networks built-in** — Mainnet, Shasta, Nile

## Install

```bash
npm install browser-tron-signer
```

No separate install needed for the shared substrate — `wallet-signer-core` is bundled into this package at build time.

## Quick Start

```ts
import { WalletSigner } from "browser-tron-signer";

const signer = new WalletSigner();

// Opens your browser — connect TronLink
const { address } = await signer.connectWallet();
console.log("Connected:", address);     // T-prefixed Base58

// Native TRX transfer (1 TRX = 1,000,000 SUN)
const { txHash } = await signer.sendTransaction({
  to: "TPL66VK2gCXNCD7EJg9pgJRfqcRazjhUZY",
  amount: "1000000", // 1 TRX, in SUN, as a string
});
console.log("Sent:", txHash);

// TRC-20 token transfer via triggerSmartContract
const usdt = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const { txHash: trc20Hash } = await signer.triggerContract({
  contractAddress: usdt,
  functionSelector: "transfer(address,uint256)",
  parameters: [
    { type: "address", value: "TPL66VK2gCXNCD7EJg9pgJRfqcRazjhUZY" },
    { type: "uint256", value: "1000000" }, // USDT uses 6 decimals
  ],
  feeLimit: "150000000", // 150 TRX max energy fee
});
console.log("TRC-20 sent:", trc20Hash);

// Sign a message via signMessageV2
const { signature } = await signer.signMessage({ message: "Hello, TRON" });
console.log("Signed:", signature);

await signer.shutdown();
```

Every wallet-touching method opens a browser window with an approval page. Nothing happens without your explicit consent in TronLink.

## How It Works

```
Your Node.js app                    Browser
────────────────                    ───────
signer.sendTransaction(...)
  │
  ├─► Starts local HTTP server
  ├─► Opens browser to approval page ──►  Approval UI loads
  │                                        │
  │                                        Discovers TronLink via window.tronWeb
  │                                        │
  │   Waits for user action...             User reviews & approves in TronLink
  │                                        │
  │                                        Browser signs + broadcasts via TronWeb
  │                                        │
  ◄─── Result returned ◄──────────────────┘
  │
  └─► { txHash: "..." }
```

Native TRX transfers use `tronWeb.transactionBuilder.sendTrx`; contract calls use `tronWeb.transactionBuilder.triggerSmartContract`. Both are signed via `tronWeb.trx.sign` and broadcast via `tronWeb.trx.sendRawTransaction` — fully client-side. The Node-side `getBalance` reads directly from TronGrid (no browser, no TronWeb dep on the server).

## API Reference

### `WalletSigner`

```ts
const signer = new WalletSigner({
  port: 3848,                   // HTTP server port (env: TRON_MCP_PORT)
  defaultNetwork: "mainnet",    // env: TRON_MCP_DEFAULT_NETWORK
  openBrowser: true,            // true | false | (url) => void | Promise<void>
});
```

| Method | Description | Opens Browser |
|--------|-------------|:---:|
| `connectWallet(options?)` | Connect TronLink, get Base58 address | Yes |
| `sendTransaction(params)` | Native TRX transfer | Yes |
| `triggerContract(params)` | Call a smart-contract function (TRC-20, etc.) | Yes |
| `signMessage(params)` | Sign a message via `signMessageV2` | Yes |
| `signTypedData(params)` | Sign TIP-712 typed data | Yes |
| `getBalance(params)` | Read TRX balance via TronGrid | No |
| `start()` | Start HTTP server explicitly | No |
| `shutdown()` | Stop server, cancel pending requests | No |

### Parameters

- `connectWallet(options?: { network?, address? })` — `address` (T-prefixed) requires the user to connect that exact account; UI rejects mismatches.
- `sendTransaction({ to, amount, from?, data?, network? })` — `amount` is SUN as a string (BigInt-safe).
- `triggerContract({ contractAddress, functionSelector, parameters?, from?, feeLimit?, callValue?, network? })` — `parameters` is the TronWeb-shaped `Array<{type, value}>`. `feeLimit` defaults to 150 TRX in the approval UI if omitted.
- `signMessage({ message, address?, network? })` — equivalent of EVM `personal_sign`.
- `signTypedData({ domain, types, primaryType, message, address?, network? })` — TIP-712, structurally identical to EIP-712 but uses TRON addresses.

## Networks

| Network | Full Node | Explorer |
|---------|-----------|----------|
| Tron Mainnet | https://api.trongrid.io | https://tronscan.org |
| Shasta Testnet | https://api.shasta.trongrid.io | https://shasta.tronscan.org |
| Nile Testnet | https://nile.trongrid.io | https://nile.tronscan.org |

Pass `network: "shasta"` (etc.) to any method to override the default.

## Configuration

Environment variables (optional):

| Variable                   | Description                                          | Default   |
| -------------------------- | ---------------------------------------------------- | --------- |
| `TRON_MCP_PORT`            | HTTP server port for the browser approval UI         | 3848      |
| `TRON_MCP_DEFAULT_NETWORK` | Default network (mainnet / shasta / nile)            | mainnet   |

## Error Handling

`WalletSigner` rejects with a `WrongWalletAddressError` (from `wallet-signer-core`) when the user connects an account that doesn't match the `from` / `address` you required. Use `findWrongWalletAddressError(err)` to walk through wrapped causes:

```ts
import { findWrongWalletAddressError, WrongWalletAddressError } from "browser-tron-signer";

try {
  await signer.sendTransaction({ from: "T...required", to: "T...", amount: "1000000" });
} catch (err) {
  if (findWrongWalletAddressError(err)) {
    // User connected the wrong TronLink account — clear cached address, prompt again
  }
  throw err;
}
```

## License

MIT
