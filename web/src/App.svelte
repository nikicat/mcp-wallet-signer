<script lang="ts">
  import { onMount } from "svelte";
  import { fetchPendingRequest, type PendingRequest } from "./lib/api";
  import ConnectWallet from "./components/ConnectWallet.svelte";
  import TransactionSigner from "./components/TransactionSigner.svelte";
  import MessageSigner from "./components/MessageSigner.svelte";

  type PageState =
    | { type: "loading" }
    | { type: "error"; message: string }
    | { type: "not_found" }
    | { type: "request"; request: PendingRequest };

  let pageState: PageState = $state({ type: "loading" });

  // Parse request ID from URL path
  function getRequestId(): string | null {
    const path = window.location.pathname;
    // Match /connect/:id or /sign/:id
    const match = path.match(/^\/(connect|sign)\/([a-f0-9-]+)$/);
    return match ? match[2] : null;
  }

  onMount(async () => {
    const requestId = getRequestId();

    if (!requestId) {
      pageState = { type: "not_found" };
      return;
    }

    try {
      const request = await fetchPendingRequest(requestId);
      pageState = { type: "request", request };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load request";
      if (message.includes("not found") || message.includes("404")) {
        pageState = { type: "not_found" };
      } else {
        pageState = { type: "error", message };
      }
    }
  });
</script>

{#if pageState.type === "loading"}
  <div class="loading-container">
    <div class="spinner"></div>
    <p>Loading request...</p>
  </div>
{:else if pageState.type === "error"}
  <div class="error-container">
    <div class="error-icon">!</div>
    <h1>Error</h1>
    <p>{pageState.message}</p>
  </div>
{:else if pageState.type === "not_found"}
  <div class="error-container">
    <div class="error-icon">?</div>
    <h1>Request Not Found</h1>
    <p>This signing request has expired or doesn't exist.</p>
    <p class="hint">You can close this window.</p>
  </div>
{:else if pageState.type === "request"}
  {#if pageState.request.type === "connect"}
    <ConnectWallet request={pageState.request} />
  {:else if pageState.request.type === "send_transaction"}
    <TransactionSigner request={pageState.request} />
  {:else if pageState.request.type === "sign_message" || pageState.request.type === "sign_typed_data"}
    <MessageSigner request={pageState.request} />
  {:else}
    <div class="error-container">
      <div class="error-icon">?</div>
      <h1>Unknown Request Type</h1>
      <p>This request type is not supported.</p>
    </div>
  {/if}
{/if}

<style>
  .loading-container,
  .error-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: 20px;
    text-align: center;
  }

  .loading-container p {
    color: #9ca3af;
    margin-top: 16px;
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 3px solid rgba(99, 102, 241, 0.2);
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-icon {
    width: 64px;
    height: 64px;
    background: rgba(239, 68, 68, 0.2);
    border: 2px solid rgba(239, 68, 68, 0.5);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    font-weight: bold;
    color: #f87171;
    margin-bottom: 24px;
  }

  .error-container h1 {
    font-size: 24px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 12px;
  }

  .error-container p {
    color: #9ca3af;
    max-width: 400px;
  }

  .hint {
    margin-top: 24px;
    font-size: 14px;
    color: #6b7280 !important;
  }
</style>
