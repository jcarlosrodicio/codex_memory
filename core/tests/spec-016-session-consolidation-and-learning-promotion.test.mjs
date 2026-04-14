import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  SessionConsolidator,
  SessionPipelineCore
} from "../src/index.mjs";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

async function loadJson(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

test("SPEC-016 defines consolidation policy, durable outputs, and fallback behavior", async () => {
  const contract = await loadJson("core/contracts/session-consolidation-promotion.v1.json");

  assert.equal(contract.spec_id, "SPEC-016");
  assert.equal(contract.promotion_policy.phase, "session_end_default");
  assert.ok(contract.conflict_markers.supports.includes("supersedes"));
  assert.ok(contract.conflict_markers.supports.includes("contradicts"));
  assert.equal(contract.fallback_behavior.learning_disabled, "no_durable_promotion");
});

test("SPEC-016 consolidates high-confidence candidates into durable atoms/capsule and deduplicates existing memory", () => {
  const consolidator = new SessionConsolidator({
    minPromotionConfidence: 0.68,
    now: () => "2026-04-14T10:30:00.000Z"
  });

  const memoryStore = {
    atoms: [
      {
        id: "atom-existing",
        scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
        provenance: { producer: "test" },
        atom_type: "workflow",
        content: "run node test before finishing",
        confidence: 0.8,
        created_at: "2026-04-01T00:00:00.000Z",
        reuse_count: 2
      }
    ],
    edges: [],
    capsules: []
  };

  const result = consolidator.consolidate({
    sessionState: {
      session_ref: "s-016",
      signal_buffer: [
        {
          id: "sig-1",
          event_id: "evt-1",
          atom_type: "workflow",
          content: "Run node test before finishing",
          scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
          confidence: 0.92,
          created_at: "2026-04-14T10:01:00.000Z"
        },
        {
          id: "sig-2",
          event_id: "evt-2",
          atom_type: "constraint",
          content: "Must keep injection deterministic and bounded",
          scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
          confidence: 0.89,
          created_at: "2026-04-14T10:05:00.000Z"
        },
        {
          id: "sig-3",
          event_id: "evt-3",
          atom_type: "fact",
          content: "semantic mode default is off",
          scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
          confidence: 0.52,
          created_at: "2026-04-14T10:06:00.000Z"
        }
      ]
    },
    memoryStore,
    disableLearning: false
  });

  assert.ok(result.promoted_atoms.length >= 1);
  assert.equal(result.promoted_edges.length, 0);
  assert.ok(result.promoted_capsule, "session should emit a capsule when durable atoms exist");
  assert.ok(result.dropped.some((item) => item.reason === "deduplicated_existing_atom"));
  assert.ok(result.dropped.some((item) => item.reason === "low_confidence_not_promoted"));
  assert.ok(memoryStore.capsules.length >= 1);
});

test("SPEC-016 learning-off keeps candidates ephemeral and promotes nothing durable", () => {
  const pipeline = new SessionPipelineCore({
    event_options: { now: () => "2026-04-14T10:00:00.000Z" }
  });

  const memoryStore = { atoms: [], edges: [], capsules: [] };
  const { state } = pipeline.initSession({
    event_type: "SESSION_STARTED",
    session_ref: "s-016-off",
    occurred_at: "2026-04-14T10:00:00.000Z",
    scope_hints: { repo: "repo-a", branch: "feat-x" },
    session_controls: { disable_learning: true }
  });

  pipeline.capture(state, {
    event_type: "AFTER_RESPONSE",
    session_ref: "s-016-off",
    occurred_at: "2026-04-14T10:01:00.000Z",
    prompt_ref: "p-1",
    response_excerpt: "We decided to always run tests and fix failing snapshots."
  });

  const consolidated = pipeline.consolidateSession({
    state,
    memoryStore,
    disableLearning: true
  });

  assert.equal(consolidated.learning_enabled, false);
  assert.equal(consolidated.promoted_atoms.length, 0);
  assert.equal(consolidated.promoted_edges.length, 0);
  assert.equal(consolidated.promoted_capsule, null);
  assert.equal(memoryStore.atoms.length, 0);
});

test("Regression: contradiction is detected when durable memory is negated and new candidate is affirmative", () => {
  const consolidator = new SessionConsolidator({
    minPromotionConfidence: 0.68,
    now: () => "2026-04-14T10:30:00.000Z"
  });

  const memoryStore = {
    atoms: [
      {
        id: "atom-neg-existing",
        scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
        provenance: { producer: "test" },
        atom_type: "constraint",
        content: "Do not use external services",
        confidence: 0.9,
        created_at: "2026-04-10T00:00:00.000Z"
      }
    ],
    edges: [],
    capsules: []
  };

  const result = consolidator.consolidate({
    sessionState: {
      session_ref: "s-016-contradiction-a",
      signal_buffer: [
        {
          id: "sig-affirmative",
          event_id: "evt-a",
          atom_type: "constraint",
          content: "Use external services",
          scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
          confidence: 0.9,
          created_at: "2026-04-14T10:01:00.000Z"
        }
      ]
    },
    memoryStore,
    disableLearning: false
  });

  assert.equal(result.promoted_atoms.length, 1);
  assert.ok(
    result.promoted_edges.some(
      (edge) => edge.edge_type === "contradicts" && edge.to_memory_id === "atom-neg-existing"
    )
  );
});

test("Regression: contradiction is detected when durable memory is affirmative and new candidate is negated", () => {
  const consolidator = new SessionConsolidator({
    minPromotionConfidence: 0.68,
    now: () => "2026-04-14T10:30:00.000Z"
  });

  const memoryStore = {
    atoms: [
      {
        id: "atom-aff-existing",
        scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
        provenance: { producer: "test" },
        atom_type: "constraint",
        content: "Use external services",
        confidence: 0.9,
        created_at: "2026-04-10T00:00:00.000Z"
      }
    ],
    edges: [],
    capsules: []
  };

  const result = consolidator.consolidate({
    sessionState: {
      session_ref: "s-016-contradiction-b",
      signal_buffer: [
        {
          id: "sig-negative",
          event_id: "evt-b",
          atom_type: "constraint",
          content: "Do not use external services",
          scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
          confidence: 0.9,
          created_at: "2026-04-14T10:02:00.000Z"
        }
      ]
    },
    memoryStore,
    disableLearning: false
  });

  assert.equal(result.promoted_atoms.length, 1);
  assert.ok(
    result.promoted_edges.some(
      (edge) => edge.edge_type === "contradicts" && edge.to_memory_id === "atom-aff-existing"
    )
  );
});
