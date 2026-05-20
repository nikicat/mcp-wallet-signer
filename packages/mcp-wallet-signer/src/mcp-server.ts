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
import type { CallToolRequest, GetPromptRequest, ReadResourceRequest } from "@modelcontextprotocol/sdk/types.js";

import { CHAINS, getDefaultChainId, getPort, WalletSigner } from "browser-evm-signer";
import {
  getDefaultNetwork as getTronDefaultNetwork,
  getPort as getTronPort,
  NETWORKS as TRON_NETWORKS,
  WalletSigner as TronWalletSigner,
} from "browser-tron-signer";
import {
  ConnectWalletSchema,
  GetBalanceSchema,
  GetTokenBalanceSchema,
  SendTransactionSchema,
  SignMessageSchema,
  SignTypedDataSchema,
  TronConnectWalletSchema,
  TronGetBalanceSchema,
  TronGetTokenBalanceSchema,
  TronSendTransactionSchema,
  TronSignMessageSchema,
  TronSignTypedDataSchema,
  TronTriggerContractSchema,
} from "./schemas.ts";
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
        address: {
          type: "string",
          description: "Required wallet address (0x...) — if specified, the user must connect this exact address",
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
  {
    name: "get_token_balance",
    description:
      "Get the ERC-20 token balance of an address. Reads balanceOf/decimals/symbol from the contract via eth_call — no browser interaction.",
    inputSchema: {
      type: "object" as const,
      properties: {
        contractAddress: {
          type: "string",
          description: "ERC-20 token contract address (0x...)",
        },
        address: {
          type: "string",
          description: "Holder address whose token balance to query (0x...)",
        },
        chainId: {
          type: "number",
          description: "Chain ID (default: 1)",
        },
      },
      required: ["contractAddress", "address"],
    },
  },
  // === TRON tools ===
  {
    name: "tron_connect_wallet",
    description:
      "Connect to a TronLink browser wallet and get the TRON address (Base58, T...). IMPORTANT: This tool opens a browser window where the user must approve the connection in TronLink. Tell the user to switch to their browser window to approve. This tool blocks until the user acts or the request times out (5 min).",
    inputSchema: {
      type: "object" as const,
      properties: {
        network: {
          type: "string",
          enum: ["mainnet", "shasta", "nile"],
          description: "Tron network (default: mainnet)",
        },
        address: {
          type: "string",
          description: "Required TRON address (T...) — if specified, the user must connect this exact address",
        },
      },
    },
  },
  {
    name: "tron_send_transaction",
    description:
      "Send TRX (or call a contract via tron_trigger_contract). Opens a browser window where the user reviews and approves the transaction in TronLink. This tool blocks until the user acts or the request times out (5 min).",
    inputSchema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Recipient TRON address (T...)" },
        amount: {
          type: "string",
          description: "Amount in SUN (1 TRX = 1,000,000 SUN); pass as a string to preserve precision",
        },
        from: { type: "string", description: "Expected from-address; UI rejects on mismatch" },
        data: { type: "string", description: "Optional memo / hex data" },
        network: { type: "string", enum: ["mainnet", "shasta", "nile"] },
      },
      required: ["to", "amount"],
    },
  },
  {
    name: "tron_trigger_contract",
    description:
      "Call a TRON smart-contract function (TRC-20 transfers, etc.) via tronWeb.transactionBuilder.triggerSmartContract. Opens a browser window for user approval. Blocks until approved or timed out (5 min).",
    inputSchema: {
      type: "object" as const,
      properties: {
        contractAddress: { type: "string", description: "Smart-contract address (T...)" },
        functionSelector: {
          type: "string",
          description: "Function signature, e.g. `transfer(address,uint256)`",
        },
        parameters: {
          type: "array",
          description: "ABI-encoded parameter list — see TronWeb docs for shape",
          items: {
            type: "object",
            properties: { type: { type: "string" }, value: {} },
            required: ["type", "value"],
          },
        },
        from: { type: "string", description: "Expected from-address; UI rejects on mismatch" },
        feeLimit: { type: "string", description: "Max energy fee in SUN (default 150_000_000 = 150 TRX)" },
        callValue: { type: "string", description: "TRX to send with the call, in SUN" },
        network: { type: "string", enum: ["mainnet", "shasta", "nile"] },
      },
      required: ["contractAddress", "functionSelector"],
    },
  },
  {
    name: "tron_sign_message",
    description:
      "Sign an arbitrary message via tronWeb.trx.signMessageV2 (TRON's equivalent of personal_sign). Opens a browser window for user approval. Blocks until approved or timed out (5 min).",
    inputSchema: {
      type: "object" as const,
      properties: {
        message: { type: "string", description: "Message to sign" },
        address: { type: "string", description: "Address to sign with (uses connected address if not specified)" },
        network: { type: "string", enum: ["mainnet", "shasta", "nile"] },
      },
      required: ["message"],
    },
  },
  {
    name: "tron_sign_typed_data",
    description:
      "Sign TIP-712 typed data via tronWeb.trx._signTypedData. Opens a browser window for user approval. Blocks until approved or timed out (5 min).",
    inputSchema: {
      type: "object" as const,
      properties: {
        domain: {
          type: "object",
          description: "TIP-712 domain (name, version, chainId hex, verifyingContract, salt)",
          properties: {
            name: { type: "string" },
            version: { type: "string" },
            chainId: { type: "string" },
            verifyingContract: { type: "string" },
            salt: { type: "string" },
          },
        },
        types: { type: "object", description: "Type definitions" },
        primaryType: { type: "string", description: "Primary type name" },
        message: { type: "object", description: "Message data to sign" },
        address: { type: "string", description: "Address to sign with" },
        network: { type: "string", enum: ["mainnet", "shasta", "nile"] },
      },
      required: ["domain", "types", "primaryType", "message"],
    },
  },
  {
    name: "tron_get_balance",
    description: "Get the TRX balance of a TRON address. Does not require browser interaction — reads directly from TronGrid.",
    inputSchema: {
      type: "object" as const,
      properties: {
        address: { type: "string", description: "TRON address (T...)" },
        network: { type: "string", enum: ["mainnet", "shasta", "nile"] },
      },
      required: ["address"],
    },
  },
  {
    name: "tron_get_token_balance",
    description:
      "Get the TRC-20 token balance of a TRON address. Reads balanceOf/decimals/symbol via TronGrid's triggerconstantcontract — no browser interaction.",
    inputSchema: {
      type: "object" as const,
      properties: {
        contractAddress: { type: "string", description: "TRC-20 token contract address (T...)" },
        address: { type: "string", description: "Holder address whose token balance to query (T...)" },
        network: { type: "string", enum: ["mainnet", "shasta", "nile"] },
      },
      required: ["contractAddress", "address"],
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
 * Each signer (EVM, TRON) owns its own browser-facing HTTP bridge and binds to its own port.
 * Pass instances to share them across multiple servers, or omit to construct defaults.
 */
export function createMcpServer(signer?: WalletSigner, tronSigner?: TronWalletSigner): Server {
  const walletSigner = signer ?? new WalletSigner();
  const tronWalletSigner = tronSigner ?? new TronWalletSigner();

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
  server.setRequestHandler(GetPromptRequestSchema, (request: GetPromptRequest) => {
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
          name: "Supported EVM Chains",
          description: "List of supported EVM chains with chain IDs, RPC URLs, and native currencies",
          mimeType: "application/json",
        },
        {
          uri: "wallet://config",
          name: "Server Configuration",
          description: "Current MCP wallet signer configuration (default chain/network, ports)",
          mimeType: "application/json",
        },
        {
          uri: "wallet://tron-networks",
          name: "Supported TRON Networks",
          description: "List of supported TRON networks with full-node URLs and block explorers",
          mimeType: "application/json",
        },
      ],
    };
  });

  // Read a specific resource
  server.setRequestHandler(ReadResourceRequestSchema, (request: ReadResourceRequest) => {
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
                  evm: {
                    defaultChainId: getDefaultChainId(),
                    defaultChain: CHAINS[getDefaultChainId()]?.name ?? "Unknown",
                    port: getPort(),
                    supportedChainIds: Object.keys(CHAINS).map(Number),
                  },
                  tron: {
                    defaultNetwork: getTronDefaultNetwork(),
                    port: getTronPort(),
                    supportedNetworks: Object.keys(TRON_NETWORKS),
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      case "wallet://tron-networks":
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(
                Object.values(TRON_NETWORKS).map((n) => ({
                  network: n.id,
                  name: n.name,
                  fullHost: n.fullHost,
                  nativeCurrency: n.nativeCurrency,
                  blockExplorer: n.blockExplorer,
                })),
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
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
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
        case "get_token_balance": {
          const parsed = GetTokenBalanceSchema.safeParse(args);
          if (!parsed.success) return errorResult(parsed.error.message);
          const { balance, raw, symbol, decimals } = await walletSigner.getTokenBalance(parsed.data);
          return textResult(
            `Balance: ${balance} ${symbol}\nRaw: ${raw}\nDecimals: ${decimals}\nContract: ${parsed.data.contractAddress}`,
          );
        }
        case "tron_connect_wallet": {
          const parsed = TronConnectWalletSchema.safeParse(args);
          if (!parsed.success) return errorResult(parsed.error.message);
          const { address, approvalUrl } = await tronWalletSigner.connectWallet(parsed.data);
          return textResult(`Approval URL: ${approvalUrl}\nTron wallet connected successfully!\nAddress: ${address}`);
        }
        case "tron_send_transaction": {
          const parsed = TronSendTransactionSchema.safeParse(args);
          if (!parsed.success) return errorResult(parsed.error.message);
          const { txHash, approvalUrl } = await tronWalletSigner.sendTransaction(parsed.data);
          const network = parsed.data.network || tronWalletSigner.defaultNetwork;
          const explorer = TRON_NETWORKS[network]?.blockExplorer;
          const explorerUrl = explorer ? `${explorer}/#/transaction/${txHash}` : null;
          let text = `Approval URL: ${approvalUrl}\nTron transaction sent successfully!\nTransaction ID: ${txHash}`;
          if (explorerUrl) text += `\nExplorer: ${explorerUrl}`;
          return textResult(text);
        }
        case "tron_trigger_contract": {
          const parsed = TronTriggerContractSchema.safeParse(args);
          if (!parsed.success) return errorResult(parsed.error.message);
          const { txHash, approvalUrl } = await tronWalletSigner.triggerContract(parsed.data);
          const network = parsed.data.network || tronWalletSigner.defaultNetwork;
          const explorer = TRON_NETWORKS[network]?.blockExplorer;
          const explorerUrl = explorer ? `${explorer}/#/transaction/${txHash}` : null;
          let text = `Approval URL: ${approvalUrl}\nContract call broadcast!\nTransaction ID: ${txHash}`;
          if (explorerUrl) text += `\nExplorer: ${explorerUrl}`;
          return textResult(text);
        }
        case "tron_sign_message": {
          const parsed = TronSignMessageSchema.safeParse(args);
          if (!parsed.success) return errorResult(parsed.error.message);
          const { signature, approvalUrl } = await tronWalletSigner.signMessage(parsed.data);
          return textResult(`Approval URL: ${approvalUrl}\nMessage signed successfully!\nSignature: ${signature}`);
        }
        case "tron_sign_typed_data": {
          const parsed = TronSignTypedDataSchema.safeParse(args);
          if (!parsed.success) return errorResult(parsed.error.message);
          const { signature, approvalUrl } = await tronWalletSigner.signTypedData(parsed.data);
          return textResult(`Approval URL: ${approvalUrl}\nTyped data signed successfully!\nSignature: ${signature}`);
        }
        case "tron_get_balance": {
          const parsed = TronGetBalanceSchema.safeParse(args);
          if (!parsed.success) return errorResult(parsed.error.message);
          const { balance, sun, symbol } = await tronWalletSigner.getBalance(parsed.data);
          return textResult(`Balance: ${balance} ${symbol}\nSun: ${sun}`);
        }
        case "tron_get_token_balance": {
          const parsed = TronGetTokenBalanceSchema.safeParse(args);
          if (!parsed.success) return errorResult(parsed.error.message);
          const { balance, raw, symbol, decimals } = await tronWalletSigner.getTokenBalance(parsed.data);
          return textResult(
            `Balance: ${balance} ${symbol}\nRaw: ${raw}\nDecimals: ${decimals}\nContract: ${parsed.data.contractAddress}`,
          );
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
 * Run the MCP server with stdio transport. Both the EVM and TRON signers are wired up so the
 * agent has access to `connect_wallet` / `tron_connect_wallet` etc. side-by-side.
 */
export async function runServer(): Promise<void> {
  const signer = new WalletSigner();
  const tronSigner = new TronWalletSigner();
  const server = createMcpServer(signer, tronSigner);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error("[mcp-wallet-signer] MCP server started (EVM + TRON)");
}
