<script lang="ts">
  import { hasWallet, connectWallet, signMessage, signTypedData, getAccounts, switchChain, getChainId } from "../lib/wallet";
  import { completeSuccess, completeError } from "../lib/api";
  import type { PendingRequest } from "../lib/api";
  import type { Address, Hex } from "viem";

  interface Props {
    request: PendingRequest;
  }

  let { request }: Props = $props();

  let status: "idle" | "connecting" | "signing" | "success" | "error" = $state("idle");
  let errorMessage: string = $state("");
  let signature: string = $state("");
  let connectedAddress: string = $state("");

  const walletAvailable = hasWallet();
  const isTypedData = request.type === "sign_typed_data";

  // Format typed data for display
  const typedDataDisplay = $derived(
    isTypedData && request.domain
      ? JSON.stringify(
          { domain: request.domain, primaryType: request.primaryType, message: request.message },
          null,
          2
        )
      : ""
  );

  async function ensureConnected(): Promise<Address> {
    const accounts = await getAccounts();
    if (accounts.length > 0) {
      connectedAddress = accounts[0];
      return accounts[0];
    }

    status = "connecting";
    const address = await connectWallet();
    connectedAddress = address;
    return address;
  }

  async function handleSign() {
    status = "connecting";
    errorMessage = "";

    try {
      const address = await ensureConnected();

      // Switch chain if needed
      if (request.chainId) {
        const currentChainId = await getChainId();
        if (currentChainId !== request.chainId) {
          await switchChain(request.chainId);
        }
      }

      status = "signing";

      let sig: Hex;

      if (isTypedData && request.domain && request.types && request.primaryType && request.message) {
        sig = await signTypedData({
          domain: {
            name: request.domain.name,
            version: request.domain.version,
            chainId: request.domain.chainId,
            verifyingContract: request.domain.verifyingContract as Address | undefined,
            salt: request.domain.salt as Hex | undefined,
          },
          types: request.types,
          primaryType: request.primaryType,
          message: request.message as Record<string, unknown>,
          address: (request.address || address) as Address,
          chainId: request.chainId || 1,
        });
      } else if (request.message) {
        sig = await signMessage({
          message: request.message,
          address: (request.address || address) as Address,
          chainId: request.chainId || 1,
        });
      } else {
        throw new Error("Invalid signing request");
      }

      signature = sig;

      // Report success to the server
      await completeSuccess(request.id, sig);
      status = "success";

      // Close window after brief delay
      setTimeout(() => window.close(), 2000);
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : "Signing failed";
      status = "error";

      // Report error to server
      await completeError(request.id, errorMessage).catch(() => {});
    }
  }

  function handleReject() {
    completeError(request.id, "User rejected signing").catch(() => {});
    window.close();
  }
</script>

<div class="container">
  <div class="card">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
      </svg>
    </div>

    <h1>{isTypedData ? "Sign Typed Data" : "Sign Message"}</h1>

    {#if status === "success"}
      <div class="success-box">
        <p>Signed Successfully!</p>
        <p class="signature">{signature}</p>
        <p class="small">This window will close automatically...</p>
      </div>
    {:else if status === "error"}
      <div class="error-box">
        <p>Signing Failed</p>
        <p class="small">{errorMessage}</p>
      </div>
    {:else}
      <div class="message-box">
        {#if isTypedData}
          <div class="label">Typed Data (EIP-712)</div>
          <pre class="typed-data">{typedDataDisplay}</pre>
        {:else}
          <div class="label">Message</div>
          <div class="message">{request.message}</div>
        {/if}
      </div>

      {#if request.chainId}
        <div class="chain-badge">
          Chain ID: {request.chainId}
        </div>
      {/if}
    {/if}

    {#if !walletAvailable}
      <div class="error-box">
        <p>No wallet detected</p>
        <p class="small">Please install a browser wallet to continue.</p>
      </div>
    {:else if status !== "success"}
      {#if connectedAddress}
        <div class="connected-badge">
          Connected: {connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}
        </div>
      {/if}

      <div class="buttons">
        <button class="btn-secondary" onclick={handleReject}>Reject</button>
        <button
          class="btn-primary"
          onclick={handleSign}
          disabled={status === "connecting" || status === "signing"}
        >
          {#if status === "connecting"}
            Connecting...
          {:else if status === "signing"}
            Confirm in Wallet...
          {:else}
            Sign
          {/if}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: 20px;
  }

  .card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 32px;
    max-width: 500px;
    width: 100%;
    text-align: center;
    backdrop-filter: blur(10px);
  }

  .icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 20px;
    color: #8b5cf6;
  }

  .icon svg {
    width: 100%;
    height: 100%;
  }

  h1 {
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 24px;
    color: #fff;
  }

  .message-box {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 24px;
    text-align: left;
  }

  .label {
    color: #9ca3af;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }

  .message {
    color: #e0e0e0;
    font-size: 14px;
    word-break: break-word;
    white-space: pre-wrap;
    max-height: 200px;
    overflow-y: auto;
  }

  .typed-data {
    color: #e0e0e0;
    font-size: 11px;
    font-family: monospace;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 300px;
    overflow-y: auto;
    margin: 0;
    padding: 8px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
  }

  .chain-badge {
    display: inline-block;
    background: rgba(139, 92, 246, 0.2);
    color: #c4b5fd;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 14px;
    margin-bottom: 20px;
  }

  .connected-badge {
    display: inline-block;
    background: rgba(34, 197, 94, 0.2);
    color: #4ade80;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-family: monospace;
    margin-bottom: 20px;
  }

  .buttons {
    display: flex;
    gap: 12px;
    justify-content: center;
  }

  .btn-primary,
  .btn-secondary {
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn-primary {
    background: linear-gradient(135deg, #8b5cf6, #6366f1);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: #e0e0e0;
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .success-box,
  .error-box {
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 20px;
  }

  .success-box {
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #4ade80;
  }

  .error-box {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
  }

  .signature {
    font-family: monospace;
    font-size: 10px;
    word-break: break-all;
    margin-top: 8px;
  }

  .small {
    font-size: 12px;
    opacity: 0.8;
    margin-top: 8px;
  }
</style>
