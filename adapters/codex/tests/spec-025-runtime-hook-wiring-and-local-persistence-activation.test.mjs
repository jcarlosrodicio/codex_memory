import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalMemoryStore } from "../../../core/src/index.mjs";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");

async function readJson(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readNdjson(filePath) {
  const raw = await readFile(filePath, "utf8");
  if (!raw.trim()) {
    return [];
  }

  return raw
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function realCodexPayloads(sessionId) {
  return {
    sessionStart: {
      hook_event_name: "SessionStart",
      session_id: sessionId,
      cwd: repoRoot,
      model: "gpt-5.4"
    },
    userPromptSubmit: {
      hook_event_name: "UserPromptSubmit",
      session_id: sessionId,
      turn_id: "turn-1",
      cwd: repoRoot,
      model: "gpt-5.4",
      prompt: "Always run node --test before finalize"
    },
    stop: {
      hook_event_name: "Stop",
      session_id: sessionId,
      turn_id: "turn-1",
      cwd: repoRoot,
      model: "gpt-5.4",
      stop_hook_active: false,
      last_assistant_message: "We will run node --test first and fix failures."
    }
  };
}

async function invokeHook({ hook, payload, storePath, extraEnv = {} }) {
  const hookScript = path.join(repoRoot, "adapters/codex/bin/codex-memory-hook.mjs");
  const child = spawn("node", [hookScript, hook, "--store-path", storePath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...extraEnv
    }
  });

  child.stdin.write(JSON.stringify(payload));
  child.stdin.end();

  const output = await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`hook process failed (code=${code}): ${stderr}`));
        return;
      }

      resolve(stdout);
    });
  });

  return JSON.parse(String(output).trim());
}

test("SPEC-025 uses repo-level .codex/hooks.json with Codex-supported events", async () => {
  const hooksConfig = await readJson(".codex/hooks.json");
  const pluginManifest = await readJson(".codex-plugin/plugin.json");

  assert.deepEqual(Object.keys(hooksConfig.hooks).sort(), [
    "SessionStart",
    "Stop",
    "UserPromptSubmit"
  ]);

  for (const eventName of ["SessionStart", "UserPromptSubmit", "Stop"]) {
    const entries = hooksConfig.hooks[eventName];
    assert.ok(Array.isArray(entries) && entries.length > 0);

    const firstHook = entries[0].hooks?.[0];
    assert.equal(firstHook.type, "command");
    assert.match(firstHook.command, /codex-memory-hook\.mjs/);
  }

  assert.equal(typeof pluginManifest.hooks, "undefined");
});

test("SPEC-025 runtime no longer depends on .codex-plugin/hooks.json", async () => {
  await assert.rejects(
    readJson(".codex-plugin/hooks.json"),
    /ENOENT/
  );

  const storePath = await mkdtemp(path.join(tmpdir(), "codex-memory-runtime-no-plugin-hooks-"));
  const payloads = realCodexPayloads("s-spec-025-no-plugin-hooks");

  const started = await invokeHook({
    hook: "SessionStart",
    payload: payloads.sessionStart,
    storePath
  });

  assert.equal(started.continue, true);
});

test("SPEC-025 aligns UserPromptSubmit output with Codex hook contract", async () => {
  const storePath = await mkdtemp(path.join(tmpdir(), "codex-memory-runtime-userprompt-"));
  const payloads = realCodexPayloads("s-spec-025-userprompt");

  await invokeHook({
    hook: "SessionStart",
    payload: payloads.sessionStart,
    storePath
  });

  const before = await invokeHook({
    hook: "UserPromptSubmit",
    payload: payloads.userPromptSubmit,
    storePath
  });

  assert.equal(before.continue, true);

  if (before.hookSpecificOutput) {
    assert.equal(before.hookSpecificOutput.hookEventName, "UserPromptSubmit");
    assert.equal(typeof before.hookSpecificOutput.additionalContext, "string");
  }
});

test("SPEC-025 default persistence root resolves to ~/.codex/plugins/codex-memory/data", () => {
  const fakeHome = path.join(tmpdir(), "codex-memory-fake-home-adapter");
  const script = [
    "import { LocalMemoryStore } from './core/src/index.mjs';",
    "const store = new LocalMemoryStore();",
    "console.log(store.getRootDir());"
  ].join("");

  const result = spawnSync("node", ["--input-type=module", "-e", script], {
    cwd: repoRoot,
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

test("SPEC-025 e2e real Codex events write observable artifacts and respect flags", async () => {
  const storePath = await mkdtemp(path.join(tmpdir(), "codex-memory-runtime-e2e-real-"));
  const payloads = realCodexPayloads("s-spec-025-e2e-real");

  const started = await invokeHook({
    hook: "SessionStart",
    payload: payloads.sessionStart,
    storePath
  });
  assert.equal(started.continue, true);

  const before = await invokeHook({
    hook: "UserPromptSubmit",
    payload: payloads.userPromptSubmit,
    storePath
  });
  assert.equal(before.continue, true);

  const stop = await invokeHook({
    hook: "Stop",
    payload: payloads.stop,
    storePath
  });
  assert.equal(stop.continue, true);

  const store = new LocalMemoryStore({ rootDir: storePath });
  const paths = store.getArtifactsPath();
  const events = await readNdjson(paths.events);
  const atoms = await readNdjson(paths.atoms);
  const capsules = await readNdjson(paths.capsules);

  assert.ok(events.length >= 2);
  assert.ok(atoms.length >= 1);
  assert.ok(capsules.length >= 1);

  const learningOffStore = await mkdtemp(path.join(tmpdir(), "codex-memory-runtime-e2e-learning-off-"));
  const learningOffPayloads = realCodexPayloads("s-spec-025-learning-off");

  await invokeHook({
    hook: "SessionStart",
    payload: learningOffPayloads.sessionStart,
    storePath: learningOffStore,
    extraEnv: {
      CODEX_MEMORY_DISABLE_LEARNING: "true"
    }
  });
  await invokeHook({
    hook: "UserPromptSubmit",
    payload: learningOffPayloads.userPromptSubmit,
    storePath: learningOffStore,
    extraEnv: {
      CODEX_MEMORY_DISABLE_LEARNING: "true"
    }
  });
  await invokeHook({
    hook: "Stop",
    payload: learningOffPayloads.stop,
    storePath: learningOffStore,
    extraEnv: {
      CODEX_MEMORY_DISABLE_LEARNING: "true"
    }
  });

  const storeLearningOff = new LocalMemoryStore({ rootDir: learningOffStore });
  const learningOffPaths = storeLearningOff.getArtifactsPath();
  const eventsLearningOff = await readNdjson(learningOffPaths.events);
  const atomsLearningOff = await readNdjson(learningOffPaths.atoms);
  const edgesLearningOff = await readNdjson(learningOffPaths.edges);
  const capsulesLearningOff = await readNdjson(learningOffPaths.capsules);

  assert.ok(eventsLearningOff.length >= 2);
  assert.equal(atomsLearningOff.length, 0);
  assert.equal(edgesLearningOff.length, 0);
  assert.equal(capsulesLearningOff.length, 0);
});
