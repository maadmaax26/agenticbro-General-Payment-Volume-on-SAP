import { SystemProgram } from "@solana/web3.js";
import { createRequire } from "module";
import { BN } from "@coral-xyz/anchor";

const require = createRequire(import.meta.url);
const {
  SettlementMode,
  TokenType,
  deriveAgent,
  deriveAgentStats,
  deriveGlobalRegistry,
} = require("@oobe-protocol-labs/synapse-sap-sdk");

const TOKEN_TYPES = {
  sol: TokenType.Sol,
  usdc: TokenType.Usdc,
  spl: TokenType.Spl,
};

const SETTLEMENT_MODES = {
  instant: SettlementMode.Instant,
  escrow: SettlementMode.Escrow,
  batched: SettlementMode.Batched,
  x402: SettlementMode.X402,
};

function pricingTier(input) {
  return {
    tierId: input.tierId,
    pricePerCall: new BN(input.pricePerCall.toString()),
    minPricePerCall: input.minPricePerCall
      ? new BN(input.minPricePerCall.toString())
      : null,
    maxPricePerCall: input.maxPricePerCall
      ? new BN(input.maxPricePerCall.toString())
      : null,
    rateLimit: input.rateLimit,
    maxCallsPerSession: input.maxCallsPerSession ?? 0,
    burstLimit: input.burstLimit ?? null,
    tokenType: TOKEN_TYPES[input.tokenType ?? "sol"],
    tokenMint: input.tokenMint ?? null,
    tokenDecimals: input.tokenDecimals ?? null,
    settlementMode: input.settlementMode
      ? SETTLEMENT_MODES[input.settlementMode]
      : null,
    minEscrowDeposit: input.minEscrowDeposit
      ? new BN(input.minEscrowDeposit.toString())
      : null,
    batchIntervalSec: input.batchIntervalSec ?? null,
    volumeCurve: input.volumeCurve
      ? input.volumeCurve.map((breakpoint) => ({
          afterCalls: breakpoint.afterCalls,
          pricePerCall: new BN(breakpoint.pricePerCall.toString()),
        }))
      : null,
  };
}

export function buildAgentRegistration(config, { includeNews = false } = {}) {
  const capabilities = [
    {
      id: "scam:detect",
      description: "Real-time scam token and wallet detection on Solana",
      protocolId: "agenticbro",
      version: "1.0",
    },
    {
      id: "scam:analyze",
      description: "AI-powered threat risk scoring with confidence levels",
      protocolId: "agenticbro",
      version: "1.0",
    },
    {
      id: "scam:social",
      description: "Social media scam signal aggregation and scoring",
      protocolId: "agenticbro",
      version: "1.0",
    },
  ];

  if (includeNews) {
    capabilities.push({
      id: "scam:news",
      description: "News-based reputation and fraud detection",
      protocolId: "agenticbro",
      version: "1.0",
    });
  }

  return {
    name: config.agentName,
    description: config.agentDescription,
    capabilities,
    pricing: [
      pricingTier({
        tierId: "standard",
        pricePerCall: 1000,
        rateLimit: 60,
        maxCallsPerSession: 0,
        tokenType: "sol",
        settlementMode: "x402",
      }),
      ...(includeNews
        ? [
            pricingTier({
              tierId: "bulk",
              pricePerCall: 750,
              rateLimit: 300,
              maxCallsPerSession: 0,
              tokenType: "sol",
              settlementMode: "x402",
            }),
          ]
        : []),
    ],
    protocols: includeNews ? ["A2A", "x402", "agenticbro"] : [],
    agentId: null,
    agentUri: null,
    x402Endpoint: config.agentEndpoint ?? null,
  };
}

export async function registerAgentCompat(client, walletPublicKey, registration) {
  const [agentPda] = deriveAgent(walletPublicKey);
  const [statsPda] = deriveAgentStats(agentPda);
  const [globalPda] = deriveGlobalRegistry();

  let txSignature;
  try {
    txSignature = await client.program.methods
      .registerAgent(
        registration.name,
        registration.description,
        registration.capabilities,
        registration.pricing,
        registration.protocols,
        registration.agentId,
        registration.agentUri,
        registration.x402Endpoint,
      )
      .accounts({
        wallet: walletPublicKey,
        agent: agentPda,
        agentStats: statsPda,
        globalRegistry: globalPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  } catch (err) {
    const signature = err.message?.match(/Check signature ([1-9A-HJ-NP-Za-km-z]+)/)?.[1];
    if (!signature) throw err;

    await confirmSubmittedSignature(client, signature);
    txSignature = signature;
  }

  return { txSignature, agentPda, statsPda };
}

async function confirmSubmittedSignature(client, signature) {
  const connection = client.program.provider.connection;

  for (let attempt = 0; attempt < 12; attempt++) {
    const status = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const value = status.value[0];

    if (value?.err) {
      throw new Error(`Submitted transaction failed: ${JSON.stringify(value.err)}`);
    }
    if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error(
    `Transaction was submitted but confirmation was not observed. Check signature ${signature}.`
  );
}

export async function assertRegistrationBalance(client, walletPublicKey, minimumLamports) {
  const balance = await client.program.provider.connection.getBalance(walletPublicKey);

  if (balance < minimumLamports) {
    const neededSol = minimumLamports / 1_000_000_000;
    const currentSol = balance / 1_000_000_000;
    throw new Error(
      `Wallet needs more SOL before SAP registration. Current balance: ${currentSol.toFixed(6)} SOL; recommended minimum: ${neededSol.toFixed(3)} SOL. Fund ${walletPublicKey.toBase58()} and run npm run register again.`
    );
  }

  return balance;
}
