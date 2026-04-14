import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { LexicalRetrievalEngine } from "../src/index.mjs";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

async function loadJson(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

test("SPEC-010 defines host-agnostic lexical retrieval with deterministic weighted scoring", async () => {
  const contract = await loadJson("core/contracts/lexical-retrieval-engine.v1.json");

  assert.equal(contract.spec_id, "SPEC-010");
  assert.equal(contract.host_agnostic_interface.engine, "RetrievalEngine");
  assert.equal(contract.host_agnostic_interface.default_stage, "lexical");
  assert.equal(contract.ranking.deterministic, true);
  assert.equal(contract.candidate_filtering.scope_filter, "mandatory_exact_scope_compatibility");
  assert.equal(contract.candidate_filtering.freshness_filter.type, "optional_time_window");
  assert.equal(contract.candidate_filtering.freshness_filter.input, "filters.freshness.max_age_days");
  assert.equal(contract.candidate_filtering.freshness_filter.timestamp_field, "updated_at_or_created_at");

  const weights = contract.ranking.weights;
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
  assert.equal(totalWeight, 1);
});

test("SPEC-010 lexical ranking combines lexical match with non-text signals", () => {
  const lexical = new LexicalRetrievalEngine({
    now: () => "2026-04-14T10:00:00.000Z"
  });

  const result = lexical.retrieve({
    taskContext: {
      text: "prioritize offline zero deps workflow"
    },
    scope: {
      level: "repository",
      repository_id: "repo-a"
    },
    memoryStore: {
      atoms: [
        {
          id: "a-recent-high-confidence",
          scope: { level: "repository", repository_id: "repo-a" },
          atom_type: "workflow",
          content: "offline zero deps workflow with deterministic retrieval",
          confidence: 0.95,
          reuse_count: 8,
          created_at: "2026-04-13T10:00:00.000Z"
        },
        {
          id: "a-older-low-confidence",
          scope: { level: "repository", repository_id: "repo-a" },
          atom_type: "workflow",
          content: "offline zero deps workflow with deterministic retrieval",
          confidence: 0.35,
          reuse_count: 0,
          created_at: "2025-01-01T10:00:00.000Z"
        }
      ]
    }
  });

  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].memory_id, "a-recent-high-confidence");
  assert.equal(result.candidates[1].memory_id, "a-older-low-confidence");
  assert.ok(result.candidates[0].score_breakdown.confidence > result.candidates[1].score_breakdown.confidence);
  assert.ok(result.candidates[0].score_breakdown.recency > result.candidates[1].score_breakdown.recency);
});

test("SPEC-010 applies explicit scope and memory type filtering", () => {
  const lexical = new LexicalRetrievalEngine({
    now: () => "2026-04-14T10:00:00.000Z"
  });

  const result = lexical.retrieve({
    taskContext: {
      text: "workspace constraint"
    },
    scope: {
      level: "branch_or_workspace",
      repository_id: "repo-a",
      branch_or_workspace_id: "feature-x"
    },
    filters: {
      memory_types: ["atom"],
      atom_types: ["constraint"]
    },
    memoryStore: {
      atoms: [
        {
          id: "include-me",
          scope: {
            level: "branch_or_workspace",
            repository_id: "repo-a",
            branch_or_workspace_id: "feature-x"
          },
          atom_type: "constraint",
          content: "workspace constraint enforce deterministic behavior",
          confidence: 0.9,
          created_at: "2026-04-10T10:00:00.000Z"
        },
        {
          id: "wrong-repo",
          scope: {
            level: "branch_or_workspace",
            repository_id: "repo-b",
            branch_or_workspace_id: "feature-x"
          },
          atom_type: "constraint",
          content: "workspace constraint other repo",
          confidence: 0.9,
          created_at: "2026-04-10T10:00:00.000Z"
        }
      ],
      capsules: [
        {
          id: "capsule-filtered",
          scope: {
            level: "branch_or_workspace",
            repository_id: "repo-a",
            branch_or_workspace_id: "feature-x"
          },
          summary: "capsule memory",
          created_at: "2026-04-10T10:00:00.000Z"
        }
      ]
    }
  });

  assert.deepEqual(result.candidates.map((candidate) => candidate.memory_id), ["include-me"]);
  assert.ok(result.dropped.some((item) => item.memory_id === "wrong-repo" && item.reason === "scope_mismatch"));
  assert.ok(result.dropped.some((item) => item.memory_id === "capsule-filtered" && item.reason === "filtered_by_memory_type"));
});

test("SPEC-010 applies optional freshness filtering with max_age_days over updated_at/created_at", () => {
  const lexical = new LexicalRetrievalEngine({
    now: () => "2026-04-14T10:00:00.000Z"
  });

  const result = lexical.retrieve({
    taskContext: {
      text: "fresh deterministic memory"
    },
    scope: {
      level: "repository",
      repository_id: "repo-a"
    },
    filters: {
      freshness: {
        max_age_days: 30
      }
    },
    memoryStore: {
      atoms: [
        {
          id: "fresh-memory",
          scope: { level: "repository", repository_id: "repo-a" },
          atom_type: "fact",
          content: "fresh deterministic memory",
          confidence: 0.9,
          updated_at: "2026-04-10T10:00:00.000Z",
          created_at: "2026-04-01T10:00:00.000Z"
        },
        {
          id: "stale-memory",
          scope: { level: "repository", repository_id: "repo-a" },
          atom_type: "fact",
          content: "fresh deterministic memory",
          confidence: 0.9,
          updated_at: "2025-10-01T10:00:00.000Z",
          created_at: "2025-10-01T10:00:00.000Z"
        }
      ]
    }
  });

  assert.deepEqual(result.candidates.map((candidate) => candidate.memory_id), ["fresh-memory"]);
  assert.ok(result.dropped.some((item) => item.memory_id === "stale-memory" && item.reason === "filtered_by_freshness"));
});
