import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalMemoryStore } from "../../../core/src/index.mjs";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const nodeBin = process.execPath;

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
  const child = spawn(nodeBin, [hookScript, hook, "--store-path", storePath], {
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

test("global memory kill switch disables injection and learning while keeping runtime alive", async () => {
  const storePath = await mkdtemp(path.join(tmpdir(), "codex-memory-spec021-kill-switch-"));
  const payloads = realCodexPayloads("s-kill-switch");

  const started = await invokeHook({
    hook: "SessionStart",
    payload: payloads.sessionStart,
    storePath,
    extraEnv: {
      CODEX_MEMORY_DISABLE_MEMORY: "true"
    }
  });
  assert.equal(started.continue, true);

  const before = await invokeHook({
    hook: "UserPromptSubmit",
    payload: payloads.userPromptSubmit,
    storePath,
    extraEnv: {
      CODEX_MEMORY_DISABLE_MEMORY: "true"
    }
  });
  assert.equal(before.continue, true);
  assert.equal(typeof before.systemMessage, "string");
  assert.match(before.systemMessage, /memory_kill_switch_active/);

  const stopped = await invokeHook({
    hook: "Stop",
    payload: payloads.stop,
    storePath,
    extraEnv: {
      CODEX_MEMORY_DISABLE_MEMORY: "true"
    }
  });
  assert.equal(stopped.continue, true);

  const store = new LocalMemoryStore({ rootDir: storePath });
  const paths = store.getArtifactsPath();

  const atoms = await readNdjson(paths.atoms);
  const edges = await readNdjson(paths.edges);
  const capsules = await readNdjson(paths.capsules);

  assert.equal(atoms.length, 0);
  assert.equal(edges.length, 0);
  assert.equal(capsules.length, 0);
});

test("runtime profiles are recorded in runtime status artifacts", async () => {
  const storePath = await mkdtemp(path.join(tmpdir(), "codex-memory-spec021-profile-"));
  const payloads = realCodexPayloads("s-profile");

  await invokeHook({
    hook: "SessionStart",
    payload: payloads.sessionStart,
    storePath,
    extraEnv: {
      CODEX_MEMORY_RUNTIME_PROFILE: "strict"
    }
  });

  await invokeHook({
    hook: "UserPromptSubmit",
    payload: payloads.userPromptSubmit,
    storePath,
    extraEnv: {
      CODEX_MEMORY_RUNTIME_PROFILE: "strict"
    }
  });

  const statusPath = path.join(storePath, "runtime", "status.json");
  const status = JSON.parse(await readFile(statusPath, "utf8"));

  assert.equal(status.runtime_profile, "strict");
  assert.equal(typeof status.memory_enabled, "boolean");
  assert.equal(typeof status.learning_enabled, "boolean");
  assert.equal(typeof status.audit_last_updated_at, "string");
});

test("hooks_enabled defaults to true and false keeps runtime alive while skipping capture, injection, and learning", async () => {
  const storePath = await mkdtemp(path.join(tmpdir(), "codex-memory-spec021-hooks-enabled-"));
  const payloads = realCodexPayloads("s-hooks-enabled");

  await invokeHook({
    hook: "SessionStart",
    payload: payloads.sessionStart,
    storePath
  });

  let statusPath = path.join(storePath, "runtime", "status.json");
  let status = JSON.parse(await readFile(statusPath, "utf8"));
  assert.equal(status.hooks_enabled, true);

  const disabledStart = await invokeHook({
    hook: "SessionStart",
    payload: {
      ...payloads.sessionStart,
      session_id: "s-hooks-disabled"
    },
    storePath,
    extraEnv: {
      CODEX_MEMORY_HOOKS_ENABLED: "false"
    }
  });
  assert.equal(disabledStart.continue, true);

  const disabledPrompt = await invokeHook({
    hook: "UserPromptSubmit",
    payload: {
      ...payloads.userPromptSubmit,
      session_id: "s-hooks-disabled"
    },
    storePath,
    extraEnv: {
      CODEX_MEMORY_HOOKS_ENABLED: "false"
    }
  });
  assert.equal(disabledPrompt.continue, true);
  assert.equal(disabledPrompt.hookSpecificOutput, undefined);

  const disabledStop = await invokeHook({
    hook: "Stop",
    payload: {
      ...payloads.stop,
      session_id: "s-hooks-disabled"
    },
    storePath,
    extraEnv: {
      CODEX_MEMORY_HOOKS_ENABLED: "false"
    }
  });
  assert.equal(disabledStop.continue, true);

  status = JSON.parse(await readFile(statusPath, "utf8"));
  assert.equal(status.hooks_enabled, false);
  assert.equal(status.memory_enabled, false);
  assert.equal(status.learning_enabled, false);

  const store = new LocalMemoryStore({ rootDir: storePath });
  const currentStore = store.loadMemoryStore();
  assert.equal(currentStore.atoms.length, 0);
  assert.equal(currentStore.edges.length, 0);
  assert.equal(currentStore.capsules.length, 0);
});
