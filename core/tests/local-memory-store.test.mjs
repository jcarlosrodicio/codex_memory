import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { LocalMemoryStore } from "../src/index.mjs";

const nodeBin = process.execPath;

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

test("local store default path is stable and independent from workspace cwd", () => {
  const fakeHome = path.join(tmpdir(), "codex-memory-fake-home");
  const script = [
    "import { LocalMemoryStore } from './core/src/index.mjs';",
    "const store = new LocalMemoryStore();",
    "console.log(store.getRootDir());"
  ].join("");

  const result = spawnSync(nodeBin, ["--input-type=module", "-e", script], {
    cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), "../.."),
    env: {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome
    },
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout.trim(),
    path.resolve(fakeHome, ".codex/plugins/codex-memory/data")
  );
});

test("local store initializes canonical artifacts and metadata", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "codex-memory-store-"));
  const store = new LocalMemoryStore({ rootDir });
  const paths = store.getArtifactsPath();

  const metadata = await readJson(paths.metadata);
  assert.equal(metadata.store_schema_version, "1");

  for (const filePath of [
    paths.events,
    paths.atoms,
    paths.edges,
    paths.capsules,
    paths.indexes.scope,
    paths.indexes.type,
    paths.indexes.confidence,
    paths.indexes.recency
  ]) {
    const content = await readFile(filePath, "utf8");
    assert.equal(typeof content, "string");
  }
});

test("local store applies redaction before event durable writes", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "codex-memory-store-redaction-"));
  const store = new LocalMemoryStore({ rootDir });
  const memoryStore = store.loadMemoryStore();

  const persisted = store.persistEvent({
    id: "evt-safe",
    scope: {
      level: "repository",
      repository_id: "repo-a",
      scope_key: "repo::repo-a"
    },
    provenance: { producer: "test" },
    event_type: "BEFORE_PROMPT",
    occurred_at: "2026-04-14T10:00:00.000Z",
    payload: {
      prompt_excerpt: "token=abc1234567890 should never persist raw"
    }
  }, memoryStore);

  assert.equal(persisted.persisted, true);

  const blocked = store.persistEvent({
    id: "evt-blocked",
    scope: {
      level: "repository",
      repository_id: "repo-a",
      scope_key: "repo::repo-a"
    },
    provenance: { producer: "test" },
    event_type: "AFTER_RESPONSE",
    occurred_at: "2026-04-14T10:01:00.000Z",
    payload: {
      response_excerpt: "-----BEGIN PRIVATE KEY----- super-sensitive"
    }
  }, memoryStore);

  assert.equal(blocked.persisted, false);

  const paths = store.getArtifactsPath();
  const eventsLines = (await readFile(paths.events, "utf8")).trim().split("\n").filter(Boolean);
  assert.equal(eventsLines.length, 1);

  const persistedEvent = JSON.parse(eventsLines[0]);
  assert.match(persistedEvent.payload.prompt_excerpt, /REDACTED_TOKEN/);
});

test("local store persists promoted atoms/edges/capsules and rebuilds indexes", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "codex-memory-store-consolidation-"));
  const store = new LocalMemoryStore({ rootDir });
  const memoryStore = store.loadMemoryStore();

  const consolidation = {
    promoted_atoms: [
      {
        id: "atom-1",
        scope: {
          level: "repository",
          repository_id: "repo-a",
          scope_key: "repo::repo-a"
        },
        provenance: { producer: "test" },
        atom_type: "workflow",
        content: "run node --test",
        confidence: 0.9,
        created_at: "2026-04-14T10:01:00.000Z"
      }
    ],
    promoted_edges: [
      {
        id: "edge-1",
        scope: {
          level: "repository",
          repository_id: "repo-a",
          scope_key: "repo::repo-a"
        },
        provenance: { producer: "test" },
        edge_type: "supersedes",
        from_memory_id: "atom-1",
        to_memory_id: "atom-0",
        confidence: 0.8,
        created_at: "2026-04-14T10:02:00.000Z"
      }
    ],
    promoted_capsule: {
      id: "cap-1",
      scope: {
        level: "repository",
        repository_id: "repo-a",
        scope_key: "repo::repo-a"
      },
      provenance: { producer: "test" },
      summary: "Session learned durable workflow",
      source_memory_ids: ["atom-1"],
      confidence: 0.9,
      created_at: "2026-04-14T10:03:00.000Z"
    },
    dropped: [],
    warnings: []
  };

  const result = store.persistConsolidation(consolidation, memoryStore);
  assert.equal(result.persisted, true);

  const paths = store.getArtifactsPath();
  const atomLines = (await readFile(paths.atoms, "utf8")).trim().split("\n").filter(Boolean);
  const edgeLines = (await readFile(paths.edges, "utf8")).trim().split("\n").filter(Boolean);
  const capsuleLines = (await readFile(paths.capsules, "utf8")).trim().split("\n").filter(Boolean);
  assert.equal(atomLines.length, 1);
  assert.equal(edgeLines.length, 1);
  assert.equal(capsuleLines.length, 1);

  const scopeIndex = await readJson(paths.indexes.scope);
  const typeIndex = await readJson(paths.indexes.type);
  assert.ok(scopeIndex["repo::repo-a"].includes("atom-1"));
  assert.ok(typeIndex.MemoryAtom.includes("atom-1"));
});

test("local store analyzes duplicates and noise, compacts safely, and rebuilds indexes idempotently", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "codex-memory-store-compact-"));
  const store = new LocalMemoryStore({ rootDir });
  const memoryStore = store.loadMemoryStore();

  memoryStore.events.push(
    {
      id: "evt-1a",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test", session_ref: "s-1" },
      event_type: "BEFORE_PROMPT",
      occurred_at: "2026-04-14T10:00:00.000Z",
      captured_at: "2026-04-14T10:00:01.000Z",
      payload: { prompt_excerpt: "You are a helpful assistant." }
    },
    {
      id: "evt-1b",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test", session_ref: "s-1" },
      event_type: "BEFORE_PROMPT",
      occurred_at: "2026-04-14T10:00:00.000Z",
      captured_at: "2026-04-14T10:00:02.000Z",
      payload: { prompt_excerpt: "You are a helpful assistant." }
    },
    {
      id: "evt-2",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test", session_ref: "s-2" },
      event_type: "BEFORE_PROMPT",
      occurred_at: "2026-04-14T10:05:00.000Z",
      captured_at: "2026-04-14T10:05:01.000Z",
      payload: { prompt_excerpt: "Always run node --test before finalize." }
    }
  );

  memoryStore.atoms.push(
    {
      id: "atom-noise-a",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test" },
      atom_type: "fact",
      content: "You are a helpful assistant",
      confidence: 0.72,
      created_at: "2026-04-14T10:10:00.000Z"
    },
    {
      id: "atom-noise-b",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test" },
      atom_type: "fact",
      content: "You are a helpful assistant",
      confidence: 0.72,
      created_at: "2026-04-14T10:10:01.000Z"
    },
    {
      id: "atom-good",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test" },
      atom_type: "workflow",
      content: "Always run node --test before finalize changes",
      confidence: 0.91,
      created_at: "2026-04-14T10:11:00.000Z"
    }
  );

  memoryStore.edges.push(
    {
      id: "edge-a",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test" },
      edge_type: "related_to",
      from_memory_id: "atom-good",
      to_memory_id: "atom-noise-a",
      confidence: 0.7,
      created_at: "2026-04-14T10:12:00.000Z"
    },
    {
      id: "edge-b",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test" },
      edge_type: "related_to",
      from_memory_id: "atom-good",
      to_memory_id: "atom-noise-a",
      confidence: 0.7,
      created_at: "2026-04-14T10:12:01.000Z"
    },
    {
      id: "edge-orphan",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test" },
      edge_type: "related_to",
      from_memory_id: "atom-good",
      to_memory_id: "atom-missing",
      confidence: 0.6,
      created_at: "2026-04-14T10:12:02.000Z"
    }
  );

  memoryStore.capsules.push(
    {
      id: "capsule-a",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test" },
      summary: "Session learned durable workflow",
      source_memory_ids: ["atom-good"],
      confidence: 0.9,
      created_at: "2026-04-14T10:13:00.000Z"
    },
    {
      id: "capsule-b",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test" },
      summary: "Session learned durable workflow",
      source_memory_ids: ["atom-good"],
      confidence: 0.9,
      created_at: "2026-04-14T10:13:01.000Z"
    },
    {
      id: "capsule-noise-inherited",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test" },
      summary: "Session learned durable fact",
      source_memory_ids: ["atom-noise-a"],
      confidence: 0.9,
      created_at: "2026-04-14T10:13:02.000Z"
    }
  );

  store.rewriteCanonicalArtifact("events", memoryStore.events);
  store.rewriteCanonicalArtifact("atoms", memoryStore.atoms);
  store.rewriteCanonicalArtifact("edges", memoryStore.edges);
  store.rewriteCanonicalArtifact("capsules", memoryStore.capsules);
  store.rebuildIndexes(memoryStore);

  const analysis = store.analyzeArtifacts();
  assert.equal(analysis.duplicate_counts.events, 1);
  assert.equal(analysis.duplicate_counts.atoms, 1);
  assert.equal(analysis.duplicate_counts.edges, 1);
  assert.equal(analysis.duplicate_counts.capsules, 1);
  assert.equal(analysis.noise_counts.atoms, 2);
  assert.equal(analysis.noise_counts.capsules, 1);
  assert.equal(analysis.orphan_counts.edges, 1);
  assert.equal(analysis.noise_reason_counts.atoms.generic_system_scaffolding, 2);
  assert.equal(analysis.noise_reason_counts.capsules.source_memory_noise_inherited, 1);

  const compacted = store.compactArtifacts({ apply: true });
  assert.equal(compacted.applied, true);
  assert.equal(compacted.removed.events, 1);
  assert.equal(compacted.removed.atoms, 2);
  assert.equal(compacted.removed.edges, 3);
  assert.equal(compacted.removed.capsules, 2);
  assert.equal(compacted.removed_breakdown.edges.duplicates, 1);
  assert.equal(compacted.removed_breakdown.edges.orphans, 2);
  assert.equal(compacted.removed_breakdown.capsules.noise, 1);

  const reloaded = store.loadMemoryStore();
  assert.equal(reloaded.events.length, 2);
  assert.equal(reloaded.atoms.length, 1);
  assert.equal(reloaded.edges.length, 0);
  assert.equal(reloaded.capsules.length, 1);
  assert.equal(reloaded.atoms[0].id, "atom-good");

  const paths = store.getArtifactsPath();
  const typeIndex = await readJson(paths.indexes.type);
  assert.ok(typeIndex.MemoryAtom.includes("atom-good"));
  assert.ok(!typeIndex.MemoryAtom.includes("atom-noise-a"));

  const secondPass = store.compactArtifacts({ apply: true });
  assert.deepEqual(secondPass.removed, {
    events: 0,
    atoms: 0,
    edges: 0,
    capsules: 0
  });
  assert.equal(secondPass.analysis_after.orphan_counts.edges, 0);
});
