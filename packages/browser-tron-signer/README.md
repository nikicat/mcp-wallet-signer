# browser-tron-signer

> [!WARNING]
> **Deprecated.** Since 0.3.1 this package is a compatibility shim over
> [`browser-web3-signer`](https://github.com/nikicat/browser-web3-signer), which superseded it.
> The API below still works; new code should use `browser-web3-signer` directly.

Sign TRON transactions and messages with **your own browser wallet** (TronLink) from Node. The
private key never leaves the browser; each request waits for your approval.

```ts
import { WalletSigner } from "browser-tron-signer";

const signer = new WalletSigner({ defaultNetwork: "mainnet" });
const { address } = await signer.connectWallet();
const { txHash } = await signer.sendTransaction({ to: "T…", amount: "1000000" }); // 1 TRX
const { balance } = await signer.getBalance({ address });
await signer.shutdown();
```

`triggerContract` (TRC-20 transfers and any other contract call) and `deployContract` work as
before.

## Changed in 0.3.1

- `PendingStore`, `pendingStore`, `createHttpServer`, `startTestServer`, `buildConnectUrl`,
  `buildSignUrl` and `openBrowser` are gone — the in-process HTTP bridge they drove no longer
  exists.
- `approvalUrl` is now the bridge's base URL; the bridge opens the approval page itself.
- The `port` option is ignored (the bridge binds its own free port). `getPort()` and
  `DEFAULT_PORT` still resolve.

MIT
