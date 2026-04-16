import {
  appendFileSync,
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

const RUNTIME_PROFILE_DEFAULTS = Object.freeze({
  minimal: {
    max_prompt_chars: 4000,
    max_response_chars: 4000,
    max_event_buffer: 80,
    max_signal_buffer: 20,
    max_promoted_signals: 12
  },
  standard: {
    max_prompt_chars: 16000,
    max_response_chars: 16000,
    max_event_buffer: 200,
    max_signal_buffer: 80,
    max_promoted_signals: 40
  },
  strict: {
    max_prompt_chars: 2400,
    max_response_chars: 2400,
    max_event_buffer: 60,
    max_signal_buffer: 16,
    max_promoted_signals: 8
  }
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

function boolFromEnvDefault(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim().length === 0) {
    return fallback;
  }

  return boolFromEnv(name);
}

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim().length === 0) {
    return fallback;
  }

  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
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
    sessionRoot,
    auditPath: path.join(runtimeRoot, "audit.ndjson"),
    statusPath: path.join(runtimeRoot, "status.json"),
    lastPackPath: path.join(runtimeRoot, "last-pack.json")
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

function resolveRuntimeControls(payload, fallback = {}) {
  const requestedProfile = String(process.env.CODEX_MEMORY_RUNTIME_PROFILE ?? "standard").trim().toLowerCase();
  const hasProfile = Object.prototype.hasOwnProperty.call(RUNTIME_PROFILE_DEFAULTS, requestedProfile);
  const profile = hasProfile ? requestedProfile : "standard";
  const profileDefaults = RUNTIME_PROFILE_DEFAULTS[profile];

  const killSwitchMemory = boolFromEnv("CODEX_MEMORY_DISABLE_MEMORY");

  const controls = {
    hooks_enabled: Boolean(
      payload?.controls?.hooks_enabled
      ?? payload?.user_visible_controls?.hooks_enabled
      ?? fallback.hooks_enabled
      ?? boolFromEnvDefault("CODEX_MEMORY_HOOKS_ENABLED", true)
    ),
    disable_injection: Boolean(
      killSwitchMemory
      || payload?.controls?.disable_injection
      || payload?.user_visible_controls?.disable_injection
      || fallback.disable_injection
      || boolFromEnv("CODEX_MEMORY_DISABLE_INJECTION")
    ),
    disable_learning: Boolean(
      killSwitchMemory
      || payload?.controls?.disable_learning
      || payload?.user_visible_controls?.disable_learning
      || fallback.disable_learning
      || boolFromEnv("CODEX_MEMORY_DISABLE_LEARNING")
    )
  };

  const phase_gates = {
    disable_capture: boolFromEnv("CODEX_MEMORY_DISABLE_CAPTURE"),
    disable_consolidation: boolFromEnv("CODEX_MEMORY_DISABLE_CONSOLIDATION")
  };

  const limits = {
    max_prompt_chars: intFromEnv("CODEX_MEMORY_MAX_PROMPT_CHARS", profileDefaults.max_prompt_chars),
    max_response_chars: intFromEnv("CODEX_MEMORY_MAX_RESPONSE_CHARS", profileDefaults.max_response_chars),
    max_event_buffer: intFromEnv("CODEX_MEMORY_MAX_EVENT_BUFFER", profileDefaults.max_event_buffer),
    max_signal_buffer: intFromEnv("CODEX_MEMORY_MAX_SIGNAL_BUFFER", profileDefaults.max_signal_buffer),
    max_promoted_signals: intFromEnv("CODEX_MEMORY_MAX_PROMOTED_SIGNALS", profileDefaults.max_promoted_signals)
  };

  const reason_codes = [];
  if (!hasProfile && requestedProfile.length > 0) {
    reason_codes.push("runtime_profile_invalid_fallback_standard");
  }
  if (killSwitchMemory) {
    reason_codes.push("memory_kill_switch_active");
  }
  if (!controls.hooks_enabled) {
    reason_codes.push("hooks_disabled");
  }
  if (phase_gates.disable_capture) {
    reason_codes.push("capture_phase_disabled");
  }
  if (phase_gates.disable_consolidation) {
    reason_codes.push("consolidation_phase_disabled");
  }

  return {
    profile,
    controls,
    phase_gates,
    limits,
    reason_codes
  };
}

function withTrimmedText(text, maxChars, reasonCode) {
  const value = String(text ?? "");
  if (!Number.isInteger(maxChars) || maxChars <= 0 || value.length <= maxChars) {
    return {
      text: value,
      warnings: []
    };
  }

  return {
    text: value.slice(0, maxChars),
    warnings: [`${reasonCode}:${value.length - maxChars}`]
  };
}

function normalizeForSessionStart(payload, runtimeControls) {
  const cwd = payload.cwd ?? process.cwd();

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
    controls: runtimeControls.controls
  };
}

function normalizeForBeforePrompt(payload, runtimeControls) {
  const trimmed = withTrimmedText(
    payload.prompt ?? payload.user_prompt ?? "",
    runtimeControls.limits.max_prompt_chars,
    "prompt_trimmed_by_runtime_limit"
  );

  return {
    normalized: {
      session_id: payload.session_id,
      occurred_at: payload.occurred_at ?? new Date().toISOString(),
      prompt_id: payload.turn_id ?? `turn_${Date.now()}`,
      prompt_text: trimmed.text,
      user_visible_controls: runtimeControls.controls,
      budget_hint: payload.budget_hint ?? null
    },
    warnings: trimmed.warnings
  };
}

function normalizeForStop(payload, runtimeControls) {
  const trimmed = withTrimmedText(
    payload.last_assistant_message ?? "",
    runtimeControls.limits.max_response_chars,
    "response_trimmed_by_runtime_limit"
  );

  return {
    normalized: {
      session_id: payload.session_id,
      occurred_at: payload.occurred_at ?? new Date().toISOString(),
      prompt_id: payload.turn_id ?? `turn_${Date.now()}`,
      assistant_response: trimmed.text,
      response_stats: payload.response_stats ?? null,
      controls: runtimeControls.controls
    },
    warnings: trimmed.warnings
  };
}

function mergeWarnings(adapterResult, extraWarnings = []) {
  if (!adapterResult || typeof adapterResult !== "object" || extraWarnings.length === 0) {
    return adapterResult;
  }

  return {
    ...adapterResult,
    warnings: [...new Set([...(Array.isArray(adapterResult.warnings) ? adapterResult.warnings : []), ...extraWarnings])]
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

function summarizeSafety(adapterResult) {
  const warnings = Array.isArray(adapterResult?.warnings) ? adapterResult.warnings : [];
  const persistenceWarnings = Array.isArray(adapterResult?.injection_metadata?.persistence_warnings)
    ? adapterResult.injection_metadata.persistence_warnings
    : [];

  const all = [...warnings, ...persistenceWarnings];

  return {
    blocked_persistence_detected: all.some((item) => String(item).includes("persistence_blocked") || String(item).includes("blocked_by_redaction")),
    redaction_detected: all.some((item) => String(item).includes("redacted") || String(item).includes("redaction")),
    warning_count: all.length
  };
}

function extractMetrics(adapterResult, runtimeControls) {
  const metrics = adapterResult?.injection_metadata?.pack_metrics ?? null;

  if (metrics) {
    return metrics;
  }

  return {
    pack_tokens: Number(adapterResult?.context_pack?.token_estimate ?? 0),
    retrieved_count: Number(adapterResult?.context_pack_audit?.included?.length ?? 0),
    dropped_count: Number(adapterResult?.context_pack_audit?.dropped?.length ?? 0),
    token_savings_estimate: 0,
    memory_enabled: runtimeControls.controls.hooks_enabled && !runtimeControls.controls.disable_injection,
    semantic_mode: "off"
  };
}

function buildHooksDisabledResult() {
  return {
    status: "ok",
    warnings: [],
    decision_summary: {
      reason: "hooks_disabled",
      audit_ref: null
    },
    inject_context: false,
    context_pack: null,
    context_pack_audit: {
      included: [],
      dropped: []
    },
    injection_metadata: {
      disabled_by_control: true,
      token_estimate: 0,
      pack_item_count: 0,
      pack_metrics: {
        pack_tokens: 0,
        retrieved_count: 0,
        dropped_count: 0,
        token_savings_estimate: 0,
        memory_enabled: false,
        semantic_mode: "off"
      },
      persistence_warnings: []
    },
    learning_stats: {
      signals_seen: 0,
      signals_promoted_to_buffer: 0,
      signals_rejected_by_quality_policy: 0,
      dropped_by_reason: {}
    },
    consolidation: {
      learning_enabled: false,
      promoted_atoms: [],
      promoted_edges: [],
      promoted_capsule: null,
      dropped: [],
      warnings: []
    }
  };
}

function countByReason(records = [], field = "reason") {
  const counts = {};
  for (const record of Array.isArray(records) ? records : []) {
    const key = String(record?.[field] ?? "unknown");
    counts[key] = Number(counts[key] ?? 0) + 1;
  }

  return counts;
}

function buildAuditRecord({ hookName, payload, runtimeControls, adapterResult }) {
  const now = new Date().toISOString();
  const warnings = Array.isArray(adapterResult?.warnings) ? adapterResult.warnings : [];
  const status = adapterResult?.status ?? (warnings.length > 0 ? "degraded" : "ok");

  return {
    audit_schema_version: "1",
    id: `audit_${Date.now()}_${safeSessionRef(payload?.session_id ?? "unknown")}_${hookName}`,
    occurred_at: now,
    session_id: payload?.session_id ?? null,
    hook_event_name: hookName,
    runtime_profile: runtimeControls.profile,
    controls: {
      ...runtimeControls.controls,
      ...runtimeControls.phase_gates
    },
    limits: runtimeControls.limits,
    decision: {
      status,
      reason: adapterResult?.decision_summary?.reason ?? null,
      inject_context: Boolean(adapterResult?.inject_context),
      degraded: status === "degraded" || warnings.length > 0,
      warnings
    },
    pack: {
      pack_id: adapterResult?.context_pack?.pack_id ?? adapterResult?.context_pack_audit?.pack_id ?? null,
      token_estimate: Number(adapterResult?.context_pack?.token_estimate ?? 0),
      included: adapterResult?.context_pack_audit?.included ?? [],
      dropped: adapterResult?.context_pack_audit?.dropped ?? []
    },
    metrics: extractMetrics(adapterResult, runtimeControls),
    safety: summarizeSafety(adapterResult),
    learning: {
      signals_seen: Number(adapterResult?.learning_stats?.signals_seen ?? 0),
      signals_promoted_to_buffer: Number(adapterResult?.learning_stats?.signals_promoted_to_buffer ?? 0),
      rejected_by_quality_policy: Number(adapterResult?.learning_stats?.signals_rejected_by_quality_policy ?? 0),
      filtered_reasons: adapterResult?.learning_stats?.dropped_by_reason ?? {},
      promoted_atoms: Number(adapterResult?.consolidation?.promoted_atoms?.length ?? 0),
      promoted_edges: Number(adapterResult?.consolidation?.promoted_edges?.length ?? 0),
      promoted_capsule: Boolean(adapterResult?.consolidation?.promoted_capsule),
      dropped_by_consolidation_reason: countByReason(adapterResult?.consolidation?.dropped)
    }
  };
}

function persistRuntimeAudit(paths, auditRecord) {
  appendFileSync(paths.auditPath, `${JSON.stringify(auditRecord)}\n`, "utf8");

  const status = {
    status_schema_version: "1",
    updated_at: auditRecord.occurred_at,
    runtime_profile: auditRecord.runtime_profile,
    last_hook: auditRecord.hook_event_name,
    last_session_id: auditRecord.session_id,
    health: auditRecord.decision.degraded ? "degraded" : "ok",
    hooks_enabled: Boolean(auditRecord.controls.hooks_enabled),
    memory_enabled: Boolean(auditRecord.metrics.memory_enabled),
    learning_enabled: Boolean(auditRecord.controls.hooks_enabled) && !auditRecord.controls.disable_learning,
    semantic_mode: auditRecord.metrics.semantic_mode ?? "off",
    metrics: {
      pack_tokens: Number(auditRecord.metrics.pack_tokens ?? 0),
      retrieved_count: Number(auditRecord.metrics.retrieved_count ?? 0),
      dropped_count: Number(auditRecord.metrics.dropped_count ?? 0),
      token_savings_estimate: Number(auditRecord.metrics.token_savings_estimate ?? 0)
    },
    safety: auditRecord.safety,
    audit_last_updated_at: auditRecord.occurred_at
  };

  writeFileSync(paths.statusPath, JSON.stringify(status, null, 2), "utf8");

  if (auditRecord.hook_event_name === "UserPromptSubmit") {
    writeFileSync(paths.lastPackPath, JSON.stringify({
      pack_schema_version: "1",
      updated_at: auditRecord.occurred_at,
      session_id: auditRecord.session_id,
      runtime_profile: auditRecord.runtime_profile,
      decision_reason: auditRecord.decision.reason,
      metrics: status.metrics,
      pack: auditRecord.pack,
      safety: auditRecord.safety
    }, null, 2), "utf8");
  }
}

async function runRealCodexHook(hookName, adapter, payload, runtimeControls) {
  const controlWarnings = [...runtimeControls.reason_codes];

  if (hookName === "SessionStart") {
    const result = mergeWarnings(adapter.onSessionStart(normalizeForSessionStart(payload, runtimeControls)), controlWarnings);
    return {
      output: toCodexHookOutput(hookName, result),
      adapterResult: result
    };
  }

  if (hookName === "UserPromptSubmit") {
    if (!adapter.sessions.has(payload.session_id)) {
      adapter.onSessionStart(normalizeForSessionStart(payload, runtimeControls));
    }

    const normalized = normalizeForBeforePrompt(payload, runtimeControls);
    const beforePrompt = mergeWarnings(
      await adapter.onBeforePrompt(normalized.normalized),
      [...controlWarnings, ...normalized.warnings]
    );

    return {
      output: toCodexHookOutput(hookName, beforePrompt),
      adapterResult: beforePrompt
    };
  }

  if (hookName === "Stop") {
    if (!adapter.sessions.has(payload.session_id)) {
      adapter.onSessionStart(normalizeForSessionStart(payload, runtimeControls));
    }

    const normalized = normalizeForStop(payload, runtimeControls);
    const stop = mergeWarnings(
      adapter.onStop(normalized.normalized),
      [...controlWarnings, ...normalized.warnings]
    );

    return {
      output: toCodexHookOutput(hookName, stop),
      adapterResult: stop
    };
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
  const runtimeControls = resolveRuntimeControls(payload);

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
    persistence: store ?? null,
    runtime_controls: {
      disable_capture: runtimeControls.phase_gates.disable_capture,
      disable_consolidation: runtimeControls.phase_gates.disable_consolidation,
      max_promoted_signals: runtimeControls.limits.max_promoted_signals
    },
    pipeline_options: {
      maxEventBuffer: runtimeControls.limits.max_event_buffer,
      maxSignalBuffer: runtimeControls.limits.max_signal_buffer
    }
  });

  const sessionId = payload?.session_id ?? null;
  const paths = runtimePaths(storeRoot);
  restoreSessionState(adapter, paths.sessionRoot, sessionId);

  let output;
  let adapterResult;
  try {
    if (["SessionStart", "UserPromptSubmit", "Stop"].includes(args.hook) && !runtimeControls.controls.hooks_enabled) {
      output = { continue: true };
      adapterResult = buildHooksDisabledResult();
    } else if (["SessionStart", "UserPromptSubmit", "Stop"].includes(args.hook)) {
      const execution = await runRealCodexHook(args.hook, adapter, payload, runtimeControls);
      output = execution.output;
      adapterResult = execution.adapterResult;
    } else {
      const legacyResult = await runLegacyHook(methodName, adapter, payload);
      output = ensureLegacyOutput(legacyResult, args.hook);
      adapterResult = legacyResult;
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

    adapterResult = {
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

  if (["SessionStart", "UserPromptSubmit", "Stop"].includes(args.hook)) {
    const auditedResult = mergeWarnings(adapterResult ?? {}, startupWarnings);
    const auditRecord = buildAuditRecord({
      hookName: args.hook,
      payload,
      runtimeControls,
      adapterResult: auditedResult
    });
    persistRuntimeAudit(paths, auditRecord);
  }

  process.stdout.write(`${JSON.stringify(output)}\n`);
}
