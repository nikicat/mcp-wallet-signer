/**
 * Playwright e2e tests for wallet signing flows.
 *
 * Injects a mock wallet via EIP-6963 events + window.ethereum fallback,
 * navigates to connect/sign pages, clicks buttons, and verifies the API result.
 */

import { test, expect, type BrowserContext } from "@playwright/test";
import {
  startServer,
  stopServer,
  createTestRequest,
  getTestResult,
  getBaseUrl,
} from "./fixtures/test-server.mts";
import {
  getMockProviderScript,
  TEST_ADDRESS,
  TEST_CHAIN_ID,
  TEST_WALLET_NAME,
} from "./fixtures/mock-wallet.mts";

test.beforeAll(async () => {
  await startServer();
});

test.afterAll(async () => {
  await stopServer();
});

async function walletContext(
  browser: import("@playwright/test").Browser
): Promise<BrowserContext> {
  const ctx = await browser.newContext();
  await ctx.addInitScript(getMockProviderScript(TEST_ADDRESS, TEST_CHAIN_ID));
  return ctx;
}

// --- Wallet Connection ---

test.describe("Wallet Connection", () => {
  test("connects successfully with mock wallet", async ({ browser }) => {
    const ctx = await walletContext(browser);
    const page = await ctx.newPage();

    const { id } = await createTestRequest("connect", { chainId: TEST_CHAIN_ID });
    await page.goto(`${getBaseUrl()}/connect/${id}`);

    await expect(page.getByRole("heading", { name: "Connect Wallet" })).toBeVisible();
    await expect(page.getByText(TEST_WALLET_NAME)).toBeVisible();
    await expect(page.locator("img.wallet-icon")).toBeVisible();

    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByText("Connected!")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(TEST_ADDRESS, { exact: false })).toBeVisible();

    const result = await getTestResult(id);
    expect(result?.success).toBe(true);
    expect(result?.result?.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());

    await ctx.close();
  });

  test("shows not-found for expired request", async ({ browser }) => {
    const ctx = await walletContext(browser);
    const page = await ctx.newPage();

    await page.goto(`${getBaseUrl()}/connect/00000000-0000-0000-0000-000000000000`);
    await expect(page.getByText("Request Not Found")).toBeVisible();

    await ctx.close();
  });

  test("shows error when no wallet is detected", async ({ browser }) => {
    const ctx = await browser.newContext(); // no mock wallet
    const page = await ctx.newPage();

    const { id } = await createTestRequest("connect", { chainId: TEST_CHAIN_ID });
    await page.goto(`${getBaseUrl()}/connect/${id}`);

    await expect(page.getByRole("heading", { name: "Connect Wallet" })).toBeVisible();
    await expect(page.getByText("No wallet detected")).toBeVisible();

    await ctx.close();
  });
});

// --- Transaction Signing ---

test.describe("Transaction Signing", () => {
  test("signs and sends transaction", async ({ browser }) => {
    const ctx = await walletContext(browser);
    const page = await ctx.newPage();

    const { id } = await createTestRequest("send_transaction", {
      to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      value: "1000000000000000000",
      chainId: TEST_CHAIN_ID,
    });

    await page.goto(`${getBaseUrl()}/sign/${id}`);
    await expect(page.getByRole("heading", { name: "Send Transaction" })).toBeVisible();
    await expect(
      page.getByText("0x70997970C51812dc3A010C7d01b50e0d17dc79C8", { exact: false })
    ).toBeVisible();

    await page.getByRole("button", { name: "Sign & Send" }).click();
    await expect(page.getByText("Transaction Sent!")).toBeVisible({ timeout: 10000 });

    const result = await getTestResult(id);
    expect(result?.success).toBe(true);
    expect(result?.result).toMatch(/^0x[a-f0-9]+$/i);

    await ctx.close();
  });

  test("rejects transaction", async ({ browser }) => {
    const ctx = await walletContext(browser);
    const page = await ctx.newPage();

    const { id } = await createTestRequest("send_transaction", {
      to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      value: "1000000000000000000",
      chainId: TEST_CHAIN_ID,
    });

    await page.goto(`${getBaseUrl()}/sign/${id}`);
    await expect(page.getByRole("heading", { name: "Send Transaction" })).toBeVisible();

    await page.getByRole("button", { name: "Reject" }).click();
    await page.waitForTimeout(500);

    const result = await getTestResult(id);
    expect(result?.success).toBe(false);
    expect(result?.error).toContain("rejected");

    await ctx.close();
  });
});

// --- Message Signing ---

test.describe("Message Signing", () => {
  test("signs a message", async ({ browser }) => {
    const ctx = await walletContext(browser);
    const page = await ctx.newPage();

    const { id } = await createTestRequest("sign_message", {
      message: "Hello, Ethereum!",
      chainId: TEST_CHAIN_ID,
    });

    await page.goto(`${getBaseUrl()}/sign/${id}`);
    await expect(page.getByRole("heading", { name: "Sign Message" })).toBeVisible();
    await expect(page.getByText("Hello, Ethereum!")).toBeVisible();

    await page.getByRole("button", { name: "Sign" }).click();
    await expect(page.getByText("Signed Successfully!")).toBeVisible({ timeout: 10000 });

    const result = await getTestResult(id);
    expect(result?.success).toBe(true);
    expect(result?.result).toMatch(/^0x[a-f0-9]+$/i);

    await ctx.close();
  });

  test("signs EIP-712 typed data", async ({ browser }) => {
    const ctx = await walletContext(browser);
    const page = await ctx.newPage();

    const { id } = await createTestRequest("sign_typed_data", {
      domain: { name: "Test App", version: "1", chainId: TEST_CHAIN_ID },
      types: { Message: [{ name: "content", type: "string" }] },
      primaryType: "Message",
      message: { content: "Hello, World!" },
      chainId: TEST_CHAIN_ID,
    });

    await page.goto(`${getBaseUrl()}/sign/${id}`);
    await expect(page.getByRole("heading", { name: "Sign Typed Data" })).toBeVisible();
    await expect(page.getByText("Typed Data (EIP-712)")).toBeVisible();

    await page.getByRole("button", { name: "Sign" }).click();
    await expect(page.getByText("Signed Successfully!")).toBeVisible({ timeout: 10000 });

    const result = await getTestResult(id);
    expect(result?.success).toBe(true);

    await ctx.close();
  });
});
