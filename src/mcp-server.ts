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

import { WalletSigner } from "./wallet-signer.ts";
import { CHAINS, getDefaultChainId, getPort } from "./config.ts";
import { ConnectWalletSchema, GetBalanceSchema, SendTransactionSchema, SignMessageSchema, SignTypedDataSchema } from "./types.ts";
import { VERSION } from "./version.ts";

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

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

/**
 * Create and configure the MCP server.
 * If a WalletSigner is provided it will be used; otherwise a new one is created.
 */
export function createMcpServer(signer?: WalletSigner): Server {
  const walletSigner = signer ?? new WalletSigner();

  const server = new Server(
    {
      name: "mcp-wallet-signer",
      version: VERSION,
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
        case "connect_wallet": {
          const parsed = ConnectWalletSchema.safeParse(args);
          if (!parsed.success) return errorResult(parsed.error.message);
          const { address, approvalUrl } = await walletSigner.connectWallet(parsed.data);
          return textResult(`Approval URL: ${approvalUrl}\nWallet connected successfully!\nAddress: ${address}`);
        }
        case "send_transaction": {
          const parsed = SendTransactionSchema.safeParse(args);
          if (!parsed.success) return errorResult(parsed.error.message);
          const { txHash, approvalUrl } = await walletSigner.sendTransaction(parsed.data);
          const chainId = parsed.data.chainId || walletSigner.defaultChainId;
          const chain = CHAINS[chainId];
          const explorerUrl = chain?.blockExplorer ? `${chain.blockExplorer}/tx/${txHash}` : null;
          let text = `Approval URL: ${approvalUrl}\nTransaction sent successfully!\nTransaction Hash: ${txHash}`;
          if (explorerUrl) text += `\nExplorer: ${explorerUrl}`;
          return textResult(text);
        }
        case "sign_message": {
          const parsed = SignMessageSchema.safeParse(args);
          if (!parsed.success) return errorResult(parsed.error.message);
          const { signature, approvalUrl } = await walletSigner.signMessage(parsed.data);
          return textResult(`Approval URL: ${approvalUrl}\nMessage signed successfully!\nSignature: ${signature}`);
        }
        case "sign_typed_data": {
          const parsed = SignTypedDataSchema.safeParse(args);
          if (!parsed.success) return errorResult(parsed.error.message);
          const { signature, approvalUrl } = await walletSigner.signTypedData(parsed.data);
          return textResult(`Approval URL: ${approvalUrl}\nTyped data signed successfully!\nSignature: ${signature}`);
        }
        case "get_balance": {
          const parsed = GetBalanceSchema.safeParse(args);
          if (!parsed.success) return errorResult(parsed.error.message);
          const { balance, wei, symbol } = await walletSigner.getBalance(parsed.data);
          return textResult(`Balance: ${balance} ${symbol}\nWei: ${wei}`);
        }
        default:
          return errorResult(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message);
    }
  });

  return server;
}

/**
 * Run the MCP server with stdio transport
 */
export async function runServer(): Promise<void> {
  const signer = new WalletSigner();
  const server = createMcpServer(signer);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error("[mcp-wallet-signer] MCP server started");
}
