/**
 * Capture screenshots of the approval UI for README documentation.
 * Run: deno run -A npm:@playwright/test@latest/cli test capture-screenshots.mts
 * Or directly: npx playwright test capture-screenshots.mts
 */

import { type BrowserContext, expect, test } from "@playwright/test";
import { createTestRequest, getBaseUrl, startServer, stopServer } from "./fixtures/test-server.mts";
import { getMockProviderScript, TEST_ADDRESS, TEST_CHAIN_ID } from "./fixtures/mock-wallet.mts";

const SCREENSHOT_DIR = "../../docs/screenshots";

test.beforeAll(async () => {
  await startServer();
});

test.afterAll(async () => {
  await stopServer();
});

async function walletContext(browser: import("@playwright/test").Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width: 600, height: 700 },
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript(getMockProviderScript(TEST_ADDRESS, TEST_CHAIN_ID));
  return ctx;
}

test("screenshot: connect wallet", async ({ browser }) => {
  const ctx = await walletContext(browser);
  const page = await ctx.newPage();

  const { id } = await createTestRequest("connect", { chainId: TEST_CHAIN_ID });
  await page.goto(`${getBaseUrl()}/connect/${id}`);

  await expect(page.getByRole("heading", { name: "Connect Wallet" })).toBeVisible();
  await expect(page.getByText("MockWallet")).toBeVisible();

  await page.screenshot({ path: `${SCREENSHOT_DIR}/connect-wallet.png` });
  await ctx.close();
});

test("screenshot: send transaction", async ({ browser }) => {
  const ctx = await walletContext(browser);
  const page = await ctx.newPage();

  const { id } = await createTestRequest("send_transaction", {
    to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    value: "1000000000000000000",
    chainId: TEST_CHAIN_ID,
  });

  await page.goto(`${getBaseUrl()}/sign/${id}`);
  await expect(page.getByRole("heading", { name: "Send Transaction" })).toBeVisible();

  await page.screenshot({ path: `${SCREENSHOT_DIR}/send-transaction.png` });
  await ctx.close();
});

test("screenshot: sign message", async ({ browser }) => {
  const ctx = await walletContext(browser);
  const page = await ctx.newPage();

  const { id } = await createTestRequest("sign_message", {
    message: "Hello, Ethereum!",
    chainId: TEST_CHAIN_ID,
  });

  await page.goto(`${getBaseUrl()}/sign/${id}`);
  await expect(page.getByRole("heading", { name: "Sign Message" })).toBeVisible();

  await page.screenshot({ path: `${SCREENSHOT_DIR}/sign-message.png` });
  await ctx.close();
});
