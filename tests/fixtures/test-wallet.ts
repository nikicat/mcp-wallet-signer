/**
 * Test wallet configuration for e2e tests.
 *
 * Uses Anvil's default test accounts.
 * DO NOT use these keys with real funds.
 */

export const TEST_ACCOUNTS = [
  {
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const,
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const,
  },
  {
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const,
    privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const,
  },
  {
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as const,
    privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as const,
  },
];

export const DEFAULT_TEST_ACCOUNT = TEST_ACCOUNTS[0];

// Anvil default RPC URL
export const ANVIL_RPC_URL = "http://127.0.0.1:8545";
export const ANVIL_CHAIN_ID = 31337;

/**
 * Start Anvil for testing (requires anvil to be installed)
 */
export async function startAnvil(): Promise<Deno.ChildProcess> {
  const command = new Deno.Command("anvil", {
    args: ["--port", "8545", "--chain-id", "31337"],
    stdout: "piped",
    stderr: "piped",
  });

  const process = command.spawn();

  // Wait for Anvil to start
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return process;
}

/**
 * Stop Anvil process
 */
export function stopAnvil(process: Deno.ChildProcess): void {
  process.kill("SIGTERM");
}
