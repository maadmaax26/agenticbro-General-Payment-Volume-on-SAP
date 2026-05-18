# AgenticBro Bounty Agent
## OOBE Protocol + Ace Data Cloud Bounty Submission

**Built by Agentic Insights LLC** — [@agenticbro](https://agenticbro.app)
**Category:** Ace Data Cloud Usage (x402 Facilitator) — targeting 1st place ($700)

---

## Overview

This is a production-ready autonomous agent that:

1. **Registers on SAP mainnet** with a full on-chain identity, capabilities, and pricing
2. **Calls Synapse Sentinel** for agent network verification (required)
3. **Calls 4 distinct Ace Data Cloud services** (exceeds the 3-minimum requirement):
   - 🔍 **Web Search** — threat intelligence discovery
   - 🧠 **AI Text Generation (GPT-4o-mini)** — token risk analysis reports
   - 🐦 **Twitter/X Social Scan** — social scam signal detection
   - 📰 **News Intelligence** — project reputation scanning
4. **Settles payments on-chain** via x402 with AceDataCloud's facilitator + Synapse RPC
5. **Runs autonomously** in a continuous loop (trigger → execute → settle, no human input)
6. **Writes results to on-chain session memory** after each cycle

---

## Prerequisites

- Node.js 20+
- ~0.1 SOL in a Solana wallet (for registration + escrow deposits)
- Synapse RPC API key (free tier: https://synapse.oobeprotocol.ai/)
- Ace Data Cloud API key (free credits on signup: https://platform.acedata.cloud)

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Generate wallet & create .env
```bash
node scripts/setup.js
```

### 3. Fill in .env
```bash
# Required:
SYNAPSE_RPC_URL=https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=YOUR_KEY
ACE_DATA_API_KEY=YOUR_ACE_DATA_KEY
```

### 4. Fund your wallet
Send ~0.1 SOL to the wallet address shown by setup.js.

### 5. Register your agent on SAP
```bash
npm run register
```

This registers your agent on-chain with:
- Name, description, capabilities
- x402 pricing tiers
- Tool schema publication
- Protocol index enrollment

### 6. Run the autonomous workflow

**Single cycle (test):**
```bash
npm run workflow:once
```

**Continuous loop (for maximum bounty volume):**
```bash
npm run workflow:loop
```

### 7. Launch the monitoring dashboard
```bash
npm run dashboard
# Open http://localhost:3333
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   WorkflowEngine                          │
│                                                          │
│  TRIGGER (timer/manual)                                  │
│      ↓                                                   │
│  [1] SAP: discoverTools()          ← tool registry       │
│      ↓                                                   │
│  [2] SAP: callSentinelService()    ← Sentinel agent      │
│      ↓                                                   │
│  [3] AceData: searchThreatIntel()  ← Web Search API      │
│      ↓                                                   │
│  [4] AceData: analyzeToken()       ← AI Text Gen API     │
│      ↓                                                   │
│  [5] AceData: scanSocialSignals()  ← Twitter API         │
│      ↓                                                   │
│  [6] AceData: scanNewsIntel()      ← News API            │
│      ↓                                                   │
│  [7] SAP: settleCall()             ← x402 on-chain       │
│      ↓                                                   │
│  [8] SAP: writeSession()           ← on-chain memory     │
└──────────────────────────────────────────────────────────┘
```

## Bounty Qualification Checklist

### Ace Data Cloud Usage Category

| Requirement | Status | Details |
|-------------|--------|---------|
| Registered on SAP mainnet | ✅ | `scripts/register.js` |
| Complete automated workflow | ✅ | `src/agent/workflow.js` |
| Account on Ace Data Cloud | ✅ | Sign up at platform.acedata.cloud |
| x402 with AceDataCloud facilitator + Synapse RPC | ✅ | `src/services/acedata.js` |
| 3+ distinct Ace Data Cloud services | ✅ | Web Search, Text Gen, Social, News (4 services) |
| Synapse Sentinel used at least once | ✅ | `synapse.callSentinelService()` per cycle |

---

## File Structure

```
agentcbro-bounty/
├── src/
│   ├── agent/
│   │   ├── run.js          # Entry point
│   │   └── workflow.js     # Core autonomous workflow engine
│   ├── services/
│   │   ├── acedata.js      # Ace Data Cloud API client (4 services)
│   │   └── synapse.js      # SAP/Synapse client wrapper
│   └── utils/
│       └── config.js       # Environment config loader
├── scripts/
│   ├── setup.js            # One-time wallet + env setup
│   └── register.js         # SAP agent registration
├── dashboard/
│   ├── server.js           # Express server with SSE
│   └── index.html          # Real-time monitoring UI
├── .env.example            # Environment template
├── package.json
└── README.md
```

---

## View on Synapse Explorer

After registration, your agent will be visible at:
```
https://explorer.oobeprotocol.ai/agents/YOUR_WALLET_PUBKEY
```

---

## Built with $AGNTCBRO

This submission is part of the broader **AgenticBro** scam detection platform by **Agentic Insights LLC**, featuring:
- 7-scanner system (Token, Website, Airdrop, Wallet, Trading Platform, Social, Phone)
- Core AI agent: Jeeevs
- $AGNTCBRO token on Solana
- Platform: https://agenticbro.app
