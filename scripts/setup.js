#!/usr/bin/env node
/**
 * scripts/setup.js
 *
 * One-time setup script:
 *   1. Generates a new Solana keypair (or loads existing)
 *   2. Shows the wallet address for funding
 *   3. Verifies environment is ready
 *   4. Creates .env from .env.example if not present
 */

import { Keypair } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WALLET_PATH = path.join(__dirname, "../wallet.json");
const ENV_PATH = path.join(__dirname, "../.env");
const ENV_EXAMPLE_PATH = path.join(__dirname, "../.env.example");

console.log("\n╔══════════════════════════════════════════════════╗");
console.log("║  AgenticBro Bounty Agent — Setup                ║");
console.log("╚══════════════════════════════════════════════════╝\n");

// 1. Create .env from example if it doesn't exist
if (!fs.existsSync(ENV_PATH)) {
  if (fs.existsSync(ENV_EXAMPLE_PATH)) {
    fs.copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
    console.log("✅ Created .env from .env.example");
    console.log("   → Edit .env and fill in your API keys before proceeding!\n");
  }
} else {
  console.log("✅ .env already exists");
}

// 2. Generate or load wallet
let keypair;
if (fs.existsSync(WALLET_PATH)) {
  const data = JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8"));
  keypair = Keypair.fromSecretKey(Uint8Array.from(data));
  console.log("✅ Loaded existing wallet");
} else {
  keypair = Keypair.generate();
  fs.writeFileSync(WALLET_PATH, JSON.stringify(Array.from(keypair.secretKey)));
  console.log("✅ Generated new wallet — saved to wallet.json");
  console.log("   ⚠️  IMPORTANT: Back up wallet.json securely!");
}

const pubkey = keypair.publicKey.toBase58();
console.log(`\n📬 Wallet Address: ${pubkey}`);

// 3. Update .env with wallet pubkey
if (fs.existsSync(ENV_PATH)) {
  let envContent = fs.readFileSync(ENV_PATH, "utf-8");
  envContent = envContent.replace(
    /^AGENT_WALLET_PUBKEY=.*$/m,
    `AGENT_WALLET_PUBKEY=${pubkey}`
  );
  fs.writeFileSync(ENV_PATH, envContent);
  console.log("✅ Updated AGENT_WALLET_PUBKEY in .env");
}

// 4. Show funding instructions
console.log("\n📋 Next Steps:");
console.log("─".repeat(50));
console.log("1. Fund your wallet with SOL:");
console.log(`   • Mainnet: Send ~0.1 SOL to ${pubkey}`);
console.log("   • Devnet:  Run: solana airdrop 2 " + pubkey + " --url devnet");
console.log("");
console.log("2. Set up API keys in .env:");
console.log("   • SYNAPSE_RPC_URL — Get from https://synapse.oobeprotocol.ai/");
console.log("   • ACE_DATA_API_KEY — Get from https://platform.acedata.cloud (free credits on signup!)");
console.log("");
console.log("3. Register your agent on SAP:");
console.log("   npm run register");
console.log("");
console.log("4. Run the autonomous workflow:");
console.log("   npm run workflow:loop");
console.log("");
console.log("5. View the dashboard:");
console.log("   npm run dashboard");
console.log("─".repeat(50));
