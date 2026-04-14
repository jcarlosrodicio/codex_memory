import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { LocalMemoryStore } from "../src/index.mjs";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

test("SPEC-025 local store default path is stable and independent from workspace cwd", () => {
  const fakeHome = path.join(tmpdir(), "codex-memory-fake-home");
  const script = [
    "import { LocalMemoryStore } from './core/src/index.mjs';",
    "const store = new LocalMemoryStore();",
    "console.log(store.getRootDir());"
  ].join("");

  const result = spawnSync("node", ["--input-type=module", "-e", script], {
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

test("SPEC-025 local store initializes canonical artifacts and metadata", async () => {
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

test("SPEC-025 local store applies redaction before event durable writes", async () => {
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

test("SPEC-025 local store persists promoted atoms/edges/capsules and rebuilds indexes", async () => {
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
