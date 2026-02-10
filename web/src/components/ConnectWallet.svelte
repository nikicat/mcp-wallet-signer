<script lang="ts">
  import { hasWallet, getWalletName, getWalletIcon, connectWallet, getChainId, switchChain } from "../lib/wallet";
  import { completeSuccess, completeError } from "../lib/api";
  import type { PendingRequest } from "../lib/api";

  interface Props {
    request: PendingRequest;
  }

  let { request }: Props = $props();

  let status: "idle" | "connecting" | "switching" | "success" | "error" = $state("idle");
  let errorMessage: string = $state("");
  let connectedAddress: string = $state("");

  const walletAvailable = hasWallet();
  const walletName = walletAvailable ? getWalletName() : "";
  const walletIcon = walletAvailable ? getWalletIcon() : null;

  async function handleConnect() {
    status = "connecting";
    errorMessage = "";

    try {
      const address = await connectWallet();
      connectedAddress = address;

      // Check if we need to switch chains
      if (request.chainId) {
        const currentChainId = await getChainId();
        if (currentChainId !== request.chainId) {
          status = "switching";
          await switchChain(request.chainId);
        }
      }

      // Report success to the server
      await completeSuccess(request.id, address);
      status = "success";

      // Close window after brief delay
      setTimeout(() => window.close(), 1500);
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : "Connection failed";
      status = "error";

      // Report error to server
      await completeError(request.id, errorMessage).catch(() => {});
    }
  }

  function handleCancel() {
    completeError(request.id, "User cancelled").catch(() => {});
    window.close();
  }
</script>

<div class="container">
  <div class="card">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 18v1c0 1.1-.9 2-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14c1.1 0 2 .9 2 2v1h-9a2 2 0 00-2 2v8a2 2 0 002 2h9zm-9-2h10V8H12v8zm4-2.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z"/>
      </svg>
    </div>

    <h1>Connect Wallet</h1>
    <p class="description">
      An application is requesting to connect to your wallet.
    </p>

    {#if request.chainId}
      <div class="chain-badge">
        Chain ID: {request.chainId}
      </div>
    {/if}

    {#if !walletAvailable}
      <div class="error-box">
        <p>No wallet detected</p>
        <p class="small">Please install a browser wallet to continue.</p>
      </div>
    {:else if status === "success"}
      <div class="success-box">
        <p>Connected!</p>
        <p class="address">{connectedAddress}</p>
        <p class="small">This window will close automatically...</p>
      </div>
    {:else if status === "error"}
      <div class="error-box">
        <p>Connection Failed</p>
        <p class="small">{errorMessage}</p>
      </div>
      <div class="buttons">
        <button class="btn-secondary" onclick={handleCancel}>Cancel</button>
        <button class="btn-primary" onclick={handleConnect}>Try Again</button>
      </div>
    {:else}
      <div class="wallet-info">
        {#if walletIcon}
          <img class="wallet-icon" src={walletIcon} alt={walletName} />
        {/if}
        <span class="wallet-name">{walletName}</span> detected
      </div>

      <div class="buttons">
        <button class="btn-secondary" onclick={handleCancel}>Cancel</button>
        <button
          class="btn-primary"
          onclick={handleConnect}
          disabled={status === "connecting" || status === "switching"}
        >
          {#if status === "connecting"}
            Connecting...
          {:else if status === "switching"}
            Switching Chain...
          {:else}
            Connect
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
    max-width: 400px;
    width: 100%;
    text-align: center;
    backdrop-filter: blur(10px);
  }

  .icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 20px;
    color: #6366f1;
  }

  .icon svg {
    width: 100%;
    height: 100%;
  }

  h1 {
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 12px;
    color: #fff;
  }

  .description {
    color: #9ca3af;
    margin-bottom: 24px;
  }

  .chain-badge {
    display: inline-block;
    background: rgba(99, 102, 241, 0.2);
    color: #a5b4fc;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 14px;
    margin-bottom: 24px;
  }

  .wallet-info {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #9ca3af;
    margin-bottom: 24px;
  }

  .wallet-icon {
    width: 24px;
    height: 24px;
    border-radius: 4px;
  }

  .wallet-name {
    color: #6366f1;
    font-weight: 500;
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
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
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

  .address {
    font-family: monospace;
    font-size: 12px;
    word-break: break-all;
    margin-top: 8px;
  }

  .small {
    font-size: 12px;
    opacity: 0.8;
    margin-top: 8px;
  }
</style>
