import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { LocalMemoryStore } from "../../../../core/src/index.mjs";
import { CodexMemoryAdapter } from "../codex-memory-adapter.mjs";

const HOOK_METHOD_MAP = Object.freeze({
  SessionStart: "onSessionStart",
  UserPromptSubmit: "onBeforePrompt",
  Stop: "onStop",
  on_session_start: "onSessionStart",
  on_before_prompt: "onBeforePrompt",
  on_after_response: "onAfterResponse",
  on_session_end: "onSessionEnd",
  onSessionStart: "onSessionStart",
  onBeforePrompt: "onBeforePrompt",
  onAfterResponse: "onAfterResponse",
  onSessionEnd: "onSessionEnd"
});

function parseArgs(argv) {
  const args = {
    hook: argv[2] ?? "",
    payloadFile: null,
    storePath: null
  };

  for (let index = 3; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];

    if (flag === "--payload-file" && next) {
      args.payloadFile = next;
      index += 1;
      continue;
    }

    if (flag === "--store-path" && next) {
      args.storePath = next;
      index += 1;
    }
  }

  return args;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function boolFromEnv(name) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function defaultStorePath() {
  return path.resolve(homedir(), ".codex/plugins/codex-memory/data");
}

function safeSessionRef(sessionId) {
  return encodeURIComponent(String(sessionId ?? "unknown"));
}

function loadJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function loadPayload({ payloadFile, stdinRaw }) {
  if (payloadFile) {
    return loadJsonFile(payloadFile);
  }

  const envPayload = process.env.CODEX_MEMORY_HOOK_PAYLOAD;
  const source = (stdinRaw && stdinRaw.trim().length > 0)
    ? stdinRaw
    : (envPayload && envPayload.trim().length > 0 ? envPayload : "{}");

  return JSON.parse(source);
}

function inferGitBranch(cwd) {
  if (!cwd) {
    return null;
  }

  const result = spawnSync("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    return null;
  }

  const value = String(result.stdout ?? "").trim();
  return value.length > 0 ? value : null;
}

function inferRepositoryId(cwd) {
  if (!cwd) {
    return null;
  }

  return path.basename(cwd);
}

function runtimePaths(storeRoot) {
  const runtimeRoot = path.join(storeRoot, "runtime");
  const sessionRoot = path.join(runtimeRoot, "sessions");

  mkdirSync(sessionRoot, { recursive: true });

  return {
    runtimeRoot,
    sessionRoot
  };
}

function sessionStatePath(sessionRoot, sessionId) {
  return path.join(sessionRoot, `${safeSessionRef(sessionId)}.json`);
}

function restoreSessionState(adapter, sessionRoot, sessionId) {
  if (!sessionId) {
    return;
  }

  const statePath = sessionStatePath(sessionRoot, sessionId);
  if (!existsSync(statePath)) {
    return;
  }

  const state = loadJsonFile(statePath);
  adapter.sessions.set(sessionId, state);
}

function persistSessionState(adapter, sessionRoot, sessionId) {
  if (!sessionId) {
    return;
  }

  const statePath = sessionStatePath(sessionRoot, sessionId);

  if (!adapter.sessions.has(sessionId)) {
    if (existsSync(statePath)) {
      rmSync(statePath, { force: true });
    }

    return;
  }

  writeFileSync(statePath, JSON.stringify(adapter.sessions.get(sessionId), null, 2), "utf8");
}

function normalizeControls(payload, fallback = {}) {
  return {
    disable_injection: Boolean(
      payload?.controls?.disable_injection
      ?? payload?.user_visible_controls?.disable_injection
      ?? fallback.disable_injection
      ?? boolFromEnv("CODEX_MEMORY_DISABLE_INJECTION")
    ),
    disable_learning: Boolean(
      payload?.controls?.disable_learning
      ?? payload?.user_visible_controls?.disable_learning
      ?? fallback.disable_learning
      ?? boolFromEnv("CODEX_MEMORY_DISABLE_LEARNING")
    )
  };
}

function normalizeForSessionStart(payload) {
  const cwd = payload.cwd ?? process.cwd();
  const controls = normalizeControls(payload);

  return {
    session_id: payload.session_id,
    started_at: payload.started_at ?? payload.occurred_at ?? new Date().toISOString(),
    runtime: {
      surface: payload.surface ?? "cli",
      version: payload.codex_version ?? "unknown"
    },
    workspace: {
      root_path: cwd,
      repository: payload.workspace?.repository ?? inferRepositoryId(cwd),
      branch: payload.workspace?.branch ?? inferGitBranch(cwd)
    },
    controls
  };
}

function normalizeForBeforePrompt(payload, controls) {
  return {
    session_id: payload.session_id,
    occurred_at: payload.occurred_at ?? new Date().toISOString(),
    prompt_id: payload.turn_id ?? `turn_${Date.now()}`,
    prompt_text: payload.prompt ?? payload.user_prompt ?? "",
    user_visible_controls: controls,
    budget_hint: payload.budget_hint ?? null
  };
}

function normalizeForStop(payload, controls) {
  return {
    session_id: payload.session_id,
    occurred_at: payload.occurred_at ?? new Date().toISOString(),
    prompt_id: payload.turn_id ?? `turn_${Date.now()}`,
    assistant_response: payload.last_assistant_message ?? "",
    response_stats: payload.response_stats ?? null,
    controls
  };
}

function toCodexHookOutput(hookName, adapterResult) {
  const warnings = Array.isArray(adapterResult?.warnings) ? adapterResult.warnings : [];
  const warningMessage = warnings.length > 0
    ? `Codex Memory: ${warnings.join("; ")}`
    : null;

  if (hookName === "UserPromptSubmit") {
    if (adapterResult?.decision_summary?.reason === "session_not_started") {
      return warningMessage ? { continue: true, systemMessage: warningMessage } : { continue: true };
    }

    if (adapterResult?.inject_context && adapterResult?.context_pack?.content) {
      return {
        continue: true,
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: adapterResult.context_pack.content
        },
        ...(warningMessage ? { systemMessage: warningMessage } : {})
      };
    }

    return warningMessage ? { continue: true, systemMessage: warningMessage } : { continue: true };
  }

  if (hookName === "Stop") {
    return warningMessage ? { continue: true, systemMessage: warningMessage } : { continue: true };
  }

  return warningMessage ? { continue: true, systemMessage: warningMessage } : { continue: true };
}

function ensureLegacyOutput(result, hookName) {
  if (result && typeof result === "object") {
    return result;
  }

  return {
    status: "degraded",
    warnings: [`hook_return_invalid:${hookName}`]
  };
}

async function runRealCodexHook(hookName, adapter, payload, paths) {
  const controls = normalizeControls(payload);

  if (hookName === "SessionStart") {
    const result = adapter.onSessionStart(normalizeForSessionStart(payload));
    return toCodexHookOutput(hookName, result);
  }

  if (hookName === "UserPromptSubmit") {
    if (!adapter.sessions.has(payload.session_id)) {
      adapter.onSessionStart(normalizeForSessionStart(payload));
    }

    const beforePrompt = await adapter.onBeforePrompt(normalizeForBeforePrompt(payload, controls));
    return toCodexHookOutput(hookName, beforePrompt);
  }

  if (hookName === "Stop") {
    if (!adapter.sessions.has(payload.session_id)) {
      adapter.onSessionStart(normalizeForSessionStart(payload));
    }

    const stop = adapter.onStop(normalizeForStop(payload, controls));
    return toCodexHookOutput(hookName, stop);
  }

  throw new Error(`Unsupported real hook: ${hookName}`);
}

async function runLegacyHook(methodName, adapter, payload) {
  if (methodName === "onSessionStart") {
    return adapter.onSessionStart(payload);
  }

  if (methodName === "onBeforePrompt") {
    return adapter.onBeforePrompt(payload);
  }

  if (methodName === "onAfterResponse") {
    return adapter.onAfterResponse(payload);
  }

  if (methodName === "onSessionEnd") {
    return adapter.onSessionEnd(payload);
  }

  throw new Error(`Unsupported legacy method: ${methodName}`);
}

export async function runHookRuntime(argv = process.argv) {
  const args = parseArgs(argv);
  const methodName = HOOK_METHOD_MAP[args.hook];

  if (!methodName) {
    const invalid = {
      continue: true,
      systemMessage: `Codex Memory: unsupported_hook:${args.hook}`
    };
    process.stdout.write(`${JSON.stringify(invalid)}\n`);
    return;
  }

  const stdinRaw = await readStdin();
  let payload;

  try {
    payload = loadPayload({ payloadFile: args.payloadFile, stdinRaw });
  } catch (error) {
    const parseFailure = {
      continue: true,
      systemMessage: `Codex Memory: payload_parse_failed:${String(error)}`
    };
    process.stdout.write(`${JSON.stringify(parseFailure)}\n`);
    return;
  }

  const storeRoot = path.resolve(args.storePath ?? defaultStorePath());

  let store;
  let memoryStore;
  const startupWarnings = [];

  try {
    store = new LocalMemoryStore({
      rootDir: storeRoot
    });
    memoryStore = store.loadMemoryStore();
  } catch (error) {
    startupWarnings.push(`store_init_failed:${String(error)}`);
    memoryStore = {
      events: [],
      atoms: [],
      edges: [],
      capsules: []
    };
  }

  const adapter = new CodexMemoryAdapter({
    memoryStore,
    persistence: store ?? null
  });

  const sessionId = payload?.session_id ?? null;
  const paths = runtimePaths(storeRoot);
  restoreSessionState(adapter, paths.sessionRoot, sessionId);

  let output;
  try {
    if (["SessionStart", "UserPromptSubmit", "Stop"].includes(args.hook)) {
      output = await runRealCodexHook(args.hook, adapter, payload, paths);
    } else {
      const legacyResult = await runLegacyHook(methodName, adapter, payload);
      output = ensureLegacyOutput(legacyResult, args.hook);
    }
  } catch (error) {
    output = ["SessionStart", "UserPromptSubmit", "Stop"].includes(args.hook)
      ? {
        continue: true,
        systemMessage: `Codex Memory: hook_execution_failed:${String(error)}`
      }
      : {
        status: "degraded",
        warnings: [`hook_execution_failed:${String(error)}`]
      };
  }

  persistSessionState(adapter, paths.sessionRoot, sessionId);

  if (startupWarnings.length > 0) {
    if (["SessionStart", "UserPromptSubmit", "Stop"].includes(args.hook)) {
      output.systemMessage = [
        output.systemMessage,
        `Codex Memory: ${startupWarnings.join("; ")}`
      ].filter(Boolean).join("\n");
      if (typeof output.continue !== "boolean") {
        output.continue = true;
      }
    } else {
      output.warnings = [...startupWarnings, ...(Array.isArray(output.warnings) ? output.warnings : [])];
    }
  }

  process.stdout.write(`${JSON.stringify(output)}\n`);
}
