/**
 * Config loader — reads from .env with sane defaults
 */

import dotenv from "dotenv";
dotenv.config();

export function loadConfig() {
  const required = ["ACE_DATA_API_KEY", "SYNAPSE_RPC_URL"];

  for (const key of required) {
    if (!process.env[key] || process.env[key].startsWith("YOUR_")) {
      console.warn(`⚠️  WARNING: ${key} not set in .env — using mock mode`);
    }
  }

  return {
    // Wallet
    walletPath: process.env.WALLET_PATH ?? "./wallet.json",

    // Synapse
    synapseRpcUrl: process.env.SYNAPSE_RPC_URL ?? "https://us-1-mainnet.oobeprotocol.ai/rpc",
    solanaCluster: process.env.SOLANA_CLUSTER ?? "mainnet-beta",
    sentinelAddress: process.env.SENTINEL_AGENT_ADDRESS ?? "Ccr2yK3hLALU4p8oNRqrh4dGuvPJTth5KCLMio8cE1ph",
    escrowDepositLamports: parseInt(process.env.ESCROW_DEPOSIT_LAMPORTS ?? "5000000"),
    minRegistrationLamports: parseInt(process.env.MIN_REGISTRATION_LAMPORTS ?? "100000000"),

    // Agent
    agentName: process.env.AGENT_NAME ?? "AgenticBro-Sentinel",
    agentDescription: process.env.AGENT_DESCRIPTION ?? "AgenticBro scam detection agent by Agentic Insights LLC",
    agentEndpoint: process.env.AGENT_ENDPOINT ?? "https://agenticbro.app/x402",

    // Ace Data Cloud
    aceDataApiKey: process.env.ACE_DATA_API_KEY ?? "",
    aceDataBaseUrl: process.env.ACE_DATA_BASE_URL ?? "https://api.acedata.cloud",

    // Workflow
    workflowIntervalMs: parseInt(process.env.WORKFLOW_INTERVAL_MS ?? "60000"),
    callsPerCycle: parseInt(process.env.CALLS_PER_CYCLE ?? "3"),

    // Dashboard
    dashboardPort: parseInt(process.env.DASHBOARD_PORT ?? "3333"),
  };
}
