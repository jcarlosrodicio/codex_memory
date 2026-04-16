import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { GraphExpansionPolicy } from "../src/index.mjs";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

async function loadJson(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

test("defines a bounded edge taxonomy and expansion limits", async () => {
  const contract = await loadJson("core/contracts/graph-expansion-policy.v1.json");

  assert.equal(contract.spec_id, "SPEC-011");
  assert.deepEqual(contract.edge_taxonomy_v1, [
    "derived_from",
    "applies_to",
    "related_to",
    "caused_by",
    "contradicts",
    "supersedes"
  ]);
  assert.equal(contract.expansion_policy.max_depth, 2);
  assert.equal(contract.expansion_policy.max_breadth_per_seed, 3);
  assert.equal(contract.scope_guardrails.can_broaden_scope, false);
});

test("graph expansion starts from lexical seeds and respects depth/breadth limits", () => {
  const graph = new GraphExpansionPolicy({
    max_depth: 2,
    max_breadth_per_seed: 2,
    max_expanded_candidates: 3
  });

  const result = graph.apply({
    rankedCandidates: [
      {
        memory_id: "seed-a",
        score: 0.8,
        scope: { level: "repository", repository_id: "repo-a" },
        provenance: { retrieval_stage: "lexical", why_included: ["lexical_match"] }
      }
    ],
    scope: { level: "repository", repository_id: "repo-a" },
    memoryStore: {
      atoms: [
        {
          id: "seed-a",
          scope: { level: "repository", repository_id: "repo-a" },
          atom_type: "decision",
          content: "seed",
          created_at: "2026-04-01T00:00:00.000Z"
        },
        {
          id: "n1",
          scope: { level: "repository", repository_id: "repo-a" },
          atom_type: "fact",
          content: "neighbor one",
          created_at: "2026-04-01T00:00:00.000Z"
        },
        {
          id: "n2",
          scope: { level: "repository", repository_id: "repo-a" },
          atom_type: "fact",
          content: "neighbor two",
          created_at: "2026-04-01T00:00:00.000Z"
        },
        {
          id: "n3",
          scope: { level: "repository", repository_id: "repo-a" },
          atom_type: "fact",
          content: "neighbor three",
          created_at: "2026-04-01T00:00:00.000Z"
        },
        {
          id: "other-repo",
          scope: { level: "repository", repository_id: "repo-b" },
          atom_type: "fact",
          content: "other repo",
          created_at: "2026-04-01T00:00:00.000Z"
        }
      ],
      edges: [
        {
          id: "e1",
          scope: { level: "repository", repository_id: "repo-a" },
          edge_type: "related_to",
          from_memory_id: "seed-a",
          to_memory_id: "n1"
        },
        {
          id: "e2",
          scope: { level: "repository", repository_id: "repo-a" },
          edge_type: "related_to",
          from_memory_id: "seed-a",
          to_memory_id: "n2"
        },
        {
          id: "e3",
          scope: { level: "repository", repository_id: "repo-a" },
          edge_type: "related_to",
          from_memory_id: "seed-a",
          to_memory_id: "n3"
        },
        {
          id: "e4",
          scope: { level: "repository", repository_id: "repo-a" },
          edge_type: "caused_by",
          from_memory_id: "n1",
          to_memory_id: "other-repo"
        }
      ]
    }
  });

  assert.ok(result.candidates.some((candidate) => candidate.memory_id === "n1"));
  assert.ok(result.candidates.some((candidate) => candidate.memory_id === "n2"));
  assert.ok(!result.candidates.some((candidate) => candidate.memory_id === "n3"));
  assert.ok(result.dropped.some((item) => item.memory_id === "n3" && item.reason === "graph_breadth_limit"));
  assert.ok(result.stats.expanded_count <= 3);
});

test("conflict treatment drops superseded and contradictory candidates deterministically", () => {
  const graph = new GraphExpansionPolicy();

  const result = graph.apply({
    rankedCandidates: [
      {
        memory_id: "new-rule",
        score: 0.85,
        scope: { level: "repository", repository_id: "repo-a" },
        provenance: { retrieval_stage: "lexical", why_included: ["lexical_match"] }
      },
      {
        memory_id: "old-rule",
        score: 0.8,
        scope: { level: "repository", repository_id: "repo-a" },
        provenance: { retrieval_stage: "lexical", why_included: ["lexical_match"] }
      },
      {
        memory_id: "contradict-a",
        score: 0.74,
        scope: { level: "repository", repository_id: "repo-a" },
        provenance: { retrieval_stage: "lexical", why_included: ["lexical_match"] }
      },
      {
        memory_id: "contradict-b",
        score: 0.65,
        scope: { level: "repository", repository_id: "repo-a" },
        provenance: { retrieval_stage: "lexical", why_included: ["lexical_match"] }
      }
    ],
    scope: { level: "repository", repository_id: "repo-a" },
    memoryStore: {
      atoms: [],
      capsules: [],
      edges: [
        {
          id: "supersede-edge",
          scope: { level: "repository", repository_id: "repo-a" },
          edge_type: "supersedes",
          from_memory_id: "new-rule",
          to_memory_id: "old-rule"
        },
        {
          id: "contradict-edge",
          scope: { level: "repository", repository_id: "repo-a" },
          edge_type: "contradicts",
          from_memory_id: "contradict-a",
          to_memory_id: "contradict-b"
        }
      ]
    }
  });

  const ids = result.candidates.map((candidate) => candidate.memory_id);
  assert.ok(ids.includes("new-rule"));
  assert.ok(!ids.includes("old-rule"));
  assert.ok(ids.includes("contradict-a"));
  assert.ok(!ids.includes("contradict-b"));
  assert.ok(result.dropped.some((item) => item.reason === "superseded_candidate"));
  assert.ok(result.dropped.some((item) => item.reason === "contradiction_suppressed"));
});
