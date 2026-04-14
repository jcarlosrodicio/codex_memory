import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

async function loadJson(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

test("SPEC-008 defines scope precedence in a single reusable contract", async () => {
  const policy = await loadJson("core/contracts/memory-scoping-policy.v1.json");

  assert.equal(policy.spec_id, "SPEC-008");
  assert.equal(policy.single_source_of_truth, true);
  assert.equal(policy.reused_by.retrieval_spec, "SPEC-010");
  assert.equal(policy.reused_by.packing_spec, "SPEC-013");
  assert.deepEqual(policy.scope_precedence.levels, [
    "global",
    "repository",
    "branch_or_workspace",
    "session"
  ]);
  assert.deepEqual(policy.scope_precedence.resolution_order, [
    "session",
    "branch_or_workspace",
    "repository",
    "global"
  ]);
});

test("SPEC-008 defines explicit supersession and contradiction handling", async () => {
  const policy = await loadJson("core/contracts/memory-scoping-policy.v1.json");
  const conflictRules = policy.conflict_rules;

  assert.ok(conflictRules.markers.includes("supersedes"));
  assert.ok(conflictRules.markers.includes("superseded_by"));
  assert.ok(conflictRules.markers.includes("contradicts"));
  assert.equal(conflictRules.retrieval_resolution.inject_without_treatment, false);
  assert.ok(
    conflictRules.required_on_override_attempt.includes("provenance"),
    "override attempts must preserve provenance"
  );
  assert.ok(
    conflictRules.required_on_override_attempt.includes("contradicts_or_supersedes"),
    "override attempts must explicitly carry conflict markers"
  );
});

test("SPEC-008 prevents cross-repository contamination and narrows scope on uncertainty", async () => {
  const policy = await loadJson("core/contracts/memory-scoping-policy.v1.json");
  const isolation = policy.cross_repository_isolation;

  assert.equal(isolation.default_mode, "deny_cross_repo");
  assert.equal(isolation.repository_scope_matching, "exact_repository_id");
  assert.equal(
    isolation.branch_scope_matching,
    "exact_repository_id_and_branch_or_workspace_id"
  );
  assert.equal(
    isolation.fallback_on_incomplete_scope_resolution,
    "use_narrowest_safe_scope"
  );

  assert.ok(
    policy.invariants.includes("Cross-repository memory contamination is prevented by default.")
  );
  assert.ok(
    policy.invariants.includes("Global preferences cannot erase repository-local constraints.")
  );
});
