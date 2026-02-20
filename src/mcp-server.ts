import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createPublicClient, formatEther, http } from "viem";

import { pendingStore } from "./pending-store.ts";
import { ensureServerRunning } from "./http-server.ts";
import { buildConnectUrl, buildSignUrl, openBrowser } from "./browser.ts";
import { CHAINS, getDefaultChainId, getPort, getRpcUrl } from "./config.ts";
import { ConnectWalletSchema, GetBalanceSchema, SendTransactionSchema, SignMessageSchema, SignTypedDataSchema } from "./types.ts";
import pkg from "../package.json" with { type: "json" };

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
    description: "Get the ETH balance of an address. Does not require browser interaction - reads directly from the blockchain.",
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
      version: pkg.version,
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
        resources: {},
      },
    },
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, () => {
    return { tools: TOOLS };
  });

  // List available prompts
  server.setRequestHandler(ListPromptsRequestSchema, () => {
    return {
      prompts: [
        {
          name: "send-eth",
          description: "Send ETH to an address",
          arguments: [
            { name: "amount", description: "Amount of ETH to send", required: true },
            { name: "address", description: "Recipient address (0x...)", required: true },
            { name: "chain", description: "Chain name or ID (default: Ethereum)", required: false },
          ],
        },
        {
          name: "check-balance",
          description: "Check the ETH balance of a wallet address",
          arguments: [
            { name: "address", description: "Wallet address (0x...)", required: true },
            { name: "chain", description: "Chain name or ID (default: Ethereum)", required: false },
          ],
        },
        {
          name: "sign-message",
          description: "Sign a message with the connected wallet",
          arguments: [
            { name: "message", description: "Message to sign", required: true },
          ],
        },
      ],
    };
  });

  // Get a specific prompt
  server.setRequestHandler(GetPromptRequestSchema, (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "send-eth":
        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: `Send ${args?.amount ?? "?"} ETH to ${args?.address ?? "?"} on ${
                  args?.chain ?? "Ethereum"
                }. Connect the wallet first if not already connected, then send the transaction.`,
              },
            },
          ],
        };
      case "check-balance":
        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: `Check the ETH balance of ${args?.address ?? "?"} on ${args?.chain ?? "Ethereum"}.`,
              },
            },
          ],
        };
      case "sign-message":
        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: `Sign the following message with my wallet: ${
                  args?.message ?? "?"
                }. Connect the wallet first if not already connected.`,
              },
            },
          ],
        };
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });

  // List available resources
  server.setRequestHandler(ListResourcesRequestSchema, () => {
    return {
      resources: [
        {
          uri: "wallet://chains",
          name: "Supported Chains",
          description: "List of supported blockchain networks with chain IDs, RPC URLs, and native currencies",
          mimeType: "application/json",
        },
        {
          uri: "wallet://config",
          name: "Server Configuration",
          description: "Current MCP wallet signer configuration (default chain, port)",
          mimeType: "application/json",
        },
      ],
    };
  });

  // Read a specific resource
  server.setRequestHandler(ReadResourceRequestSchema, (request) => {
    const { uri } = request.params;

    switch (uri) {
      case "wallet://chains":
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(
                Object.entries(CHAINS).map(([id, chain]) => ({
                  chainId: Number(id),
                  name: chain.name,
                  nativeCurrency: chain.nativeCurrency,
                  rpcUrl: chain.rpcUrl,
                  blockExplorer: chain.blockExplorer,
                })),
                null,
                2,
              ),
            },
          ],
        };
      case "wallet://config":
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  defaultChainId: getDefaultChainId(),
                  defaultChain: CHAINS[getDefaultChainId()]?.name ?? "Unknown",
                  port: getPort(),
                  supportedChainIds: Object.keys(CHAINS).map(Number),
                },
                null,
                2,
              ),
            },
          ],
        };
      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
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
    const explorerUrl = chain?.blockExplorer ? `${chain.blockExplorer}/tx/${result.result}` : null;

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
