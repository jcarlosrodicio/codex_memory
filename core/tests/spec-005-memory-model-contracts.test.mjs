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

test("SPEC-005 defines the five canonical memory objects with explicit boundaries", async () => {
  const model = await loadJson("core/contracts/memory-model.canonical.v1.json");

  assert.equal(model.spec_id, "SPEC-005");
  assert.deepEqual(Object.keys(model.canonical_objects).sort(), [
    "ContextPack",
    "MemoryAtom",
    "MemoryCapsule",
    "MemoryEdge",
    "MemoryEvent"
  ]);

  for (const objectName of Object.keys(model.canonical_objects)) {
    const object = model.canonical_objects[objectName];
    assert.ok(object.purpose, `${objectName} must define purpose`);
    assert.ok(object.boundary, `${objectName} must define boundary`);
  }

  assert.equal(model.canonical_objects.MemoryEvent.durable, false);
  assert.equal(model.canonical_objects.MemoryAtom.durable, true);
  assert.equal(model.canonical_objects.MemoryCapsule.compressed, true);
  assert.equal(model.canonical_objects.MemoryEdge.directional, true);
  assert.equal(model.canonical_objects.ContextPack.ephemeral, true);
  assert.equal(model.canonical_objects.ContextPack.bounded, true);
  assert.equal(model.canonical_objects.ContextPack.explainable, true);
});

test("SPEC-005 makes required vs optional fields explicit per canonical object", async () => {
  const model = await loadJson("core/contracts/memory-model.canonical.v1.json");

  for (const [objectName, object] of Object.entries(model.canonical_objects)) {
    assert.ok(Array.isArray(object.required_fields), `${objectName} required_fields must be an array`);
    assert.ok(Array.isArray(object.optional_fields), `${objectName} optional_fields must be an array`);
    assert.ok(object.required_fields.length > 0, `${objectName} must declare required fields`);
  }
});

test("SPEC-005 enforces required identity, scope, and provenance fields", async () => {
  const model = await loadJson("core/contracts/memory-model.canonical.v1.json");

  for (const [objectName, object] of Object.entries(model.canonical_objects)) {
    assert.ok(
      object.required_fields.includes("id"),
      `${objectName} must require identity field id`
    );
    assert.ok(
      object.required_fields.includes("scope"),
      `${objectName} must require scope field`
    );
    assert.ok(
      object.required_fields.includes("provenance"),
      `${objectName} must require provenance field`
    );
  }
});

test("SPEC-005 fixes the v1 durable MemoryAtom type taxonomy", async () => {
  const model = await loadJson("core/contracts/memory-model.canonical.v1.json");

  assert.deepEqual(model.memory_atom_type_taxonomy_v1, [
    "preference",
    "workflow",
    "decision",
    "constraint",
    "bugfix",
    "fact",
    "artifact",
    "open_loop"
  ]);
});
