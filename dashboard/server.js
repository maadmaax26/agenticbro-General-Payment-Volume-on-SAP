/**
 * dashboard/server.js
 *
 * Real-time monitoring dashboard for the AgenticBro bounty agent.
 * Runs the workflow engine in-process and streams live updates to the browser.
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { WorkflowEngine } from "../src/agent/workflow.js";
import { loadConfig } from "../src/utils/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const app = express();
const PORT = config.dashboardPort;

// SSE clients
const clients = new Set();

// Shared workflow engine instance
const engine = new WorkflowEngine();
let initialized = false;
let initError = null;

// ── SSE endpoint ──────────────────────────────────────────────────────────────
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  clients.add(res);
  req.on("close", () => clients.delete(res));

  // Send current state immediately
  res.write(`data: ${JSON.stringify({ type: "state", payload: getStatus() })}\n\n`);
});

function broadcast(event) {
  for (const client of clients) {
    client.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

// ── API endpoints ─────────────────────────────────────────────────────────────
app.get("/api/status", (req, res) => {
  res.json(getStatus());
});

app.post("/api/run-cycle", express.json(), async (req, res) => {
  if (!initialized) {
    return res.status(503).json({ error: "Agent not initialized yet" });
  }
  broadcast({ type: "cycle_start", payload: { time: new Date().toISOString() } });
  try {
    const result = await engine.runCycle();
    broadcast({ type: "cycle_complete", payload: result });
    res.json({ success: true, result });
  } catch (err) {
    broadcast({ type: "cycle_error", payload: { error: err.message } });
    res.status(500).json({ error: err.message });
  }
});

function getStatus() {
  return {
    initialized,
    initError,
    ...engine.getStatus(),
    wallet: engine.synapse?.getWalletAddress() ?? null,
    time: new Date().toISOString(),
  };
}

// ── Static dashboard HTML ─────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/demo", (req, res) => {
  res.sendFile(path.join(__dirname, "demo.html"));
});

async function initializeEngine(port) {
  try {
    await engine.init();
    initialized = true;
    broadcast({ type: "initialized", payload: getStatus() });
    console.log("[Dashboard] Agent initialized and ready");

    // Start the autonomous loop
    engine.running = true;
    const loop = async () => {
      if (!engine.running) return;
      broadcast({ type: "cycle_start", payload: { time: new Date().toISOString() } });
      try {
        const result = await engine.runCycle();
        broadcast({ type: "cycle_complete", payload: result });
      } catch (err) {
        broadcast({ type: "cycle_error", payload: { error: err.message } });
      }
      if (engine.running) setTimeout(loop, config.workflowIntervalMs);
    };
    setTimeout(loop, 3000); // First cycle after 3s
  } catch (err) {
    initError = err.message;
    broadcast({ type: "init_error", payload: { error: err.message } });
    console.error("[Dashboard] Init error:", err.message);
  }
}

function listen(port) {
  const server = app.listen(port);

  server.once("listening", () => {
    config.dashboardPort = port;
    console.log(`\n🚀 AgenticBro Dashboard: http://localhost:${port}\n`);
    initializeEngine(port);
  });

  server.once("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[Dashboard] Port ${port} is already in use. The dashboard is expected at http://localhost:${port}; stop the existing process before starting another one.`
      );
      process.exit(1);
      return;
    }

    throw err;
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
listen(PORT);
