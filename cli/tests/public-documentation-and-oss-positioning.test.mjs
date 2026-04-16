import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

async function readDoc(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test("public docs describe runtime activation, cleanup workflow, and good-memory policy consistently", async () => {
  const [
    readme,
    installation,
    roadmap,
    spec020,
    architecture,
    security,
    cliReadme
  ] = await Promise.all([
    readDoc("README.md"),
    readDoc("docs/installation.md"),
    readDoc("docs/spec-roadmap.md"),
    readDoc("docs/specs/spec-020-public-documentation-and-oss-positioning.md"),
    readDoc("docs/architecture.md"),
    readDoc("docs/security-and-privacy.md"),
    readDoc("cli/README.md")
  ]);

  for (const doc of [readme, installation, cliReadme]) {
    assert.match(doc, /analyze-store/);
    assert.match(doc, /compact-store/);
    assert.match(doc, /--apply/);
  }

  for (const doc of [readme, architecture, security, spec020]) {
    assert.match(doc, /good memory|durable memory|memory quality/i);
    assert.match(doc, /You are a helpful assistant/);
    assert.match(doc, /generic|noise|scaffolding/i);
  }

  assert.match(readme, /~\/\.codex\/plugins\/codex-memory\/data/);
  assert.match(installation, /codex_hooks\s*=\s*true/);
  assert.match(roadmap, /SPEC-020/);
  assert.match(roadmap, /public docs/i);
});
