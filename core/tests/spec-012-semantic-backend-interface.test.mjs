import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  RetrievalEngine,
  SemanticBackend,
  resolveSemanticCandidates
} from "../src/index.mjs";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

async function loadJson(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

test("SPEC-012 defines semantic interface contract with optional modes and fallback semantics", async () => {
  const contract = await loadJson("core/contracts/semantic-backend-interface.v1.json");

  assert.equal(contract.spec_id, "SPEC-012");
  assert.deepEqual(contract.modes.enum, ["off", "light", "custom"]);
  assert.equal(contract.modes.default, "off");
  assert.ok(contract.semantic_backend_interface.required_methods.includes("search(query_payload)"));
  assert.equal(contract.merge_contract.missing_backend_changes_api, false);
  assert.equal(contract.status, "scaffolding_for_mvp_zero_deps");
});

test("SPEC-012 semantic mode off preserves zero-deps retrieval flow", async () => {
  const engine = new RetrievalEngine({
    semanticMode: "off",
    lexical_options: {
      now: () => "2026-04-14T10:00:00.000Z"
    },
    pack_options: {
      now: () => "2026-04-14T10:00:00.000Z"
    }
  });

  const result = await engine.retrieve(
    { text: "deterministic memory" },
    {
      scope: { level: "repository", repository_id: "repo-a" },
      budget: 40,
      memoryStore: {
        atoms: [
          {
            id: "memory-1",
            scope: { level: "repository", repository_id: "repo-a" },
            atom_type: "workflow",
            content: "deterministic memory retrieval path",
            confidence: 0.9,
            created_at: "2026-04-01T00:00:00.000Z"
          }
        ],
        edges: []
      }
    }
  );

  assert.equal(result.metrics.semantic_mode, "off");
  assert.equal(result.telemetry.semantic.status, "skipped");
  assert.equal(result.context_pack.pack_items.length, 1);
});

test("SPEC-012 missing semantic backend in light mode degrades safely without breaking retrieval", async () => {
  const engine = new RetrievalEngine({
    semanticMode: "light",
    lexical_options: {
      now: () => "2026-04-14T10:00:00.000Z"
    },
    pack_options: {
      now: () => "2026-04-14T10:00:00.000Z"
    }
  });

  const result = await engine.retrieve(
    { text: "local memory" },
    {
      scope: { level: "repository", repository_id: "repo-a" },
      budget: 20,
      memoryStore: {
        atoms: [
          {
            id: "memory-1",
            scope: { level: "repository", repository_id: "repo-a" },
            atom_type: "fact",
            content: "local memory still works",
            confidence: 0.8,
            created_at: "2026-04-10T00:00:00.000Z"
          }
        ],
        edges: []
      }
    }
  );

  assert.equal(result.telemetry.semantic.status, "degraded");
  assert.equal(result.telemetry.semantic.reason, "semantic_backend_missing");
  assert.equal(result.context_pack.pack_items.length, 1);
});

test("SPEC-012 semantic adapter contract supports healthy search results without mandatory backend", async () => {
  class FakeSemanticBackend extends SemanticBackend {
    getCapabilities() {
      return { available: true };
    }

    async healthCheck() {
      return { healthy: true };
    }

    async index() {
      return { indexed_count: 1 };
    }

    async search() {
      return {
        candidates: [
          {
            memory_id: "memory-1",
            score: 0.7,
            backend: "fake"
          }
        ]
      };
    }
  }

  const semantic = await resolveSemanticCandidates({
    semanticMode: "custom",
    semanticBackend: new FakeSemanticBackend(),
    taskContext: { text: "memory" }
  });

  assert.equal(semantic.status, "ok");
  assert.equal(semantic.candidates[0].memory_id, "memory-1");
  assert.equal(semantic.candidates[0].provenance.retrieval_stage, "semantic");
});
