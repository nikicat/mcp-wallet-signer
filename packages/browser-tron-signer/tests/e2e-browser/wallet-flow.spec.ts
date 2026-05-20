/**
 * Playwright e2e tests for TRON wallet signing flows.
 *
 * Injects a mock TronLink provider (window.tronLink + window.tronWeb) via addInitScript,
 * navigates to connect/sign pages, clicks buttons, and verifies the API result.
 */

import { type BrowserContext, expect, test } from "@playwright/test";
import { createTestRequest, getBaseUrl, getTestResult, startServer, stopServer } from "./fixtures/test-server.mts";
import { FAKE_TX_ID, getMockProviderScript, TEST_ADDRESS, TEST_NETWORK } from "./fixtures/mock-wallet.mts";

test.beforeAll(async () => {
  await startServer();
});

test.afterAll(async () => {
  await stopServer();
});

async function walletContext(
  browser: import("@playwright/test").Browser,
  options?: Parameters<typeof getMockProviderScript>[0],
): Promise<BrowserContext> {
  const ctx = await browser.newContext();
  await ctx.addInitScript(getMockProviderScript(options));
  return ctx;
}

/**
 * Simulate real popup close: window.close() aborts all in-flight fetch requests.
 * Without `await completeError(...)`, the POST is killed before it reaches the server.
 *
 * Uses route interception to add latency so the abort always wins the race
 * (on localhost the round-trip is <1ms, which makes the race non-deterministic).
 */
async function patchWindowClose(page: import("@playwright/test").Page) {
  await page.route("**/api/complete/**", async (route) => {
    await new Promise((r) => setTimeout(r, 100));
    try {
      await route.continue();
    } catch {
      /* request was aborted by the browser */
    }
  });
  await page.evaluate(() => {
    const controller = new AbortController();
    const origFetch = window.fetch;
    window.fetch = (input, init?) => origFetch(input, { ...init, signal: controller.signal });
    window.close = () => controller.abort();
  });
}

// --- Wallet Connection ---

test.describe("Wallet Connection", () => {
  test("connects successfully with mock TronLink", async ({ browser }) => {
    const ctx = await walletContext(browser);
    const page = await ctx.newPage();

    const { id } = await createTestRequest("connect", { network: TEST_NETWORK });
    await page.goto(`${getBaseUrl()}/connect/${id}`);

    await expect(page.getByRole("heading", { name: "Connect Tron Wallet" })).toBeVisible();
    await expect(page.locator("#connect-idle")).toBeVisible();

    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByText("Connected!")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#connect-success-addr")).toContainText(TEST_ADDRESS);

    const result = await getTestResult(id);
    expect(result?.success).toBe(true);
    expect(result?.result).toBe(TEST_ADDRESS);

    await ctx.close();
  });

  test("shows not-found for expired request", async ({ browser }) => {
    const ctx = await walletContext(browser);
    const page = await ctx.newPage();

    await page.goto(`${getBaseUrl()}/connect/00000000-0000-0000-0000-000000000000`);
    await expect(page.getByText("Request Not Found")).toBeVisible();

    await ctx.close();
  });

  test("shows error when no TronLink is detected", async ({ browser }) => {
    const ctx = await browser.newContext(); // no mock wallet
    const page = await ctx.newPage();

    const { id } = await createTestRequest("connect", { network: TEST_NETWORK });
    await page.goto(`${getBaseUrl()}/connect/${id}`);

    await expect(page.getByRole("heading", { name: "Connect Tron Wallet" })).toBeVisible();
    await expect(page.locator("#connect-no-wallet")).toBeVisible();

    await ctx.close();
  });

  test("connects with matching required address", async ({ browser }) => {
    const ctx = await walletContext(browser);
    const page = await ctx.newPage();

    const { id } = await createTestRequest("connect", {
      network: TEST_NETWORK,
      address: TEST_ADDRESS,
    });
    await page.goto(`${getBaseUrl()}/connect/${id}`);

    await expect(page.locator("#connect-required")).toBeVisible();
    await expect(page.locator("#connect-required-text")).toContainText(TEST_ADDRESS);

    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByText("Connected!")).toBeVisible({ timeout: 10000 });

    const result = await getTestResult(id);
    expect(result?.success).toBe(true);
    expect(result?.result).toBe(TEST_ADDRESS);

    await ctx.close();
  });

  test("shows wrong address when required address does not match", async ({ browser }) => {
    const ctx = await walletContext(browser);
    const page = await ctx.newPage();

    const wrongAddress = "TWrongWrongWrongWrongWrongWrongWro";
    const { id } = await createTestRequest("connect", {
      network: TEST_NETWORK,
      address: wrongAddress,
    });
    await page.goto(`${getBaseUrl()}/connect/${id}`);

    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.locator("#connect-wrong")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#connect-wrong-expected")).toHaveText(wrongAddress);
    await expect(page.locator("#connect-wrong-got")).toContainText(TEST_ADDRESS);

    // The request is left pending — user is invited to switch accounts or click Cancel.
    const result = await getTestResult(id);
    expect(result?.pending).toBe(true);

    await ctx.close();
  });

  test("cancels wallet connection", async ({ browser }) => {
    const ctx = await walletContext(browser);
    const page = await ctx.newPage();

    const { id } = await createTestRequest("connect", { network: TEST_NETWORK });
    await page.goto(`${getBaseUrl()}/connect/${id}`);

    await expect(page.getByRole("heading", { name: "Connect Tron Wallet" })).toBeVisible();
    await patchWindowClose(page);

    await page.getByRole("button", { name: "Cancel" }).click();
    await page.waitForTimeout(200);

    const result = await getTestResult(id);
    expect(result?.success).toBe(false);
    expect(result?.error).toContain("cancelled");

    await ctx.close();
  });

  test("surfaces user-rejection from TronLink", async ({ browser }) => {
    const ctx = await walletContext(browser, { rejectConnect: true });
    const page = await ctx.newPage();

    const { id } = await createTestRequest("connect", { network: TEST_NETWORK });
    await page.goto(`${getBaseUrl()}/connect/${id}`);

    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.locator("#connect-err")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#connect-err-msg")).toContainText("rejected");

    const result = await getTestResult(id);
    expect(result?.success).toBe(false);
    expect(result?.error).toContain("rejected");

    await ctx.close();
  });
});

// --- Native TRX Transfer ---

test.describe("Send TRX", () => {
  test("signs and broadcasts a TRX transfer", async ({ browser }) => {
    const ctx = await walletContext(browser);
    const page = await ctx.newPage();

    const { id } = await createTestRequest("send_transaction", {
      to: "TPL66VK2gCXNCD7EJg9pgJRfqcRazjhUZY",
      amount: "1000000", // 1 TRX
      network: TEST_NETWORK,
    });

    await page.goto(`${getBaseUrl()}/sign/${id}`);
    await expect(page.getByRole("heading", { name: "Send TRX" })).toBeVisible();
    await expect(page.getByText("TPL66VK2gCXNCD7EJg9pgJRfqcRazjhUZY", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Sign & Send" }).click();
    await expect(page.getByText("Transaction Sent!")).toBeVisible({ timeout: 10000 });

    const result = await getTestResult(id);
    expect(result?.success).toBe(true);
    expect(result?.result).toBe(FAKE_TX_ID);

    await ctx.close();
  });

  test("rejects TRX transfer when user closes popup", async ({ browser }) => {
    const ctx = await walletContext(browser);
    const page = await ctx.newPage();

    const { id } = await createTestRequest("send_transaction", {
      to: "TPL66VK2gCXNCD7EJg9pgJRfqcRazjhUZY",
      amount: "1000000",
      network: TEST_NETWORK,
    });

    await page.goto(`${getBaseUrl()}/sign/${id}`);
    await expect(page.getByRole("heading", { name: "Send TRX" })).toBeVisible();
    await patchWindowClose(page);

    await page.getByRole("button", { name: "Reject" }).click();
    await page.waitForTimeout(200);

    const result = await getTestResult(id);
    expect(result?.success).toBe(false);
    expect(result?.error).toContain("rejected");

    await ctx.close();
  });

  test("surfaces TronLink sign rejection as transaction error", async ({ browser }) => {
    const ctx = await walletContext(browser, { rejectSign: true });
    const page = await ctx.newPage();

    const { id } = await createTestRequest("send_transaction", {
      to: "TPL66VK2gCXNCD7EJg9pgJRfqcRazjhUZY",
      amount: "1000000",
      network: TEST_NETWORK,
    });

    await page.goto(`${getBaseUrl()}/sign/${id}`);
    await page.getByRole("button", { name: "Sign & Send" }).click();
    await expect(page.locator("#tx-err")).toBeVisible({ timeout: 10000 });

    const result = await getTestResult(id);
    expect(result?.success).toBe(false);
    expect(result?.error).toContain("rejected");

    await ctx.close();
  });
});

// --- Smart Contract Calls ---

test.describe("Trigger Contract", () => {
  test("calls a contract function via TronLink", async ({ browser }) => {
    const ctx = await walletContext(browser);
    const page = await ctx.newPage();

    const { id } = await createTestRequest("trigger_contract", {
      contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      functionSelector: "transfer(address,uint256)",
      parameters: [
        { type: "address", value: "TPL66VK2gCXNCD7EJg9pgJRfqcRazjhUZY" },
        { type: "uint256", value: "1000000" },
      ],
      feeLimit: "150000000",
      network: TEST_NETWORK,
    });

    await page.goto(`${getBaseUrl()}/sign/${id}`);
    await expect(page.getByRole("heading", { name: "Call Contract" })).toBeVisible();
    await expect(page.getByText("transfer(address,uint256)", { exact: false })).toBeVisible();
    await expect(page.locator("#tx-fee")).toContainText("150");

    await page.getByRole("button", { name: "Sign & Send" }).click();
    await expect(page.getByText("Transaction Sent!")).toBeVisible({ timeout: 10000 });

    const result = await getTestResult(id);
    expect(result?.success).toBe(true);
    expect(result?.result).toBe(FAKE_TX_ID);

    await ctx.close();
  });
});

// --- Message Signing ---

test.describe("Message Signing", () => {
  test("signs a message via signMessageV2", async ({ browser }) => {
    const ctx = await walletContext(browser);
    const page = await ctx.newPage();

    const { id } = await createTestRequest("sign_message", {
      message: "Hello TRON",
      network: TEST_NETWORK,
    });

    await page.goto(`${getBaseUrl()}/sign/${id}`);
    await expect(page.getByRole("heading", { name: "Sign Message" })).toBeVisible();
    await expect(page.getByText("Hello TRON")).toBeVisible();

    await page.getByRole("button", { name: "Sign" }).click();
    await expect(page.getByText("Signed Successfully!")).toBeVisible({ timeout: 10000 });

    const result = await getTestResult(id);
    expect(result?.success).toBe(true);
    expect(result?.result).toMatch(/^0x[a-f0-9]+$/i);

    await ctx.close();
  });

  test("rejects message signing via Reject button", async ({ browser }) => {
    const ctx = await walletContext(browser);
    const page = await ctx.newPage();

    const { id } = await createTestRequest("sign_message", {
      message: "Hello TRON",
      network: TEST_NETWORK,
    });

    await page.goto(`${getBaseUrl()}/sign/${id}`);
    await expect(page.getByRole("heading", { name: "Sign Message" })).toBeVisible();
    await patchWindowClose(page);

    await page.getByRole("button", { name: "Reject" }).click();
    await page.waitForTimeout(200);

    const result = await getTestResult(id);
    expect(result?.success).toBe(false);
    expect(result?.error).toContain("rejected");

    await ctx.close();
  });

  test("signs TIP-712 typed data", async ({ browser }) => {
    const ctx = await walletContext(browser);
    const page = await ctx.newPage();

    const { id } = await createTestRequest("sign_typed_data", {
      domain: { name: "Test App", version: "1" },
      types: { Message: [{ name: "content", type: "string" }] },
      primaryType: "Message",
      message: { content: "Hello, TIP-712!" },
      network: TEST_NETWORK,
    });

    await page.goto(`${getBaseUrl()}/sign/${id}`);
    await expect(page.getByRole("heading", { name: "Sign Typed Data" })).toBeVisible();
    await expect(page.getByText("Typed Data (TIP-712)")).toBeVisible();

    await page.getByRole("button", { name: "Sign" }).click();
    await expect(page.getByText("Signed Successfully!")).toBeVisible({ timeout: 10000 });

    const result = await getTestResult(id);
    expect(result?.success).toBe(true);

    await ctx.close();
  });

  test("rejects typed data signing", async ({ browser }) => {
    const ctx = await walletContext(browser);
    const page = await ctx.newPage();

    const { id } = await createTestRequest("sign_typed_data", {
      domain: { name: "Test App", version: "1" },
      types: { Message: [{ name: "content", type: "string" }] },
      primaryType: "Message",
      message: { content: "Hello, TIP-712!" },
      network: TEST_NETWORK,
    });

    await page.goto(`${getBaseUrl()}/sign/${id}`);
    await expect(page.getByRole("heading", { name: "Sign Typed Data" })).toBeVisible();
    await patchWindowClose(page);

    await page.getByRole("button", { name: "Reject" }).click();
    await page.waitForTimeout(200);

    const result = await getTestResult(id);
    expect(result?.success).toBe(false);
    expect(result?.error).toContain("rejected");

    await ctx.close();
  });
});
