# AgenticBro Bounty Agent — Cowork Handoff Plan

**Project:** OOBE Protocol + Ace Data Cloud Bounty Submission
**Goal:** Get the autonomous agent installed, registered on-chain, and running
**Estimated time:** 10–15 minutes of active work (most time is waiting for npm install)

---

## Before you start — what Cowork needs from you

You will need to manually provide two things that cannot be automated:

1. **Your Solana wallet funded with ~0.1 SOL**
   - The setup script generates the wallet. You fund it. (~$15–20 USD worth)
   - Devnet is free if you want to test first (no real money)

2. **Two free API keys** (get these before handing off to Cowork):
   - **Synapse RPC key** → https://synapse.oobeprotocol.ai/ (free tier, sign up)
   - **Ace Data Cloud key** → https://platform.acedata.cloud (free credits auto on signup)

---

## Phase 1 — Environment check

**Cowork task:**
```
Check that Node.js 20 or higher is installed. Run `node --version` and `npm --version`.
If Node is below version 20, tell me what version is installed and stop.
If Node 20+ is present, confirm and proceed to Phase 2.
```

**Expected output:** Node version ≥ 20.x.x, npm version ≥ 9.x.x

---

## Phase 2 — Install dependencies

**Cowork task:**
```
In the agentcbro-bounty folder, run `npm install`.
Wait for it to complete. Report how many packages were installed and whether
there were any errors. Ignore deprecation warnings — those are fine.
If there are actual errors (not warnings), show me the error and stop.
```

**Expected output:** "added NNN packages" with no ERR! lines

---

## Phase 3 — Generate wallet and create .env

**Cowork task:**
```
Run `node scripts/setup.js` in the agentcbro-bounty folder.
This will:
  - Generate a new Solana wallet and save it to wallet.json
  - Create .env from .env.example
  - Show the wallet public address

Copy the wallet address it shows and tell me what it is.
Do not proceed further until I confirm I've funded the wallet.
```

**What you do after:**
- Send ~0.1 SOL to the wallet address shown
- OR for devnet testing: `solana airdrop 2 <ADDRESS> --url devnet`
- Tell Cowork "wallet funded, proceed to Phase 4"

---

## Phase 4 — Configure .env

**Cowork task:**
```
Open the .env file in the agentcbro-bounty folder.
Fill in these values with the keys I provide:

  SYNAPSE_RPC_URL=<I will provide this>
  ACE_DATA_API_KEY=<I will provide this>

Leave all other values at their defaults for now.
After saving, read back the file and confirm both keys are set
(show the first 8 characters of each key, then "..." for the rest).
Do not show the full keys.
```

**What you do:** Paste your actual keys when Cowork asks. You can type them
directly in the Cowork chat — Cowork will write them into the file.

**Optional overrides to mention if you want them:**
- `SOLANA_CLUSTER=devnet` — use devnet instead of mainnet (free, no real SOL)
- `WORKFLOW_INTERVAL_MS=30000` — run every 30s instead of 60s (more volume)
- `AGENT_NAME=AgenticBro-Sentinel` — change the agent name if desired

---

## Phase 5 — Register agent on-chain

**Cowork task:**
```
Run `npm run register` in the agentcbro-bounty folder.
This registers the AgenticBro agent on Synapse Agent Protocol mainnet.

Wait for it to complete. It will either:
  a) Print "Agent registered!" with a transaction signature — success
  b) Print "Agent already registered" — also fine, agent exists
  c) Print an error — show me the full error and stop

If registration succeeded, find and show me the Synapse Explorer URL it prints
so I can verify the agent is live on-chain.
```

**Expected output:** A URL like `https://explorer.oobeprotocol.ai/agents/YOUR_ADDRESS`

**Verify:** Open that URL in a browser. You should see your AgenticBro agent listed.

---

## Phase 6 — Test one workflow cycle

**Cowork task:**
```
Run `npm run workflow:once` in the agentcbro-bounty folder.
This runs exactly one cycle of the autonomous workflow and exits.

Watch the output and report:
  - Did it call Synapse Sentinel? (look for "[Synapse] Calling Sentinel")
  - Did it call Ace Data Cloud services? (look for "[AceData:WebSearch]",
    "[AceData:TextGen]", "[AceData:Social]")
  - Did it settle on-chain? (look for "[Synapse] Settled! TX:")
  - What risk level did it assign to the target token?

If any step failed with an error (not just a warning), show me the full error.
Some AceData services may return 404 depending on your plan tier — that is
non-fatal and the workflow continues. What matters is WebSearch and TextGen succeed.
```

**Expected output:** All 3+ AceData services attempted, at least 2 succeed, settlement TX printed

---

## Phase 7 — Start the autonomous loop

**Cowork task:**
```
Start the autonomous workflow loop by running `npm run workflow:loop`
in the agentcbro-bounty folder, using a background process so it keeps running.

Use nohup or run it in a way that survives if this Cowork session ends:
  nohup npm run workflow:loop > workflow.log 2>&1 &

After starting it, show me the process ID (PID) and confirm the process is running
with `ps aux | grep workflow`.

Then tail the log to show me the first cycle completing:
  tail -f workflow.log

Let it run through at least one complete cycle, then stop tailing and report
what you saw.
```

**Expected:** Agent loops every 60 seconds, each cycle makes 3–4 AceData calls + 1 settlement

---

## Phase 8 — Launch the dashboard

**Cowork task:**
```
Start the monitoring dashboard by running `npm run dashboard` in the background:
  nohup npm run dashboard > dashboard.log 2>&1 &

Confirm it started by checking dashboard.log for "AgenticBro Dashboard: http://localhost:3333".
Tell me the dashboard is running and at what URL.
```

**What you do:** Open http://localhost:3333 in your browser to see the real-time UI.

---

## Phase 9 — Verify everything is working

**Cowork task:**
```
Do a final health check:

1. Run: ps aux | grep -E "workflow|dashboard" | grep -v grep
   → Both processes should be running

2. Run: tail -20 workflow.log
   → Should show recent cycle activity with timestamps

3. Run: cat .workflow_state.json
   → Should show cycleCount > 0

4. Show me a summary:
   - Total cycles completed
   - Last run timestamp
   - Whether settlements are appearing (look for "Settled! TX:" lines in workflow.log)
   - PID of workflow loop process
   - Dashboard URL

Report any issues you find.
```

---

## Stopping / restarting

To stop the workflow loop:
```
Kill the workflow process: kill <PID>
Or: pkill -f "workflow:loop"
```

To restart after a reboot:
```
cd agentcbro-bounty
nohup npm run workflow:loop > workflow.log 2>&1 &
nohup npm run dashboard > dashboard.log 2>&1 &
```

To check how many cycles have run:
```
cat .workflow_state.json
```

---

## Troubleshooting guide for Cowork

| Error | Likely cause | Fix |
|-------|-------------|-----|
| `Cannot find module` | npm install not run | Run `npm install` |
| `insufficient funds` | Wallet not funded | Add SOL to wallet |
| `401 Unauthorized` (AceData) | Wrong API key | Check ACE_DATA_API_KEY in .env |
| `403` or `429` (Synapse) | Bad or rate-limited RPC key | Check SYNAPSE_RPC_URL in .env |
| `Agent already registered` | Fine — idempotent | Not an error, continue |
| AceData 404 on social/news | Service not on your plan | Non-fatal, workflow continues |
| `wallet.json not found` | Setup script not run | Run `node scripts/setup.js` |

---

## What success looks like

After all phases complete:

- ✅ `wallet.json` exists in the project folder
- ✅ `.env` has real API keys set
- ✅ Agent is visible at `https://explorer.oobeprotocol.ai/agents/<YOUR_ADDRESS>`
- ✅ `workflow.log` shows cycles running with AceData calls and on-chain settlements
- ✅ `.workflow_state.json` shows `cycleCount` incrementing
- ✅ Dashboard at http://localhost:3333 shows live activity
- ✅ Both processes running in background (workflow + dashboard)

---

## Notes for Cowork

- This project uses ES modules (`"type": "module"` in package.json). All imports use `import`, not `require`.
- The `.env` file is gitignored — safe to write API keys there
- `wallet.json` contains a private key — never log its contents or write it anywhere else
- Settlement transactions can be verified on Solscan: `https://solscan.io/tx/<TX_SIGNATURE>`
- The Synapse Explorer shows agent registration: `https://explorer.oobeprotocol.ai/agents/<WALLET_PUBKEY>`
