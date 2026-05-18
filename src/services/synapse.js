/**
 * SynapseAgentClient
 *
 * Wraps the @oobe-protocol-labs/synapse-sap-sdk to handle:
 *   - Agent registration on Synapse Agent Protocol (SAP) mainnet
 *   - x402 escrow creation and payment header generation
 *   - Settlement of calls on-chain
 *   - Synapse Sentinel agent service calls (bounty requirement)
 *   - Tool discovery via SAP indexes
 */

import { createRequire } from "module";
import { Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import {
  assertRegistrationBalance,
  buildAgentRegistration,
  registerAgentCompat,
} from "./sap-registration.js";

const require = createRequire(import.meta.url);
const { SapClient, SapConnection } = require("@oobe-protocol-labs/synapse-sap-sdk");

export class SynapseAgentClient {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.agentPda = null;
    this.escrowCtx = null;
    this.settlementLog = [];
  }

  async init() {
    console.log("[Synapse] Initializing SAP client...");

    const keypairData = JSON.parse(fs.readFileSync(this.config.walletPath, "utf-8"));
    this.keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

    const { client } = SapConnection.fromKeypair(
      this.config.rpcUrl,
      this.keypair
    );
    this.client = client;

    console.log(`[Synapse] Wallet: ${this.keypair.publicKey.toBase58()}`);
    return this;
  }

  async registerAgent() {
    console.log("[Synapse] Checking agent registration...");

    try {
      const existing = await this.client.agent.fetch();
      if (existing) {
        console.log(`[Synapse] Agent already registered: ${existing.name}`);
        this.agentPda = existing.pubkey ?? this.keypair.publicKey;
        return { alreadyExists: true, agent: existing };
      }
    } catch {
    }

    console.log(`[Synapse] Registering agent: ${this.config.agentName}`);

    await assertRegistrationBalance(
      this.client,
      this.keypair.publicKey,
      this.config.minRegistrationLamports ?? 50_000_000
    );

    const result = await registerAgentCompat(
      this.client,
      this.keypair.publicKey,
      buildAgentRegistration(this.config)
    );

    console.log(`[Synapse] Agent registered! TX: ${result.txSignature ?? "N/A"}`);
    this.agentPda = result.agentPda ?? this.keypair.publicKey;
    return { alreadyExists: false, result };
  }

  async setupEscrowWithSentinel() {
    const sentinelPubkey = new PublicKey(this.config.sentinelAddress);
    console.log(`[Synapse] Setting up escrow with Sentinel: ${this.config.sentinelAddress}`);

    try {
      const balance = await this.client.x402.getBalance(sentinelPubkey);
      if (balance && !balance.isExpired && balance.affordableCalls > 0) {
        console.log(`[Synapse] Existing Sentinel escrow: ${balance.affordableCalls} calls remaining`);
        this.escrowCtx = { existing: true, balance };
        return balance;
      }
    } catch {
    }

    console.log(`[Synapse] Creating new escrow — depositing ${this.config.escrowDepositLamports} lamports`);

    const ctx = await this.client.x402.preparePayment(sentinelPubkey, {
      pricePerCall: 1_000,
      maxCalls: 500,
      deposit: this.config.escrowDepositLamports,
      expiresAt: 0,
    });

    console.log(`[Synapse] Escrow created: ${ctx.escrowPda.toBase58()}`);
    console.log(`[Synapse] TX: ${ctx.txSignature}`);

    this.escrowCtx = ctx;
    return ctx;
  }

  buildPaymentHeaders() {
    if (!this.escrowCtx || this.escrowCtx.existing) {
      return {};
    }

    return this.client.x402.buildPaymentHeaders(this.escrowCtx);
  }

  async callSentinelService(agentToVerify) {
    console.log(`[Synapse] Calling Sentinel to verify agent: ${agentToVerify}`);

    const sentinelEndpoint = `https://explorer.oobeprotocol.ai/agents/${this.config.sentinelAddress}`;

    try {
      const headers = this.buildPaymentHeaders() || {};

      const resp = await fetch(`${sentinelEndpoint}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          agentAddress: agentToVerify,
          action: "verify_identity",
        }),
      });

      const result = resp.ok ? await resp.json().catch(() => ({})) : {};
      console.log(`[Synapse] Sentinel response: ${resp.status}`);

      await this.settleCall(this.config.sentinelAddress, 1, "sentinel_verify");

      return {
        success: resp.ok,
        status: resp.status,
        data: result,
      };
    } catch (err) {
      console.warn(`[Synapse] Sentinel call error (non-fatal): ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async settleCall(agentAddress, callCount, serviceData) {
    console.log(`[Synapse] Settling ${callCount} call(s) for ${serviceData}`);

    try {
      const agentWallet = new PublicKey(agentAddress);
      const receipt = await this.client.x402.settle(
        agentWallet,
        callCount,
        `agenticbro:${serviceData}:${Date.now()}`
      );

      const entry = {
        ts: new Date().toISOString(),
        agent: agentAddress,
        callCount,
        serviceData,
        amount: receipt.amount?.toString(),
        txSignature: receipt.txSignature,
        callsSettled: receipt.callsSettled,
      };

      this.settlementLog.push(entry);
      console.log(`[Synapse] Settled! TX: ${receipt.txSignature} | Amount: ${receipt.amount?.toString()} lamports`);
      return entry;
    } catch (err) {
      console.error(`[Synapse] Settlement failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async discoverTools(protocol = "agenticbro") {
    console.log(`[Synapse] Discovering tools for protocol: ${protocol}`);

    try {
      const tools = await this.client.discovery.findByProtocol(protocol);
      console.log(`[Synapse] Discovered ${tools?.length ?? 0} tools`);
      return tools ?? [];
    } catch (err) {
      console.warn(`[Synapse] Tool discovery error: ${err.message}`);
      return [];
    }
  }

  async writeSession(sessionId, content) {
    try {
      const session = await this.client.session.start(sessionId);
      await this.client.session.write(session, content);
      console.log(`[Synapse] Session written: ${sessionId}`);
      return session;
    } catch (err) {
      console.warn(`[Synapse] Session write error: ${err.message}`);
      return null;
    }
  }

  getWalletAddress() {
    return this.keypair?.publicKey?.toBase58() ?? null;
  }

  getSettlementLog() {
    return this.settlementLog;
  }

  getTotalSettled() {
    return this.settlementLog.reduce((sum, e) => sum + (parseInt(e.amount ?? 0)), 0);
  }
}
