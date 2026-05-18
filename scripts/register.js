#!/usr/bin/env node
/**
 * scripts/register.js
 *
 * Registers the AgenticBro agent on SAP mainnet with:
 *   - Agent identity (name, description, capabilities)
 *   - Tool schemas for scam detection
 *   - Pricing tiers
 *   - Protocol index entries (for discovery)
 */

// NOTE: The SDK ships a broken ESM build (bare directory imports throughout
// dist/esm). We load it via createRequire so Node uses the working CJS build
// (dist/cjs/index.js) routed through the package's "exports.require" map.
import { createRequire } from "module";
import { Keypair } from "@solana/web3.js";
import { loadConfig } from "../src/utils/config.js";
import {
  assertRegistrationBalance,
  buildAgentRegistration,
  registerAgentCompat,
} from "../src/services/sap-registration.js";
import fs from "fs";

const require = createRequire(import.meta.url);
const { SapConnection } = require("@oobe-protocol-labs/synapse-sap-sdk");

const config = loadConfig();

console.log("\n╔══════════════════════════════════════════════════╗");
console.log("║  AgenticBro — SAP Agent Registration            ║");
console.log("╚══════════════════════════════════════════════════╝\n");

async function main() {
  // Load wallet
  const keypairData = JSON.parse(fs.readFileSync(config.walletPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  console.log(`Wallet: ${keypair.publicKey.toBase58()}`);

  // Connect to Synapse RPC
  console.log(`RPC: ${config.synapseRpcUrl}`);
  const { client } = SapConnection.fromKeypair(config.synapseRpcUrl, keypair);

  // Check for existing registration
  try {
    const existing = await client.agent.fetch();
    if (existing) {
      console.log(`\n✅ Agent already registered: ${existing.name}`);
      console.log(`   Address: ${keypair.publicKey.toBase58()}`);
      console.log(`   Active: ${existing.isActive}`);
      console.log(`   Capabilities: ${existing.capabilities?.length ?? 0}`);
      return;
    }
  } catch {
    // Not registered yet
  }

  console.log("\nRegistering agent on SAP mainnet...");
  await assertRegistrationBalance(client, keypair.publicKey, config.minRegistrationLamports);

  // Register with full capability set. The SDK builder currently emits
  // camelCase nested struct fields, but this IDL expects snake_case.
  const result = await registerAgentCompat(
    client,
    keypair.publicKey,
    buildAgentRegistration(config, { includeNews: true })
  );

  console.log(`\n✅ Agent registered!`);
  console.log(`   TX: ${result?.txSignature ?? "N/A"}`);
  console.log(`   PDA: ${keypair.publicKey.toBase58()}`);
  console.log(`\n🔍 View on Synapse Explorer:`);
  console.log(`   https://explorer.oobeprotocol.ai/agents/${keypair.publicKey.toBase58()}`);

  // Register tools on SAP tool registry
  console.log("\nPublishing tool schemas...");
  try {
    await client.tools.publish({
      name: "detect_scam_token",
      description: "Analyze a Solana token address for scam indicators",
      schema: {
        type: "object",
        properties: {
          address: { type: "string", description: "Solana token mint address" },
          includeTwitter: { type: "boolean", description: "Include social signal scan" },
        },
        required: ["address"],
      },
    });
    console.log("✅ Tool schema published: detect_scam_token");
  } catch (err) {
    console.warn(`Tool publish warning: ${err.message}`);
  }

  console.log("\n🚀 Ready to run the autonomous workflow:");
  console.log("   npm run workflow:loop");
}

main().catch((err) => {
  console.error("\n❌ Registration failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
