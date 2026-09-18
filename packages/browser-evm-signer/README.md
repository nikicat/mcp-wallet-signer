# browser-evm-signer

> [!WARNING]
> **Deprecated.** Since 0.3.1 this package is a compatibility shim over
> [`browser-web3-signer`](https://github.com/nikicat/browser-web3-signer), which superseded it.
> The API below still works; new code should use `browser-web3-signer` directly.

Sign EVM transactions and messages with **your own browser wallet** (MetaMask, Rabby, …) from
Node. The private key never leaves the browser; each request waits for your approval.

```ts
import { WalletSigner } from "browser-evm-signer";

const signer = new WalletSigner({ defaultChainId: 8453 });
const { address } = await signer.connectWallet();
const { txHash } = await signer.sendTransaction({ to: "0x…", value: "1000000000000000000" });
const { balance } = await signer.getBalance({ address });
await signer.shutdown();
```

viem users get the same transport and account as before:

```ts
import { connectWalletViem } from "browser-evm-signer";
const { account, transport } = await connectWalletViem(signer);
```

## Changed in 0.3.1

- `PendingStore`, `pendingStore`, `createHttpServer`, `startTestServer`, `buildConnectUrl`,
  `buildSignUrl` and `openBrowser` are gone — the in-process HTTP bridge they drove no longer
  exists.
- `approvalUrl` is now the bridge's base URL; the bridge opens the approval page itself.
- The `port` option is ignored (the bridge binds its own free port). `getPort()` and
  `DEFAULT_PORT` still resolve.
- 0.3.0 was broken on install: its `exports` pointed at a file the tarball didn't ship.

MIT
