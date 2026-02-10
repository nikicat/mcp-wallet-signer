#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-run --allow-sys

import { runServer } from "./mcp-server.ts";

// Entry point for the MCP wallet signer server
await runServer();
