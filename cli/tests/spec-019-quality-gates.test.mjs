import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const nodeBin = process.execPath;

function realCodexPayloads(sessionId) {
  return {
    sessionStart: {
      hook_event_name: "SessionStart",
      session_id: sessionId,
      cwd: repoRoot,
      model: "gpt-5.4"
    },
    userPromptSubmit: {
      hook_event_name: "UserPromptSubmit",
      session_id: sessionId,
      turn_id: "turn-1",
      cwd: repoRoot,
      model: "gpt-5.4",
      prompt: "Always run node --test before finalize"
    },
    stop: {
      hook_event_name: "Stop",
      session_id: sessionId,
      turn_id: "turn-1",
      cwd: repoRoot,
      model: "gpt-5.4",
      stop_hook_active: false,
      last_assistant_message: "We will run node --test first and fix failures."
    }
  };
}

async function invokeHook({ hook, payload, storePath }) {
  const hookScript = path.join(repoRoot, "adapters/codex/bin/codex-memory-hook.mjs");
  const child = spawn(nodeBin, [hookScript, hook, "--store-path", storePath], {
    cwd: repoRoot,
    env: process.env
  });

  child.stdin.write(JSON.stringify(payload));
  child.stdin.end();

  const output = await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`hook process failed (code=${code}): ${stderr}`));
        return;
      }

      resolve(stdout);
    });
  });

  return JSON.parse(String(output).trim());
}

test("SPEC-019 quality-gates CLI evaluates release readiness evidence from benchmark + audit artifacts", async () => {
  const fixturePath = path.join(repoRoot, "adapters/codex/tests/fixtures/layer4-golden-path-session.json");
  const benchmarkCli = path.join(repoRoot, "cli/bin/codex-memory-benchmark.mjs");
  const gatesCli = path.join(repoRoot, "cli/bin/codex-memory-quality-gates.mjs");

  const benchmarkResult = spawnSync(nodeBin, [benchmarkCli, "--fixture", fixturePath, "--json"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  assert.equal(benchmarkResult.status, 0, benchmarkResult.stderr);

  const tmpRoot = await mkdtemp(path.join(tmpdir(), "codex-memory-spec019-"));
  const benchmarkPath = path.join(tmpRoot, "benchmark-report.json");
  await writeFile(benchmarkPath, benchmarkResult.stdout, "utf8");

  const storePath = await mkdtemp(path.join(tmpdir(), "codex-memory-spec019-store-"));
  const payloads = realCodexPayloads("s-spec-019-gates");

  await invokeHook({ hook: "SessionStart", payload: payloads.sessionStart, storePath });
  await invokeHook({ hook: "UserPromptSubmit", payload: payloads.userPromptSubmit, storePath });
  await invokeHook({ hook: "Stop", payload: payloads.stop, storePath });

  const gatesResult = spawnSync(nodeBin, [
    gatesCli,
    "--benchmark-report",
    benchmarkPath,
    "--store-path",
    storePath,
    "--json"
  ], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  assert.equal(gatesResult.status, 0, gatesResult.stderr);
  const gates = JSON.parse(gatesResult.stdout.trim());

  assert.equal(gates.spec_id, "SPEC-019");
  assert.equal(typeof gates.release_ready, "boolean");
  assert.equal(gates.gates.zero_dependency_coverage.pass, true);
  assert.equal(gates.gates.explainability_surface.pass, true);
  assert.equal(gates.gates.safety_and_audit_coverage.pass, true);
});
