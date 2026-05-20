# wallet-signer-core

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Internal monorepo package — not published to npm or JSR.** Bundled into
[`browser-evm-signer`](https://www.npmjs.com/package/browser-evm-signer) and
[`browser-tron-signer`](https://www.npmjs.com/package/browser-tron-signer) at build time (via dnt's `mappings`-less inlining), so consumers of those packages get the substrate without an extra install.

If a third chain package were ever built outside this monorepo and needed to depend on this substrate, the build script + npm metadata are kept ready in `deno.jsonc` / `scripts/build-npm.ts` so it could be promoted to a real registry publication. Today, nobody installs it.

## What's in it

| Module | Exports |
|--------|---------|
| `PendingStore<R extends BaseRequest>` | UUID-keyed promise store. `create(request) → {id, promise}`, `get`, `complete`, `cancel`, `has`, `getPendingIds`, `size`. Chain packages subclass it to add typed factory helpers. |
| `createHttpServer({store, port, getIndexHtml, extraApi?})` | Local Node `http` server. Serves `/api/pending/:id`, `/api/complete/:id`, `/api/health` against any `PendingStore`. SPA-routes everything else to `getIndexHtml()`. `extraApi` is a pluggable hook for chain-specific routes (e.g. `/api/test/*`). |
| `openBrowser(url)` | Cross-platform browser launcher built on `open` (lazy-imported). |
| `buildConnectUrl(port, id)` / `buildSignUrl(port, id)` | URL builders matching the in-page router. |
| `WrongWalletAddressError` / `SignerErrorCode` / `findWrongWalletAddressError` | Discriminating error types so consumers can react programmatically without string-matching. |
| `getPortFromEnv(envName, defaultPort)` | Read an integer port from `process.env`, falling back to a default. Used by chain packages to honour `EVM_MCP_PORT` / `TRON_MCP_PORT`. |
| Types | `BaseRequest`, `RequestResult`, `SuccessResult`, `ErrorResult`, `PendingEntry`, `CompleteApiRequest`, `PendingApiResponse` |

## Why a separate package

The EVM and TRON signers diverged on every wallet-touching surface — address format, RPC API, message signing, transaction shape — but shared everything else: the pending-request map, the HTTP bridge, the browser opener, the error types. Pulling those shared pieces into `wallet-signer-core` lets each chain package own only what's actually chain-specific (`types.ts`, the approval HTML, the `WalletSigner` facade) without copy-pasted plumbing.

If you're writing a third signer (for a new chain), depending on this package directly means you get a tested HTTP bridge and request store for free.

## Quick sketch

```ts
import { PendingStore, createHttpServer, openBrowser, buildConnectUrl } from "wallet-signer-core";

// 1. Define your chain's request type
interface MyConnectRequest {
  id: string;
  type: "connect";
  createdAt: number;
  // … chain-specific fields
}
type MyRequest = MyConnectRequest /* | ... */;

// 2. Subclass the store with typed factory helpers
class MyPendingStore extends PendingStore<MyRequest> {
  createConnectRequest(): { id: string; promise: Promise<...> } {
    return this.create({ id: crypto.randomUUID(), type: "connect", createdAt: Date.now() });
  }
}

// 3. Spin up the HTTP server
const store = new MyPendingStore();
const { port, stop } = await createHttpServer({
  store,
  getIndexHtml: () => /* your chain's approval HTML */,
});

// 4. Use the URL builders + browser opener
const { id, promise } = store.createConnectRequest();
await openBrowser(buildConnectUrl(port, id));
const result = await promise;
```

See `browser-evm-signer` and `browser-tron-signer` for the full pattern.

## License

MIT
