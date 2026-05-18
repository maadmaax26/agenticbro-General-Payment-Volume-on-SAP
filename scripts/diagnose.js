import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { SapConnection } from "@oobe-protocol-labs/synapse-sap-sdk";
import { loadConfig } from "../src/utils/config.js";
import fs from "fs";

const config = loadConfig();
const SAP_PROGRAM_ID = "SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ";

const keypairData = JSON.parse(fs.readFileSync(config.walletPath, "utf-8"));
const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

console.log("Wallet: ", keypair.publicKey.toBase58());
console.log("RPC:    ", config.synapseRpcUrl);

const conn = new Connection(config.synapseRpcUrl, "confirmed");

// 1. RPC health
try {
  const v = await conn.getVersion();
  console.log("✅ RPC alive — solana-core:", v["solana-core"]);
} catch (e) {
  console.error("❌ RPC unreachable:", e.message);
}

// 2. Balance
const bal = await conn.getBalance(keypair.publicKey);
console.log(`Balance: ${(bal/1e9).toFixed(6)} SOL`);
if (bal === 0) console.error("❌ Wallet is empty — fund it before registering");

// 3. SAP program on this cluster
const info = await conn.getAccountInfo(new PublicKey(SAP_PROGRAM_ID)).catch(() => null);
if (info?.executable) {
  console.log("✅ SAP program found on cluster");
} else {
  console.error("❌ SAP program NOT on this cluster — staging RPC likely doesn't have it");
  console.error("   Switch SYNAPSE_RPC_URL to: https://api.mainnet-beta.solana.com");
}
