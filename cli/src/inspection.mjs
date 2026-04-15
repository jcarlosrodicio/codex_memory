import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { LocalMemoryStore } from "../../core/src/index.mjs";

function readJsonIfExists(filePath, fallback) {
  if (!existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(readFileSync(filePath, "utf8"));
}

function parseNdjsonIfExists(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }

  const raw = readFileSync(filePath, "utf8");
  if (!raw.trim()) {
    return [];
  }

  return raw
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

export function loadInspectionData({ storePath }) {
  const store = new LocalMemoryStore({ rootDir: storePath });
  const memoryStore = store.loadMemoryStore();

  const runtimeRoot = path.join(storePath, "runtime");
  const statusPath = path.join(runtimeRoot, "status.json");
  const lastPackPath = path.join(runtimeRoot, "last-pack.json");
  const auditPath = path.join(runtimeRoot, "audit.ndjson");

  return {
    store,
    memoryStore,
    runtimeRoot,
    statusPath,
    status: readJsonIfExists(statusPath, null),
    lastPack: readJsonIfExists(lastPackPath, null),
    audits: parseNdjsonIfExists(auditPath)
  };
}

export function buildStatusReport({ storePath }) {
  const loaded = loadInspectionData({ storePath });
  const status = loaded.status ?? {
    health: "unknown",
    runtime_profile: "unknown",
    semantic_mode: "off",
    memory_enabled: false,
    learning_enabled: false,
    metrics: {
      pack_tokens: 0,
      retrieved_count: 0,
      dropped_count: 0,
      token_savings_estimate: 0
    },
    audit_last_updated_at: null,
    safety: {
      blocked_persistence_detected: false,
      redaction_detected: false,
      warning_count: 0
    }
  };

  return {
    command: "status",
    store_path: storePath,
    health: status.health,
    runtime_profile: status.runtime_profile,
    runtime: {
      memory_enabled: Boolean(status.memory_enabled),
      learning_enabled: Boolean(status.learning_enabled),
      semantic_mode: status.semantic_mode ?? "off"
    },
    metrics: {
      pack_tokens: Number(status.metrics?.pack_tokens ?? 0),
      retrieved_count: Number(status.metrics?.retrieved_count ?? 0),
      dropped_count: Number(status.metrics?.dropped_count ?? 0),
      token_savings_estimate: Number(status.metrics?.token_savings_estimate ?? 0),
      semantic_mode: status.semantic_mode ?? "off"
    },
    audit: {
      audit_last_updated_at: status.audit_last_updated_at,
      audit_record_count: loaded.audits.length
    },
    artifact_counts: {
      events: loaded.memoryStore.events.length,
      atoms: loaded.memoryStore.atoms.length,
      edges: loaded.memoryStore.edges.length,
      capsules: loaded.memoryStore.capsules.length
    }
  };
}

export function buildMetricsReport({ storePath }) {
  const loaded = loadInspectionData({ storePath });
  const promptAudits = loaded.audits.filter((item) => item.hook_event_name === "UserPromptSubmit");
  const latestStopAuditBySession = new Map();

  for (const audit of loaded.audits.filter((item) => item.hook_event_name === "Stop")) {
    const current = latestStopAuditBySession.get(audit.session_id);
    if (!current || String(audit.occurred_at ?? "").localeCompare(String(current.occurred_at ?? "")) > 0) {
      latestStopAuditBySession.set(audit.session_id, audit);
    }
  }

  const aggregates = {
    pack_build_count: promptAudits.length,
    avg_pack_tokens: 0,
    avg_retrieved_count: 0,
    avg_dropped_count: 0,
    avg_token_savings_estimate: 0
  };

  if (promptAudits.length > 0) {
    const totals = promptAudits.reduce((acc, item) => {
      acc.pack += Number(item.metrics?.pack_tokens ?? 0);
      acc.retrieved += Number(item.metrics?.retrieved_count ?? 0);
      acc.dropped += Number(item.metrics?.dropped_count ?? 0);
      acc.savings += Number(item.metrics?.token_savings_estimate ?? 0);
      return acc;
    }, {
      pack: 0,
      retrieved: 0,
      dropped: 0,
      savings: 0
    });

    aggregates.avg_pack_tokens = totals.pack / promptAudits.length;
    aggregates.avg_retrieved_count = totals.retrieved / promptAudits.length;
    aggregates.avg_dropped_count = totals.dropped / promptAudits.length;
    aggregates.avg_token_savings_estimate = totals.savings / promptAudits.length;
  }

  const learning = {
    sessions_observed: latestStopAuditBySession.size,
    filtered_by_quality_policy: 0,
    filtered_reasons: {},
    promoted_atoms: 0,
    promoted_capsules: 0
  };

  for (const audit of latestStopAuditBySession.values()) {
    learning.filtered_by_quality_policy += Number(audit.learning?.rejected_by_quality_policy ?? 0);
    learning.promoted_atoms += Number(audit.learning?.promoted_atoms ?? 0);
    learning.promoted_capsules += Number(audit.learning?.promoted_capsule ? 1 : 0);

    for (const [reason, count] of Object.entries(audit.learning?.filtered_reasons ?? {})) {
      learning.filtered_reasons[reason] = Number(learning.filtered_reasons[reason] ?? 0) + Number(count ?? 0);
    }
  }

  return {
    command: "metrics",
    runtime: {
      memory_enabled: Boolean(loaded.status?.memory_enabled ?? false),
      learning_enabled: Boolean(loaded.status?.learning_enabled ?? false),
      semantic_mode: loaded.status?.semantic_mode ?? "off"
    },
    latest: loaded.status?.metrics ?? {
      pack_tokens: 0,
      retrieved_count: 0,
      dropped_count: 0,
      token_savings_estimate: 0
    },
    aggregates,
    learning,
    safety: loaded.status?.safety ?? {
      blocked_persistence_detected: false,
      redaction_detected: false,
      warning_count: 0
    }
  };
}

export function buildInspectLastPackReport({ storePath }) {
  const loaded = loadInspectionData({ storePath });

  const fallback = loaded.audits
    .slice()
    .reverse()
    .find((item) => item.hook_event_name === "UserPromptSubmit") ?? null;

  const packSource = loaded.lastPack ?? (fallback
    ? {
      updated_at: fallback.occurred_at,
      session_id: fallback.session_id,
      decision_reason: fallback.decision.reason,
      metrics: {
        pack_tokens: Number(fallback.metrics?.pack_tokens ?? 0),
        retrieved_count: Number(fallback.metrics?.retrieved_count ?? 0),
        dropped_count: Number(fallback.metrics?.dropped_count ?? 0),
        token_savings_estimate: Number(fallback.metrics?.token_savings_estimate ?? 0)
      },
      pack: fallback.pack,
      safety: fallback.safety
    }
    : null);

  return {
    command: "inspect-last-pack",
    available: Boolean(packSource),
    pack: {
      updated_at: packSource?.updated_at ?? null,
      session_id: packSource?.session_id ?? null,
      decision_reason: packSource?.decision_reason ?? "no_pack_available",
      metrics: packSource?.metrics ?? {
        pack_tokens: 0,
        retrieved_count: 0,
        dropped_count: 0,
        token_savings_estimate: 0
      },
      included: packSource?.pack?.included ?? [],
      dropped: packSource?.pack?.dropped ?? []
    },
    safety: packSource?.safety ?? {
      blocked_persistence_detected: false,
      redaction_detected: false,
      warning_count: 0
    }
  };
}

export function buildInspectSessionReport({ storePath, sessionId }) {
  const encoded = encodeURIComponent(String(sessionId));
  const sessionPath = path.join(storePath, "runtime", "sessions", `${encoded}.json`);

  return {
    command: "inspect-session",
    session_id: sessionId,
    session_path: sessionPath,
    found: existsSync(sessionPath),
    session: readJsonIfExists(sessionPath, null)
  };
}

export function buildExplainAtomReport({ storePath, atomId }) {
  const loaded = loadInspectionData({ storePath });
  const atom = loaded.memoryStore.atoms.find((item) => String(item.id) === String(atomId)) ?? null;

  const connectedEdges = loaded.memoryStore.edges.filter((edge) => (
    String(edge.from_memory_id) === String(atomId)
    || String(edge.to_memory_id) === String(atomId)
  ));

  const relatedCapsules = loaded.memoryStore.capsules.filter((capsule) => (
    Array.isArray(capsule.source_memory_ids)
    && capsule.source_memory_ids.map((item) => String(item)).includes(String(atomId))
  ));

  return {
    command: "explain-atom",
    atom_id: atomId,
    found: Boolean(atom),
    atom,
    connected_edges: connectedEdges,
    related_capsules: relatedCapsules
  };
}

export function buildAnalyzeStoreReport({ storePath }) {
  const loaded = loadInspectionData({ storePath });
  const analysis = loaded.store.analyzeArtifacts(loaded.memoryStore);

  return {
    command: "analyze-store",
    store_path: storePath,
    artifacts: analysis.artifact_counts,
    duplicates: analysis.duplicate_counts,
    noise: analysis.noise_counts,
    orphans: analysis.orphan_counts,
    duplicate_examples: analysis.duplicate_examples,
    orphan_examples: analysis.orphan_examples,
    noise_examples: analysis.noise_examples,
    noise_reasons: analysis.noise_reason_counts
  };
}

export function buildCompactStoreReport({ storePath, apply = false }) {
  const store = new LocalMemoryStore({ rootDir: storePath });
  const result = store.compactArtifacts({ apply });

  return {
    ...result,
    store_path: storePath
  };
}
