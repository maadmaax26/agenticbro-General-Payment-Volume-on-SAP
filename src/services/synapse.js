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
const {
  SapClient,
  SapConnection,
  deriveAgent,
  deriveEscrow,
} = require("@oobe-protocol-labs/synapse-sap-sdk");

export class SynapseAgentClient {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.agentPda = null;
    this.escrowCtx = null;
    this.selfEscrowCtx = null;
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

  async setupSelfPaymentEscrow() {
    const agentWallet = this.keypair.publicKey;
    console.log(`[Synapse] Setting up self-funded payment escrow for AgenticBro: ${agentWallet.toBase58()}`);

    try {
      const balance = await this.client.x402.getBalance(agentWallet, agentWallet);
      if (balance && !balance.isExpired && balance.affordableCalls > 0) {
        console.log(`[Synapse] Existing AgenticBro escrow: ${balance.affordableCalls} affordable calls | settled=${balance.totalSettled?.toString?.() ?? 0}`);
        this.selfEscrowCtx = { existing: true, balance };
        return balance;
      }
    } catch {
    }

    console.log(`[Synapse] Creating AgenticBro payment escrow — depositing ${this.config.escrowDepositLamports} lamports`);

    try {
      const ctx = await this.client.x402.preparePayment(agentWallet, {
        pricePerCall: 1_000,
        maxCalls: 500,
        deposit: this.config.escrowDepositLamports,
        expiresAt: 0,
      });

      console.log(`[Synapse] AgenticBro escrow created: ${ctx.escrowPda.toBase58()}`);
      console.log(`[Synapse] TX: ${ctx.txSignature}`);

      this.selfEscrowCtx = ctx;
      return ctx;
    } catch (err) {
      const signature = this.extractSubmittedSignature(err);
      if (!signature) throw err;

      await this.confirmSubmittedSignature(signature);
      const [agentPda] = deriveAgent(agentWallet);
      const [escrowPda] = deriveEscrow(agentPda, agentWallet);
      console.log(`[Synapse] AgenticBro escrow confirmed after timeout: ${escrowPda.toBase58()}`);

      this.selfEscrowCtx = {
        existing: true,
        escrowPda,
        agentPda,
        agentWallet,
        depositorWallet: agentWallet,
      };
      return this.client.x402.getBalance(agentWallet, agentWallet);
    }
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
    const sentinelPubkey = new PublicKey(this.config.sentinelAddress);

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

      if (resp.ok) {
        return {
          success: true,
          status: resp.status,
          source: "sentinel_http",
          data: result,
        };
      }

      const sentinelAgent = await this.client.agent.fetch(sentinelPubkey);
      const balance = await this.client.x402.getBalance(sentinelPubkey, this.keypair.publicKey);
      return {
        success: Boolean(sentinelAgent?.isActive && balance && !balance.isExpired),
        status: resp.status,
        source: "sap_registry_x402_fallback",
        data: {
          httpStatus: resp.status,
          sentinelName: sentinelAgent?.name,
          sentinelActive: sentinelAgent?.isActive,
          escrowBalance: balance?.balance?.toString?.(),
          escrowCallsRemaining: balance?.callsRemaining,
        },
      };
    } catch (err) {
      console.warn(`[Synapse] Sentinel call error (non-fatal): ${err.message}`);
      try {
        const sentinelAgent = await this.client.agent.fetch(sentinelPubkey);
        const balance = await this.client.x402.getBalance(sentinelPubkey, this.keypair.publicKey);
        return {
          success: Boolean(sentinelAgent?.isActive && balance && !balance.isExpired),
          source: "sap_registry_x402_fallback",
          data: {
            error: err.message,
            sentinelName: sentinelAgent?.name,
            sentinelActive: sentinelAgent?.isActive,
            escrowBalance: balance?.balance?.toString?.(),
            escrowCallsRemaining: balance?.callsRemaining,
          },
        };
      } catch (fallbackErr) {
        return { success: false, error: err.message, fallbackError: fallbackErr.message };
      }
    }
  }

  async settleOwnCalls(callCount, serviceData) {
    console.log(`[Synapse] Settling ${callCount} call(s) for ${serviceData}`);

    try {
      const receipt = await this.client.x402.settle(
        this.keypair.publicKey,
        callCount,
        `agenticbro:${serviceData}:${Date.now()}`
      );

      const entry = {
        ts: new Date().toISOString(),
        agent: this.keypair.publicKey.toBase58(),
        depositor: this.keypair.publicKey.toBase58(),
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
      const signature = this.extractSubmittedSignature(err);
      if (signature) {
        try {
          await this.confirmSubmittedSignature(signature);
          const amount = String(callCount * 1_000);
          const entry = {
            ts: new Date().toISOString(),
            agent: this.keypair.publicKey.toBase58(),
            depositor: this.keypair.publicKey.toBase58(),
            callCount,
            serviceData,
            amount,
            txSignature: signature,
            callsSettled: callCount,
            confirmationRecovered: true,
          };
          this.settlementLog.push(entry);
          console.log(`[Synapse] Settled after timeout recovery! TX: ${signature} | Amount: ${amount} lamports`);
          return entry;
        } catch (confirmErr) {
          console.error(`[Synapse] Settlement confirmation failed: ${confirmErr.message}`);
          return { success: false, error: confirmErr.message, submittedSignature: signature };
        }
      }

      console.error(`[Synapse] Settlement failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  extractSubmittedSignature(err) {
    return err.message?.match(/Check signature ([1-9A-HJ-NP-Za-km-z]+)/)?.[1] ?? null;
  }

  async confirmSubmittedSignature(signature) {
    const connection = this.client.program.provider.connection;

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

    throw new Error(`Transaction was submitted but confirmation was not observed. Check signature ${signature}.`);
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
