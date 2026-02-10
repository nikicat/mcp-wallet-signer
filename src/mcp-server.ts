import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createPublicClient, http, formatEther } from "viem";

import { pendingStore } from "./pending-store.ts";
import { ensureServerRunning } from "./http-server.ts";
import { openBrowser, buildConnectUrl, buildSignUrl } from "./browser.ts";
import { getDefaultChainId, getRpcUrl, CHAINS } from "./config.ts";
import {
  ConnectWalletSchema,
  SendTransactionSchema,
  SignMessageSchema,
  SignTypedDataSchema,
  GetBalanceSchema,
} from "./types.ts";

// Tool definitions
const TOOLS = [
  {
    name: "connect_wallet",
    description:
      "Connect to a browser wallet and get the wallet address. IMPORTANT: This tool opens a browser window where the user must approve the connection. Tell the user to switch to their browser window to approve. This tool blocks until the user acts or the request times out (5 min).",
    inputSchema: {
      type: "object" as const,
      properties: {
        chainId: {
          type: "number",
          description: "Chain ID to connect to (default: 1 for Ethereum mainnet)",
        },
      },
    },
  },
  {
    name: "send_transaction",
    description:
      "Send a transaction (ETH transfer or contract call) via the connected browser wallet. IMPORTANT: This tool opens a browser window where the user must review and approve the transaction. Tell the user to switch to their browser window to approve. This tool blocks until the user acts or the request times out (5 min).",
    inputSchema: {
      type: "object" as const,
      properties: {
        to: {
          type: "string",
          description: "Recipient address (0x...)",
        },
        value: {
          type: "string",
          description: "Amount in wei to send (optional for contract calls)",
        },
        data: {
          type: "string",
          description: "Contract call data, hex encoded (optional)",
        },
        chainId: {
          type: "number",
          description: "Chain ID (default: 1)",
        },
        gasLimit: {
          type: "string",
          description: "Gas limit (optional, will be estimated if not provided)",
        },
        maxFeePerGas: {
          type: "string",
          description: "Max fee per gas in wei (optional)",
        },
        maxPriorityFeePerGas: {
          type: "string",
          description: "Max priority fee per gas in wei (optional)",
        },
      },
      required: ["to"],
    },
  },
  {
    name: "sign_message",
    description:
      "Sign an arbitrary message using personal_sign. IMPORTANT: This tool opens a browser window where the user must approve the signature. Tell the user to switch to their browser window to approve. This tool blocks until the user acts or the request times out (5 min).",
    inputSchema: {
      type: "object" as const,
      properties: {
        message: {
          type: "string",
          description: "Message to sign",
        },
        address: {
          type: "string",
          description: "Address to sign with (uses connected address if not specified)",
        },
        chainId: {
          type: "number",
          description: "Chain ID",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "sign_typed_data",
    description:
      "Sign EIP-712 typed data. IMPORTANT: This tool opens a browser window where the user must review and approve the signature. Tell the user to switch to their browser window to approve. This tool blocks until the user acts or the request times out (5 min).",
    inputSchema: {
      type: "object" as const,
      properties: {
        domain: {
          type: "object",
          description: "EIP-712 domain (name, version, chainId, verifyingContract, salt)",
          properties: {
            name: { type: "string" },
            version: { type: "string" },
            chainId: { type: "number" },
            verifyingContract: { type: "string" },
            salt: { type: "string" },
          },
        },
        types: {
          type: "object",
          description: "Type definitions (e.g., { Person: [{ name: 'name', type: 'string' }] })",
        },
        primaryType: {
          type: "string",
          description: "Primary type name",
        },
        message: {
          type: "object",
          description: "Message data to sign",
        },
        address: {
          type: "string",
          description: "Address to sign with",
        },
        chainId: {
          type: "number",
          description: "Chain ID",
        },
      },
      required: ["domain", "types", "primaryType", "message"],
    },
  },
  {
    name: "get_balance",
    description:
      "Get the ETH balance of an address. Does not require browser interaction - reads directly from the blockchain.",
    inputSchema: {
      type: "object" as const,
      properties: {
        address: {
          type: "string",
          description: "Address to get balance for (0x...)",
        },
        chainId: {
          type: "number",
          description: "Chain ID (default: 1)",
        },
      },
      required: ["address"],
    },
  },
];

/**
 * Create and configure the MCP server
 */
export function createMcpServer(): Server {
  const server = new Server(
    {
      name: "mcp-wallet-signer",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, () => {
    return { tools: TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "connect_wallet":
          return await handleConnectWallet(args);
        case "send_transaction":
          return await handleSendTransaction(args);
        case "sign_message":
          return await handleSignMessage(args);
        case "sign_typed_data":
          return await handleSignTypedData(args);
        case "get_balance":
          return await handleGetBalance(args);
        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

async function handleConnectWallet(args: unknown) {
  const parsed = ConnectWalletSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }],
      isError: true,
    };
  }

  const { chainId } = parsed.data;
  const port = await ensureServerRunning();

  const { id, promise } = pendingStore.createConnectRequest(chainId || getDefaultChainId());
  const url = buildConnectUrl(port, id);

  await openBrowser(url);

  const result = await promise;

  if (result.success) {
    return {
      content: [
        {
          type: "text",
          text: `Approval URL: ${url}\nWallet connected successfully!\nAddress: ${result.result}`,
        },
      ],
    };
  } else {
    return {
      content: [
        { type: "text", text: `Approval URL: ${url}\nFailed to connect wallet: ${result.error}` },
      ],
      isError: true,
    };
  }
}

async function handleSendTransaction(args: unknown) {
  const parsed = SendTransactionSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }],
      isError: true,
    };
  }

  const port = await ensureServerRunning();

  const { id, promise } = pendingStore.createSendTransactionRequest({
    to: parsed.data.to,
    value: parsed.data.value,
    data: parsed.data.data,
    chainId: parsed.data.chainId || getDefaultChainId(),
    gasLimit: parsed.data.gasLimit,
    maxFeePerGas: parsed.data.maxFeePerGas,
    maxPriorityFeePerGas: parsed.data.maxPriorityFeePerGas,
  });

  const url = buildSignUrl(port, id);
  await openBrowser(url);

  const result = await promise;

  if (result.success) {
    const chainId = parsed.data.chainId || getDefaultChainId();
    const chain = CHAINS[chainId];
    const explorerUrl = chain?.blockExplorer
      ? `${chain.blockExplorer}/tx/${result.result}`
      : null;

    let text = `Approval URL: ${url}\nTransaction sent successfully!\nTransaction Hash: ${result.result}`;
    if (explorerUrl) {
      text += `\nExplorer: ${explorerUrl}`;
    }

    return {
      content: [{ type: "text", text }],
    };
  } else {
    return {
      content: [
        { type: "text", text: `Approval URL: ${url}\nTransaction failed: ${result.error}` },
      ],
      isError: true,
    };
  }
}

async function handleSignMessage(args: unknown) {
  const parsed = SignMessageSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }],
      isError: true,
    };
  }

  const port = await ensureServerRunning();

  const { id, promise } = pendingStore.createSignMessageRequest({
    message: parsed.data.message,
    address: parsed.data.address,
    chainId: parsed.data.chainId || getDefaultChainId(),
  });

  const url = buildSignUrl(port, id);
  await openBrowser(url);

  const result = await promise;

  if (result.success) {
    return {
      content: [
        {
          type: "text",
          text: `Approval URL: ${url}\nMessage signed successfully!\nSignature: ${result.result}`,
        },
      ],
    };
  } else {
    return {
      content: [
        { type: "text", text: `Approval URL: ${url}\nSigning failed: ${result.error}` },
      ],
      isError: true,
    };
  }
}

async function handleSignTypedData(args: unknown) {
  const parsed = SignTypedDataSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }],
      isError: true,
    };
  }

  const port = await ensureServerRunning();

  const { id, promise } = pendingStore.createSignTypedDataRequest({
    domain: parsed.data.domain,
    types: parsed.data.types,
    primaryType: parsed.data.primaryType,
    message: parsed.data.message,
    address: parsed.data.address,
    chainId: parsed.data.chainId || getDefaultChainId(),
  });

  const url = buildSignUrl(port, id);
  await openBrowser(url);

  const result = await promise;

  if (result.success) {
    return {
      content: [
        {
          type: "text",
          text: `Approval URL: ${url}\nTyped data signed successfully!\nSignature: ${result.result}`,
        },
      ],
    };
  } else {
    return {
      content: [
        { type: "text", text: `Approval URL: ${url}\nSigning failed: ${result.error}` },
      ],
      isError: true,
    };
  }
}

async function handleGetBalance(args: unknown) {
  const parsed = GetBalanceSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }],
      isError: true,
    };
  }

  const chainId = parsed.data.chainId || getDefaultChainId();
  const rpcUrl = getRpcUrl(chainId);

  if (!rpcUrl) {
    return {
      content: [{ type: "text", text: `Unknown chain ID: ${chainId}. No RPC URL configured.` }],
      isError: true,
    };
  }

  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  const balance = await client.getBalance({
    address: parsed.data.address as `0x${string}`,
  });

  const chain = CHAINS[chainId];
  const symbol = chain?.nativeCurrency.symbol || "ETH";

  return {
    content: [
      {
        type: "text",
        text: `Balance: ${formatEther(balance)} ${symbol}\nWei: ${balance.toString()}`,
      },
    ],
  };
}

/**
 * Run the MCP server with stdio transport
 */
export async function runServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error("[mcp-wallet-signer] MCP server started");
}
