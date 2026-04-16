import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ContextPackBuilder,
  RetrievalEngine
} from "../src/index.mjs";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

async function loadJson(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

test("defines strict hard budget, deterministic trimming, and required metrics", async () => {
  const contract = await loadJson("core/contracts/context-pack-builder.v1.json");

  assert.equal(contract.spec_id, "SPEC-013");
  assert.equal(contract.hard_budget.default_max_tokens, 600);
  assert.equal(contract.hard_budget.enforcement, "hard_ceiling");
  assert.equal(contract.context_pack_schema_version, "1");
  assert.deepEqual(contract.operational_metrics, [
    "pack_tokens",
    "retrieved_count",
    "dropped_count",
    "token_savings_estimate",
    "memory_enabled",
    "semantic_mode"
  ]);
});

test("context pack enforces strict token ceiling and emits explainability for include/drop/trim", () => {
  const builder = new ContextPackBuilder({
    hard_token_budget: 18,
    min_tokens_after_trim: 4,
    now: () => "2026-04-14T10:00:00.000Z",
    section_allocation: {
      rules: 0.5,
      knowledge: 0.3,
      open_loops: 0.2,
      capsules: 0
    }
  });

  const pack = builder.build({
    scope: { level: "repository", repository_id: "repo-a" },
    semanticMode: "off",
    candidates: [
      {
        memory_id: "rule-1",
        memory_type: "atom",
        atom_type: "constraint",
        score: 0.9,
        content: "use deterministic retrieval and hard limits for memory pack",
        token_estimate: 10,
        provenance: { why_included: ["lexical_match"] }
      },
      {
        memory_id: "knowledge-1",
        memory_type: "atom",
        atom_type: "fact",
        score: 0.8,
        content: "knowledge block requires truncation to fit fixed budget",
        token_estimate: 9,
        provenance: { why_included: ["graph_expansion"] }
      },
      {
        memory_id: "loop-1",
        memory_type: "atom",
        atom_type: "open_loop",
        score: 0.7,
        content: "open loop that likely drops due to section cap",
        token_estimate: 8,
        provenance: { why_included: ["lexical_match"] }
      }
    ],
    retrievalDrops: [{ memory_id: "pre-drop", reason: "scope_mismatch", stage: "lexical" }],
    retrievedCount: 3
  });

  assert.ok(pack.token_estimate <= 18);
  assert.equal(pack.context_pack_schema_version, "1");
  assert.ok(pack.pack_items.length >= 1);
  assert.ok(pack.pack_items.every((item) => item.provenance.why_included.length > 0));
  assert.ok(pack.drop_reasons.length > 0);
  assert.ok(pack.trim_actions.length > 0);
  assert.equal(pack.metrics.pack_tokens, pack.token_estimate);
  assert.equal(pack.metrics.semantic_mode, "off");
});

test("Layer 3 zero-deps retrieval + graph expansion + pack metrics works end-to-end without semantic backend", async () => {
  const engine = new RetrievalEngine({
    semanticMode: "off",
    lexical_options: {
      now: () => "2026-04-14T10:00:00.000Z"
    },
    pack_options: {
      hard_token_budget: 40,
      now: () => "2026-04-14T10:00:00.000Z"
    },
    graph_options: {
      seed_limit: 4,
      max_depth: 2,
      max_breadth_per_seed: 2,
      max_expanded_candidates: 5
    }
  });

  const result = await engine.retrieve(
    {
      text: "zero deps retrieval pack"
    },
    {
      scope: {
        level: "repository",
        repository_id: "repo-a"
      },
      budget: 40,
      memoryStore: {
        atoms: [
          {
            id: "seed",
            scope: { level: "repository", repository_id: "repo-a" },
            atom_type: "workflow",
            content: "zero deps retrieval pack baseline",
            confidence: 0.9,
            created_at: "2026-04-11T00:00:00.000Z"
          },
          {
            id: "neighbor",
            scope: { level: "repository", repository_id: "repo-a" },
            atom_type: "decision",
            content: "graph expanded memory item",
            confidence: 0.8,
            created_at: "2026-04-12T00:00:00.000Z"
          },
          {
            id: "other-repo",
            scope: { level: "repository", repository_id: "repo-b" },
            atom_type: "fact",
            content: "must remain isolated",
            confidence: 0.9,
            created_at: "2026-04-12T00:00:00.000Z"
          }
        ],
        capsules: [],
        edges: [
          {
            id: "edge-seed-neighbor",
            scope: { level: "repository", repository_id: "repo-a" },
            edge_type: "related_to",
            from_memory_id: "seed",
            to_memory_id: "neighbor",
            created_at: "2026-04-12T00:00:00.000Z"
          }
        ]
      }
    }
  );

  assert.ok(result.candidates.some((candidate) => candidate.memory_id === "seed"));
  assert.ok(result.candidates.some((candidate) => candidate.memory_id === "neighbor"));
  assert.ok(!result.candidates.some((candidate) => candidate.memory_id === "other-repo"));
  assert.equal(result.metrics.semantic_mode, "off");
  assert.equal(result.telemetry.semantic.status, "skipped");
  assert.ok(result.context_pack.metrics.pack_tokens <= 40);
  assert.equal(typeof result.context_pack.metrics.retrieved_count, "number");
  assert.equal(typeof result.context_pack.metrics.dropped_count, "number");
  assert.equal(typeof result.context_pack.metrics.token_savings_estimate, "number");
  assert.equal(typeof result.context_pack.metrics.memory_enabled, "boolean");
});

test("Regression: supersession metadata on atoms resolves conflicts even without supersedes edge", async () => {
  const engine = new RetrievalEngine({
    semanticMode: "off",
    lexical_options: {
      now: () => "2026-04-14T10:00:00.000Z"
    },
    pack_options: {
      hard_token_budget: 80,
      now: () => "2026-04-14T10:00:00.000Z"
    }
  });

  const result = await engine.retrieve(
    {
      text: "prefer newest deterministic workflow rule"
    },
    {
      scope: {
        level: "repository",
        repository_id: "repo-a"
      },
      budget: 80,
      memoryStore: {
        atoms: [
          {
            id: "workflow-rule-new",
            scope: { level: "repository", repository_id: "repo-a" },
            atom_type: "workflow",
            content: "prefer newest deterministic workflow rule",
            confidence: 0.85,
            supersedes: ["workflow-rule-old"],
            created_at: "2026-04-13T00:00:00.000Z"
          },
          {
            id: "workflow-rule-old",
            scope: { level: "repository", repository_id: "repo-a" },
            atom_type: "workflow",
            content: "prefer newest deterministic workflow rule",
            confidence: 0.95,
            created_at: "2026-03-01T00:00:00.000Z"
          }
        ],
        capsules: [],
        edges: []
      }
    }
  );

  assert.ok(result.candidates.some((candidate) => candidate.memory_id === "workflow-rule-new"));
  assert.ok(!result.candidates.some((candidate) => candidate.memory_id === "workflow-rule-old"));
  assert.ok(
    result.context_pack.pack_items.some((item) => item.memory_id === "workflow-rule-new"),
    "winner should reach pack"
  );
  assert.ok(
    !result.context_pack.pack_items.some((item) => item.memory_id === "workflow-rule-old"),
    "superseded item should not reach pack"
  );
  assert.ok(
    result.context_pack.drop_reasons.some(
      (reason) => reason.memory_id === "workflow-rule-old" && reason.reason === "superseded_candidate"
    ),
    "pack explainability should include supersession drop reason"
  );
});
