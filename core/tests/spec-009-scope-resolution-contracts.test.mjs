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

test("SPEC-009 defines deterministic repository and branch identity derivation", async () => {
  const resolver = await loadJson("core/contracts/repository-branch-scope-resolution.v1.json");

  assert.equal(resolver.spec_id, "SPEC-009");
  assert.equal(resolver.resolver.local_only, true);
  assert.deepEqual(resolver.resolver.repository_identity.source_priority, [
    "adapter_scope_hints.repo",
    "git.toplevel_path",
    "workspace.root_path"
  ]);
  assert.deepEqual(resolver.resolver.branch_or_workspace_identity.source_priority, [
    "adapter_scope_hints.branch",
    "git.branch_name",
    "workspace.local_workspace_id"
  ]);
});

test("SPEC-009 defines explicit non-git fallback behavior", async () => {
  const resolver = await loadJson("core/contracts/repository-branch-scope-resolution.v1.json");
  const fallback = resolver.fallback_behavior;

  assert.equal(fallback.when_git_metadata_unavailable.mode, "local_workspace_scope");
  assert.equal(fallback.when_git_metadata_unavailable.promote_to_global, false);
  assert.equal(
    fallback.when_scope_resolution_incomplete.safe_default,
    "use_narrowest_safe_scope"
  );
});

test("SPEC-009 defines stable scope keys reusable by store, retrieval, and audit flows", async () => {
  const resolver = await loadJson("core/contracts/repository-branch-scope-resolution.v1.json");

  assert.equal(
    resolver.stable_scope_key_format.repository_scope,
    "repo::<repository_id>"
  );
  assert.equal(
    resolver.stable_scope_key_format.branch_or_workspace_scope,
    "repo::<repository_id>::branch_or_workspace::<branch_or_workspace_id>"
  );
  assert.equal(
    resolver.stable_scope_key_format.local_workspace_scope,
    "workspace::<workspace_id>"
  );
  assert.equal(resolver.reused_by.memory_store, "SPEC-006");
  assert.equal(resolver.reused_by.retrieval, "SPEC-010");
  assert.equal(resolver.reused_by.audit_tooling, "SPEC-017");
});
