/** The check from issue #2: `npx mcp-wallet-signer` must answer an MCP stdio handshake. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("initialize handshake lists the signing tools", async () => {
  const client = new Client({ name: "test", version: "0" });
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: ["index.js"] }),
  );
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ["connect_wallet", "send_transaction", "sign_message", "sign_typed_data"],
  );
  await client.close();
});
