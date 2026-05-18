#!/usr/bin/env node
/**
 * src/agent/run.js
 *
 * Entry point for the autonomous workflow.
 * Usage:
 *   node src/agent/run.js --once   (run one cycle and exit)
 *   node src/agent/run.js --loop   (run continuously)
 */

import { WorkflowEngine } from "./workflow.js";

const args = process.argv.slice(2);
const mode = args.includes("--once") ? "once" : args.includes("--loop") ? "loop" : "once";

const engine = new WorkflowEngine();

if (mode === "once") {
  engine.runOnce().catch((err) => {
    console.error("Fatal workflow error:", err);
    process.exit(1);
  });
} else {
  engine.runLoop().catch((err) => {
    console.error("Fatal workflow error:", err);
    process.exit(1);
  });
}
