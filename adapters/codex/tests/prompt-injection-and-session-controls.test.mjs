import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CodexMemoryAdapter } from "../src/index.mjs";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");

async function loadJson(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

function makeAdapterWithSeedMemory() {
  return new CodexMemoryAdapter({
    memoryStore: {
      events: [],
      atoms: [
        {
          id: "seed-workflow",
          scope: {
            level: "branch_or_workspace",
            repository_id: "repo-a",
            branch_or_workspace_id: "feat-layer4",
            scope_key: "repo::repo-a::branch_or_workspace::feat-layer4"
          },
          provenance: { producer: "seed" },
          atom_type: "workflow",
          content: "run node test before finalize",
          confidence: 0.95,
          created_at: "2026-04-10T00:00:00.000Z"
        }
      ],
      edges: [],
      capsules: []
    },
    pipeline_options: {
      retrieval_options: {
        semanticMode: "off",
        lexical_options: {
          now: () => "2026-04-14T10:00:00.000Z"
        },
        pack_options: {
          now: () => "2026-04-14T10:00:00.000Z"
        }
      },
      event_options: {
        now: () => "2026-04-14T10:00:00.000Z"
      }
    }
  });
}

test("defines injection payload shape and independent session controls", async () => {
  const contract = await loadJson("adapters/codex/contracts/prompt-injection-session-controls.v1.json");

  assert.equal(contract.spec_id, "SPEC-015");
  assert.equal(contract.injection_payload.inject_context, "boolean");
  assert.equal(contract.session_controls.disable_injection.effect, "skip_context_injection_keep_capture_and_learning");
  assert.equal(contract.session_controls.disable_learning.effect, "allow_injection_but_skip_durable_promotion");
  assert.equal(contract.fallback_behavior.pack_generation_failure, "inject_context_false_with_reason");
});

test("injects ContextPack before prompt when enabled and exposes injection metadata", async () => {
  const adapter = makeAdapterWithSeedMemory();

  adapter.onSessionStart({
    session_id: "s-015",
    started_at: "2026-04-14T10:00:00.000Z",
    runtime: { surface: "cli", version: "1.0.0" },
    workspace: {
      root_path: "/workspace/repo-a",
      repository: "repo-a",
      branch: "feat-layer4"
    },
    controls: {
      disable_injection: false,
      disable_learning: false
    }
  });

  const before = await adapter.onBeforePrompt({
    session_id: "s-015",
    prompt_id: "p-1",
    prompt_text: "run node test before finalize with deterministic output",
    user_visible_controls: {
      disable_injection: false,
      disable_learning: false
    },
    budget_hint: {
      max_tokens_for_memory: 80
    }
  });

  assert.equal(before.inject_context, true);
  assert.ok(before.context_pack?.pack_id);
  assert.ok(before.context_pack?.content.includes("[CODEX_MEMORY_CONTEXT v1]"));
  assert.ok(before.injection_metadata.pack_item_count >= 1);
  assert.equal(before.decision_summary.reason, "context_pack_injected");
});

test("disable_injection=true prevents prompt injection but keeps session active", async () => {
  const adapter = makeAdapterWithSeedMemory();

  adapter.onSessionStart({
    session_id: "s-015-off",
    started_at: "2026-04-14T10:00:00.000Z",
    runtime: { surface: "cli", version: "1.0.0" },
    workspace: {
      root_path: "/workspace/repo-a",
      repository: "repo-a",
      branch: "feat-layer4"
    },
    controls: {
      disable_injection: true,
      disable_learning: false
    }
  });

  const before = await adapter.onBeforePrompt({
    session_id: "s-015-off",
    prompt_id: "p-1",
    prompt_text: "prefer deterministic test workflow",
    user_visible_controls: {
      disable_injection: true,
      disable_learning: false
    },
    budget_hint: {
      max_tokens_for_memory: 80
    }
  });

  assert.equal(before.inject_context, false);
  assert.equal(before.context_pack, null);
  assert.equal(before.decision_summary.reason, "injection_disabled_by_session_control");
  assert.equal(before.injection_metadata.disabled_by_control, true);
});
