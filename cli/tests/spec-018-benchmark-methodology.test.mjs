import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const nodeBin = process.execPath;

test("SPEC-018 benchmark CLI emits comparative report for baseline, cheap-first, and cheap-first-plus-semantic", () => {
  const cliScript = path.join(repoRoot, "cli/bin/codex-memory-benchmark.mjs");
  const fixturePath = path.join(repoRoot, "adapters/codex/tests/fixtures/layer4-golden-path-session.json");

  const result = spawnSync(nodeBin, [cliScript, "--fixture", fixturePath, "--json"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout.trim());

  assert.equal(report.spec_id, "SPEC-018");
  assert.equal(report.zero_dependency_success, true);
  assert.deepEqual(report.modes.map((item) => item.mode), [
    "baseline",
    "cheap-first",
    "cheap-first-plus-semantic"
  ]);

  for (const modeReport of report.modes) {
    assert.equal(typeof modeReport.metrics.pack_tokens, "number");
    assert.equal(typeof modeReport.metrics.retrieved_count, "number");
    assert.equal(typeof modeReport.metrics.dropped_count, "number");
    assert.equal(typeof modeReport.metrics.token_savings_estimate, "number");
    assert.equal(typeof modeReport.metrics.scope_contamination_rate, "number");
    assert.equal(typeof modeReport.metrics.contradiction_injection_rate, "number");
    assert.equal(typeof modeReport.metrics.user_correction_rate, "number");
  }
});
