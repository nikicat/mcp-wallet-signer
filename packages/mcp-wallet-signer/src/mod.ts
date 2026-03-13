// Re-export everything from browser-evm-signer for backwards compat
export * from "browser-evm-signer";

// MCP-specific exports
export { createMcpServer, runServer } from "./mcp-server.ts";
