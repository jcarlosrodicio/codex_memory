import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SessionPipelineCore } from "../../../core/src/index.mjs";
import { CodexMemoryAdapter } from "../src/index.mjs";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");

async function loadFixture(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

test("Layer 4 golden-path replay: session start -> capture -> retrieval -> injection -> after_response -> session_end", async () => {
  const fixture = await loadFixture("adapters/codex/tests/fixtures/layer4-golden-path-session.json");

  const memoryStore = {
    events: [],
    atoms: [
      {
        id: "seed-a",
        scope: {
          level: "branch_or_workspace",
          repository_id: "repo-a",
          branch_or_workspace_id: "feat/layer4",
          scope_key: "repo::repo-a::branch_or_workspace::feat/layer4"
        },
        provenance: { producer: "seed" },
        atom_type: "workflow",
        content: "run node test before finalize",
        confidence: 0.9,
        created_at: "2026-04-10T00:00:00.000Z"
      }
    ],
    edges: [],
    capsules: []
  };

  const adapter = new CodexMemoryAdapter({
    memoryStore,
    pipeline_options: {
      retrieval_options: {
        semanticMode: "off",
        lexical_options: {
          now: () => "2026-04-14T10:00:00.000Z"
        },
        pack_options: {
          hard_token_budget: 80,
          now: () => "2026-04-14T10:00:00.000Z"
        }
      },
      event_options: {
        now: () => "2026-04-14T10:00:00.000Z"
      },
      consolidation_options: {
        now: () => "2026-04-14T10:05:00.000Z"
      }
    }
  });

  const started = adapter.onSessionStart(fixture.session_start);
  assert.equal(started.status, "ok");

  const before = await adapter.onBeforePrompt(fixture.before_prompt);
  assert.equal(before.inject_context, true);
  assert.ok(before.context_pack.content.includes("CODEX_MEMORY_CONTEXT"));
  assert.ok(before.injection_metadata.pack_item_count >= 1);

  const after = adapter.onAfterResponse(fixture.after_response);
  assert.equal(typeof after.learning_enqueued, "boolean");
  assert.ok(after.audit_ref);

  const ended = adapter.onSessionEnd(fixture.session_end);
  assert.equal(ended.status, "ok");
  assert.ok(ended.consolidation.promoted_atoms.length >= 1);
  assert.ok(memoryStore.capsules.length >= 1);
});

test("Layer 4 controls: disable_learning=true skips durable promotion while keeping capture/retrieval", async () => {
  const adapter = new CodexMemoryAdapter({
    memoryStore: {
      events: [],
      atoms: [],
      edges: [],
      capsules: []
    },
    pipeline_options: {
      retrieval_options: {
        semanticMode: "off"
      }
    }
  });

  adapter.onSessionStart({
    session_id: "s-disable-learning",
    started_at: "2026-04-14T11:00:00.000Z",
    runtime: { surface: "cli", version: "1.0.0" },
    workspace: {
      root_path: "/workspace/repo-a",
      repository: "repo-a",
      branch: "feat/learning-off"
    },
    controls: {
      disable_injection: false,
      disable_learning: true
    }
  });

  await adapter.onBeforePrompt({
    session_id: "s-disable-learning",
    prompt_id: "p-1",
    prompt_text: "Please always run node test before finalize",
    user_visible_controls: {
      disable_injection: false,
      disable_learning: true
    },
    budget_hint: {
      max_tokens_for_memory: 40
    }
  });

  adapter.onAfterResponse({
    session_id: "s-disable-learning",
    prompt_id: "p-1",
    assistant_response: "We decided to run tests first.",
    response_stats: {
      input_tokens: 100,
      output_tokens: 50
    },
    controls: {
      disable_learning: true
    }
  });

  const ended = adapter.onSessionEnd({
    session_id: "s-disable-learning",
    ended_at: "2026-04-14T11:02:00.000Z",
    reason: "completed"
  });

  assert.equal(ended.consolidation.learning_enabled, false);
  assert.equal(ended.consolidation.promoted_atoms.length, 0);
});

test("Layer 4 fallback: pack generation failure is non-fatal and prompt proceeds without injection", async () => {
  const pipeline = new SessionPipelineCore({
    retrievalEngine: {
      async retrieve() {
        throw new Error("retrieval backend exploded");
      }
    }
  });

  const adapter = new CodexMemoryAdapter({
    pipeline,
    memoryStore: {
      events: [],
      atoms: [],
      edges: [],
      capsules: []
    }
  });

  adapter.onSessionStart({
    session_id: "s-fallback",
    started_at: "2026-04-14T12:00:00.000Z",
    runtime: { surface: "cli", version: "1.0.0" },
    workspace: {
      root_path: "/workspace/repo-a",
      repository: "repo-a",
      branch: "feat/fallback"
    },
    controls: {
      disable_injection: false,
      disable_learning: false
    }
  });

  const before = await adapter.onBeforePrompt({
    session_id: "s-fallback",
    prompt_id: "p-1",
    prompt_text: "please run tests",
    user_visible_controls: {
      disable_injection: false,
      disable_learning: false
    },
    budget_hint: {
      max_tokens_for_memory: 50
    }
  });

  assert.equal(before.inject_context, false);
  assert.equal(before.decision_summary.reason, "pack_generation_failed");
  assert.ok(String(before.injection_metadata.error).includes("retrieval backend exploded"));
});

test("Layer 4 isolates sessions by repo/branch and avoids cross-session contamination", () => {
  const memoryStore = {
    events: [],
    atoms: [],
    edges: [],
    capsules: []
  };

  const adapter = new CodexMemoryAdapter({ memoryStore });

  const s1 = adapter.onSessionStart({
    session_id: "s-r1",
    started_at: "2026-04-14T13:00:00.000Z",
    runtime: { surface: "cli", version: "1.0.0" },
    workspace: {
      root_path: "/workspace/repo-a",
      repository: "repo-a",
      branch: "main"
    },
    controls: { disable_injection: false, disable_learning: false }
  });

  const s2 = adapter.onSessionStart({
    session_id: "s-r2",
    started_at: "2026-04-14T13:00:00.000Z",
    runtime: { surface: "cli", version: "1.0.0" },
    workspace: {
      root_path: "/workspace/repo-b",
      repository: "repo-b",
      branch: "main"
    },
    controls: { disable_injection: false, disable_learning: false }
  });

  assert.notEqual(s1.scope.repository_id, s2.scope.repository_id);

  adapter.onAfterResponse({
    session_id: "s-r1",
    prompt_id: "p1",
    assistant_response: "We decided to fix regression and run tests",
    response_stats: {},
    controls: { disable_learning: false }
  });

  adapter.onAfterResponse({
    session_id: "s-r2",
    prompt_id: "p1",
    assistant_response: "We decided to use different deployment workflow",
    response_stats: {},
    controls: { disable_learning: false }
  });

  const end1 = adapter.onSessionEnd({
    session_id: "s-r1",
    ended_at: "2026-04-14T13:03:00.000Z",
    reason: "completed"
  });
  const end2 = adapter.onSessionEnd({
    session_id: "s-r2",
    ended_at: "2026-04-14T13:04:00.000Z",
    reason: "completed"
  });

  assert.equal(end1.status, "ok");
  assert.equal(end2.status, "ok");
  assert.ok(memoryStore.atoms.every((atom) => ["repo-a", "repo-b"].includes(atom.scope.repository_id)));
});
