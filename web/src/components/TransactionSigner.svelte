<script lang="ts">
  import { hasWallet, connectWallet, sendTransaction, getAccounts, switchChain, getChainId } from "../lib/wallet";
  import { completeSuccess, completeError } from "../lib/api";
  import type { PendingRequest } from "../lib/api";
  import { formatEther, type Address, type Hex } from "viem";

  interface Props {
    request: PendingRequest;
  }

  let { request }: Props = $props();

  let status: "idle" | "connecting" | "signing" | "success" | "error" = $state("idle");
  let errorMessage: string = $state("");
  let txHash: string = $state("");
  let connectedAddress: string = $state("");

  const walletAvailable = hasWallet();

  // Format value for display
  const displayValue = $derived(
    request.value ? formatEther(BigInt(request.value)) : "0"
  );

  // Format data for display
  const displayData = $derived(
    request.data
      ? request.data.length > 66
        ? `${request.data.slice(0, 66)}...`
        : request.data
      : "None"
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
      await ensureConnected();

      // Switch chain if needed
      if (request.chainId) {
        const currentChainId = await getChainId();
        if (currentChainId !== request.chainId) {
          await switchChain(request.chainId);
        }
      }

      status = "signing";

      const hash = await sendTransaction({
        to: request.to as Address,
        value: request.value ? BigInt(request.value) : undefined,
        data: request.data as Hex | undefined,
        chainId: request.chainId || 1,
        gasLimit: request.gasLimit ? BigInt(request.gasLimit) : undefined,
        maxFeePerGas: request.maxFeePerGas ? BigInt(request.maxFeePerGas) : undefined,
        maxPriorityFeePerGas: request.maxPriorityFeePerGas ? BigInt(request.maxPriorityFeePerGas) : undefined,
      });

      txHash = hash;

      // Report success to the server
      await completeSuccess(request.id, hash);
      status = "success";

      // Close window after brief delay
      setTimeout(() => window.close(), 2000);
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : "Transaction failed";
      status = "error";

      // Report error to server
      await completeError(request.id, errorMessage).catch(() => {});
    }
  }

  function handleReject() {
    completeError(request.id, "User rejected transaction").catch(() => {});
    window.close();
  }
</script>

<div class="container">
  <div class="card">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
      </svg>
    </div>

    <h1>Send Transaction</h1>

    {#if status === "success"}
      <div class="success-box">
        <p>Transaction Sent!</p>
        <p class="hash">{txHash}</p>
        <p class="small">This window will close automatically...</p>
      </div>
    {:else if status === "error"}
      <div class="error-box">
        <p>Transaction Failed</p>
        <p class="small">{errorMessage}</p>
      </div>
    {:else}
      <div class="tx-details">
        <div class="detail-row">
          <span class="label">To</span>
          <span class="value address">{request.to}</span>
        </div>

        <div class="detail-row">
          <span class="label">Value</span>
          <span class="value">{displayValue} ETH</span>
        </div>

        {#if request.data && request.data !== "0x"}
          <div class="detail-row">
            <span class="label">Data</span>
            <span class="value mono">{displayData}</span>
          </div>
        {/if}

        {#if request.chainId}
          <div class="detail-row">
            <span class="label">Chain ID</span>
            <span class="value">{request.chainId}</span>
          </div>
        {/if}

        {#if request.gasLimit}
          <div class="detail-row">
            <span class="label">Gas Limit</span>
            <span class="value">{request.gasLimit}</span>
          </div>
        {/if}
      </div>
    {/if}

    {#if !walletAvailable}
      <div class="error-box">
        <p>No wallet detected</p>
        <p class="small">Please install MetaMask or another browser wallet.</p>
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
            Sign & Send
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
    max-width: 450px;
    width: 100%;
    text-align: center;
    backdrop-filter: blur(10px);
  }

  .icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 20px;
    color: #f59e0b;
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

  .tx-details {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 24px;
    text-align: left;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .detail-row:last-child {
    border-bottom: none;
  }

  .label {
    color: #9ca3af;
    font-size: 14px;
    flex-shrink: 0;
  }

  .value {
    color: #e0e0e0;
    font-size: 14px;
    text-align: right;
    word-break: break-all;
    margin-left: 16px;
  }

  .value.address {
    font-family: monospace;
    font-size: 12px;
  }

  .value.mono {
    font-family: monospace;
    font-size: 11px;
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
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
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

  .hash {
    font-family: monospace;
    font-size: 11px;
    word-break: break-all;
    margin-top: 8px;
  }

  .small {
    font-size: 12px;
    opacity: 0.8;
    margin-top: 8px;
  }
</style>
