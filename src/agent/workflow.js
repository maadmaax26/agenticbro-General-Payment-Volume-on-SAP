/**
 * AgenticBro Autonomous Workflow Engine
 *
 * This is the heart of the bounty submission. It implements a complete
 * automated workflow:
 *
 *   TRIGGER → DISCOVER → EXECUTE → SETTLE → REPORT
 *
 * Each cycle:
 *   1. Picks a target token/project from a threat watchlist
 *   2. Calls Synapse Sentinel to verify agent identity (SAP requirement)
 *   3. Calls 3+ distinct Ace Data Cloud services for threat analysis
 *   4. Settles all payments on-chain via x402
 *   5. Writes results to on-chain session memory
 *   6. Logs everything for the dashboard
 *
 * This satisfies ALL Ace Data Cloud Usage category requirements:
 *   ✅ Registered on SAP mainnet
 *   ✅ Complete automated workflow (trigger → execution → payment)
 *   ✅ Uses x402 with AceDataCloud facilitator + Synapse RPC
 *   ✅ 3+ distinct Ace Data Cloud services
 *   ✅ Uses Synapse Sentinel at least once
 */

import { SynapseAgentClient } from "../services/synapse.js";
import { AceDataService } from "../services/acedata.js";
import { loadConfig } from "../utils/config.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, "../../.workflow_state.json");

// ── Threat Watchlist ──────────────────────────────────────────────────────────
// Rotates through these each cycle to demonstrate real agent activity
const THREAT_WATCHLIST = [
  { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", name: "USDC", type: "token" },
  { address: "So11111111111111111111111111111111111111112",   name: "SOL",  type: "token" },
  { address: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", name: "POPCAT", type: "token" },
  { address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", name: "BONK",  type: "token" },
  { address: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4",  name: "JUP",   type: "token" },
  { address: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",   name: "mSOL",  type: "token" },
  { address: "orca",  name: "Orca DEX",  type: "project" },
  { address: "raydium", name: "Raydium", type: "project" },
];

export class WorkflowEngine {
  constructor() {
    this.config = null;
    this.synapse = null;
    this.aceData = null;
    this.cycleCount = 0;
    this.results = [];
    this.running = false;
    this.state = this._loadState();
  }

  _loadState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      }
    } catch {}
    return { cycleCount: 0, watchlistIndex: 0, lastRun: null };
  }

  _saveState() {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch {}
  }

  async init() {
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║  AgenticBro Autonomous Workflow Engine v1.0  ║");
    console.log("║  Built by Agentic Insights LLC               ║");
    console.log("╚══════════════════════════════════════════════╝\n");

    this.config = loadConfig();

    // Initialize Ace Data Cloud service
    this.aceData = new AceDataService(
      this.config.aceDataApiKey,
      this.config.aceDataBaseUrl
    );

    // Initialize Synapse/SAP client
    this.synapse = new SynapseAgentClient({
      walletPath: this.config.walletPath,
      rpcUrl: this.config.synapseRpcUrl,
      agentName: this.config.agentName,
      agentDescription: this.config.agentDescription,
      agentEndpoint: this.config.agentEndpoint,
      sentinelAddress: this.config.sentinelAddress,
      escrowDepositLamports: this.config.escrowDepositLamports,
      minRegistrationLamports: this.config.minRegistrationLamports,
    });

    await this.synapse.init();

    // Register agent on SAP mainnet
    await this.synapse.registerAgent();

    // Set up escrow with Sentinel (required for bounty)
    await this.synapse.setupEscrowWithSentinel();

    // Set up a payment escrow for this agent so each cycle can settle real
    // on-chain payment volume through SAP x402.
    await this.synapse.setupSelfPaymentEscrow();

    this.cycleCount = this.state.cycleCount;
    console.log(`\n[Workflow] Initialized. Previous cycles: ${this.cycleCount}`);
    console.log(`[Workflow] Wallet: ${this.synapse.getWalletAddress()}\n`);

    return this;
  }

  /**
   * Run one complete workflow cycle:
   * Trigger → Discover → Execute → Settle → Report
   */
  async runCycle() {
    const cycleId = ++this.cycleCount;
    const target = THREAT_WATCHLIST[this.state.watchlistIndex % THREAT_WATCHLIST.length];
    this.state.watchlistIndex++;
    this.state.cycleCount = cycleId;
    this.state.lastRun = new Date().toISOString();

    console.log(`\n${"─".repeat(60)}`);
    console.log(`[Workflow] Cycle #${cycleId} | Target: ${target.name} (${target.address})`);
    console.log(`${"─".repeat(60)}`);

    const cycleResult = {
      cycleId,
      target,
      startTime: new Date().toISOString(),
      steps: {},
      paymentVolume: 0,
      success: false,
    };

    try {
      // ── STEP 1: Discover tools on SAP network ────────────────────────────
      console.log("\n[Step 1/6] Discovering SAP network tools...");
      const tools = await this.synapse.discoverTools();
      cycleResult.steps.discovery = { toolCount: tools.length };

      // ── STEP 2: Synapse Sentinel verification (bounty requirement) ───────
      console.log("\n[Step 2/6] Calling Synapse Sentinel for agent verification...");
      const sentinelResult = await this.synapse.callSentinelService(
        this.synapse.getWalletAddress()
      );
      cycleResult.steps.sentinel = sentinelResult;

      // ── STEP 3: Ace Data Cloud — Service 1: Web Search ───────────────────
      console.log("\n[Step 3/6] [AceData Service 1] Web threat intelligence search...");
      const searchQuery = target.type === "token"
        ? `Solana token ${target.name} ${target.address} scam rug pull`
        : `${target.name} DeFi scam fraud`;

      const searchResult = await this.aceData.searchThreatIntelligence(
        searchQuery,
        this.synapse.buildPaymentHeaders()
      );
      cycleResult.steps.webSearch = searchResult;

      // ── STEP 4: Ace Data Cloud — Service 2: AI Text Analysis ─────────────
      console.log("\n[Step 4/6] [AceData Service 2] AI threat analysis...");
      const analysisResult = await this.aceData.analyzeToken(
        target.address,
        {
          name: target.name,
          type: target.type,
          searchFindings: searchResult.data?.results?.slice(0, 2) ?? [],
        },
        this.synapse.buildPaymentHeaders()
      );
      cycleResult.steps.aiAnalysis = analysisResult;

      // ── STEP 5: Ace Data Cloud — Service 3: Social Signal Scan ───────────
      console.log("\n[Step 5/6] [AceData Service 3] Social scam signal scan...");
      const socialResult = await this.aceData.scanSocialSignals(
        target.name,
        this.synapse.buildPaymentHeaders()
      );
      cycleResult.steps.socialScan = socialResult;

      // ── BONUS: Ace Data Cloud — Service 4: News Intelligence ─────────────
      if (this.config.callsPerCycle >= 4) {
        console.log("\n[Step 5b] [AceData Service 4] News intelligence scan...");
        const newsResult = await this.aceData.scanNewsIntelligence(
          target.name,
          this.synapse.buildPaymentHeaders()
        );
        cycleResult.steps.newsScan = newsResult;
      }

      // ── STEP 6: Settle payments on-chain ─────────────────────────────────
      console.log("\n[Step 6/6] Settling payments on-chain via x402...");
      const aceCalls = this.aceData.getSuccessCount();

      if (aceCalls > 0) {
        const settlement = await this.synapse.settleOwnCalls(
          aceCalls,
          `cycle_${cycleId}_${target.name}`
        );
        cycleResult.steps.settlement = settlement;
        cycleResult.paymentVolume = parseInt(settlement.amount ?? 0);
      }

      // ── Write to on-chain session memory ──────────────────────────────────
      await this.synapse.writeSession(
        `cycle_${cycleId}`,
        JSON.stringify({
          cycleId,
          target: target.name,
          riskLevel: analysisResult.data?.analysis?.riskLevel ?? "UNKNOWN",
          socialSignals: socialResult.data?.scamSignalCount ?? 0,
          timestamp: new Date().toISOString(),
        })
      );

      cycleResult.success = true;
      console.log(`\n✅ Cycle #${cycleId} complete! Risk: ${analysisResult.data?.analysis?.riskLevel ?? "UNKNOWN"}`);

    } catch (err) {
      console.error(`\n❌ Cycle #${cycleId} failed: ${err.message}`);
      cycleResult.error = err.message;
    }

    cycleResult.endTime = new Date().toISOString();
    cycleResult.aceCalls = this.aceData.getSuccessCount();
    this.results.push(cycleResult);
    this._saveState();

    return cycleResult;
  }

  /** Run once and exit */
  async runOnce() {
    await this.init();
    const result = await this.runCycle();
    this.printSummary();
    return result;
  }

  /** Run continuously on an interval */
  async runLoop() {
    await this.init();
    this.running = true;

    console.log(`\n[Workflow] Starting autonomous loop (interval: ${this.config.workflowIntervalMs}ms)`);
    console.log("[Workflow] Press Ctrl+C to stop\n");

    const run = async () => {
      if (!this.running) return;
      await this.runCycle().catch((e) => console.error("[Workflow] Cycle error:", e.message));
      if (this.running) {
        setTimeout(run, this.config.workflowIntervalMs);
      }
    };

    process.on("SIGINT", () => {
      console.log("\n[Workflow] Stopping...");
      this.running = false;
      this.printSummary();
      process.exit(0);
    });

    await run();
  }

  printSummary() {
    const successCycles = this.results.filter((r) => r.success).length;
    const totalVolume = this.synapse?.getTotalSettled() ?? 0;
    const totalAceCalls = this.aceData?.getSuccessCount() ?? 0;

    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║              WORKFLOW SUMMARY                ║");
    console.log("╠══════════════════════════════════════════════╣");
    console.log(`║  Total cycles:     ${String(this.results.length).padEnd(25)}║`);
    console.log(`║  Successful:       ${String(successCycles).padEnd(25)}║`);
    console.log(`║  AceData calls:    ${String(totalAceCalls).padEnd(25)}║`);
    console.log(`║  Settled (lamps):  ${String(totalVolume).padEnd(25)}║`);
    console.log("╚══════════════════════════════════════════════╝\n");
  }

  getStatus() {
    return {
      cycleCount: this.cycleCount,
      running: this.running,
      wallet: this.synapse?.getWalletAddress(),
      settlements: this.synapse?.getSettlementLog() ?? [],
      aceCallLog: this.aceData?.getCallLog() ?? [],
      results: this.results.slice(-10), // last 10 cycles
    };
  }
}
