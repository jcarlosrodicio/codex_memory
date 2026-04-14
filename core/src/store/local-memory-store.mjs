import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SecretRedactionGate } from "../session/secret-redaction-gate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = path.resolve(__dirname, "../../contracts/memory-store-layout.v1.json");
const STORE_METADATA_FILE = "store.meta.json";

function loadStoreLayoutContract() {
  const raw = readFileSync(CONTRACT_PATH, "utf8");
  return JSON.parse(raw);
}

function defaultStoreRoot() {
  const fromEnv = process.env.CODEX_MEMORY_STORE_DIR;
  if (fromEnv && String(fromEnv).trim().length > 0) {
    return path.resolve(fromEnv);
  }

  return path.resolve(homedir(), ".codex/plugins/codex-memory/data");
}

function parseNdjson(raw, filePath) {
  if (!raw.trim()) {
    return [];
  }

  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid NDJSON line ${index + 1} in ${filePath}: ${String(error)}`);
      }
    });
}

function serializeNdjson(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return "";
  }

  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function stableUnique(values) {
  const unique = new Set(values.filter(Boolean).map((value) => String(value)));
  return [...unique].sort((a, b) => a.localeCompare(b));
}

function stablePush(map, key, id) {
  const targetKey = String(key ?? "unknown");
  if (!map[targetKey]) {
    map[targetKey] = [];
  }

  if (!map[targetKey].includes(id)) {
    map[targetKey].push(id);
  }
}

function recencyValue(record) {
  return (
    record.updated_at
    ?? record.occurred_at
    ?? record.created_at
    ?? record.captured_at
    ?? null
  );
}

function detectRecordType(record) {
  if (record.event_type) {
    return "MemoryEvent";
  }

  if (record.atom_type) {
    return "MemoryAtom";
  }

  if (record.edge_type) {
    return "MemoryEdge";
  }

  if (record.summary) {
    return "MemoryCapsule";
  }

  return "Unknown";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneWithRedaction({ value, redactionGate, contextPath, findings }) {
  if (typeof value === "string") {
    const inspected = redactionGate.inspect(value, {
      id: contextPath.join(".")
    });

    findings.push({
      path: contextPath.join("."),
      outcome: inspected.outcome,
      reason_codes: inspected.reason_codes,
      audit_ref: inspected.audit_ref
    });

    if (inspected.outcome === "block") {
      return {
        blocked: true,
        value: ""
      };
    }

    return {
      blocked: false,
      value: inspected.value
    };
  }

  if (Array.isArray(value)) {
    const next = [];
    for (let index = 0; index < value.length; index += 1) {
      const child = cloneWithRedaction({
        value: value[index],
        redactionGate,
        contextPath: [...contextPath, String(index)],
        findings
      });

      if (child.blocked) {
        return {
          blocked: true,
          value: []
        };
      }

      next.push(child.value);
    }

    return {
      blocked: false,
      value: next
    };
  }

  if (isObject(value)) {
    const next = {};
    for (const [key, rawChild] of Object.entries(value)) {
      const child = cloneWithRedaction({
        value: rawChild,
        redactionGate,
        contextPath: [...contextPath, key],
        findings
      });

      if (child.blocked) {
        return {
          blocked: true,
          value: {}
        };
      }

      next[key] = child.value;
    }

    return {
      blocked: false,
      value: next
    };
  }

  return {
    blocked: false,
    value
  };
}

export class LocalMemoryStore {
  constructor(options = {}) {
    this.layout = options.layout ?? loadStoreLayoutContract();
    this.storeSchemaVersion = String(options.storeSchemaVersion ?? this.layout.store_schema_version ?? "1");
    this.rootDir = path.resolve(options.rootDir ?? defaultStoreRoot());
    this.redactionGate = options.redactionGate ?? new SecretRedactionGate({
      auditPrefix: "store-redaction"
    });

    this._artifactNames = {
      events: this.layout.canonical_persisted_artifacts.events.artifact,
      atoms: this.layout.canonical_persisted_artifacts.atoms.artifact,
      edges: this.layout.canonical_persisted_artifacts.edges.artifact,
      capsules: this.layout.canonical_persisted_artifacts.capsules.artifact
    };

    this._indexNames = {
      scope: this.layout.index_strategy.indexes.scope.artifact,
      type: this.layout.index_strategy.indexes.type.artifact,
      confidence: this.layout.index_strategy.indexes.confidence.artifact,
      recency: this.layout.index_strategy.indexes.recency.artifact
    };

    this._ensureInitialized();
  }

  getRootDir() {
    return this.rootDir;
  }

  getArtifactsPath() {
    return {
      metadata: path.join(this.rootDir, STORE_METADATA_FILE),
      events: path.join(this.rootDir, this._artifactNames.events),
      atoms: path.join(this.rootDir, this._artifactNames.atoms),
      edges: path.join(this.rootDir, this._artifactNames.edges),
      capsules: path.join(this.rootDir, this._artifactNames.capsules),
      indexes: {
        scope: path.join(this.rootDir, this._indexNames.scope),
        type: path.join(this.rootDir, this._indexNames.type),
        confidence: path.join(this.rootDir, this._indexNames.confidence),
        recency: path.join(this.rootDir, this._indexNames.recency)
      }
    };
  }

  loadMemoryStore() {
    const paths = this.getArtifactsPath();

    return {
      events: parseNdjson(readFileSync(paths.events, "utf8"), paths.events),
      atoms: parseNdjson(readFileSync(paths.atoms, "utf8"), paths.atoms),
      edges: parseNdjson(readFileSync(paths.edges, "utf8"), paths.edges),
      capsules: parseNdjson(readFileSync(paths.capsules, "utf8"), paths.capsules)
    };
  }

  persistEvent(memoryEvent, memoryStore) {
    const screened = this._screenRecord("event", memoryEvent);
    if (!screened.persisted) {
      return screened;
    }

    const paths = this.getArtifactsPath();
    appendFileSync(paths.events, `${JSON.stringify(screened.record)}\n`, "utf8");

    if (memoryStore && Array.isArray(memoryStore.events)) {
      memoryStore.events.push(screened.record);
      this.rebuildIndexes(memoryStore);
    }

    this._touchMetadata();

    return {
      persisted: true,
      record: screened.record,
      warnings: screened.warnings
    };
  }

  persistConsolidation(consolidation, memoryStore) {
    const warnings = [];

    const atoms = Array.isArray(consolidation?.promoted_atoms) ? consolidation.promoted_atoms : [];
    const edges = Array.isArray(consolidation?.promoted_edges) ? consolidation.promoted_edges : [];
    const capsule = consolidation?.promoted_capsule ? [consolidation.promoted_capsule] : [];

    for (const atom of atoms) {
      const result = this._appendRecord("atoms", atom, memoryStore?.atoms);
      warnings.push(...result.warnings);
    }

    for (const edge of edges) {
      const result = this._appendRecord("edges", edge, memoryStore?.edges);
      warnings.push(...result.warnings);
    }

    for (const item of capsule) {
      const result = this._appendRecord("capsules", item, memoryStore?.capsules);
      warnings.push(...result.warnings);
    }

    if (Array.isArray(consolidation?.dropped) && consolidation.dropped.some((item) => item.reason === "deduplicated_existing_atom")) {
      this.rewriteCanonicalArtifact("atoms", memoryStore?.atoms ?? []);
    }

    if (memoryStore) {
      this.rebuildIndexes(memoryStore);
    }

    this._touchMetadata();

    return {
      persisted: true,
      warnings: stableUnique(warnings)
    };
  }

  rewriteCanonicalArtifact(artifactName, records) {
    const paths = this.getArtifactsPath();
    const key = artifactName;

    if (!Object.prototype.hasOwnProperty.call(paths, key)) {
      throw new Error(`Unknown artifact for rewrite: ${artifactName}`);
    }

    const normalized = Array.isArray(records)
      ? records.map((record) => ({ ...record, schema_version: this.storeSchemaVersion }))
      : [];

    writeFileSync(paths[key], serializeNdjson(normalized), "utf8");
    this._touchMetadata();
  }

  rebuildIndexes(memoryStore) {
    const indexes = {
      scope: {},
      type: {},
      confidence: {},
      recency: {}
    };

    const records = [
      ...(Array.isArray(memoryStore?.events) ? memoryStore.events : []),
      ...(Array.isArray(memoryStore?.atoms) ? memoryStore.atoms : []),
      ...(Array.isArray(memoryStore?.edges) ? memoryStore.edges : []),
      ...(Array.isArray(memoryStore?.capsules) ? memoryStore.capsules : [])
    ];

    for (const record of records) {
      const id = String(record.id ?? "");
      if (!id) {
        continue;
      }

      stablePush(indexes.scope, record.scope?.scope_key ?? "unknown", id);

      const typeTokens = [
        detectRecordType(record),
        record.atom_type,
        record.edge_type,
        record.event_type
      ].filter(Boolean);
      for (const token of typeTokens) {
        stablePush(indexes.type, token, id);
      }

      if (typeof record.confidence === "number" && Number.isFinite(record.confidence)) {
        stablePush(indexes.confidence, record.confidence.toFixed(2), id);
      }

      const recency = recencyValue(record);
      if (recency) {
        stablePush(indexes.recency, recency, id);
      }
    }

    for (const key of Object.keys(indexes)) {
      for (const bucket of Object.keys(indexes[key])) {
        indexes[key][bucket] = stableUnique(indexes[key][bucket]);
      }
    }

    const paths = this.getArtifactsPath();
    writeFileSync(paths.indexes.scope, JSON.stringify(indexes.scope, null, 2), "utf8");
    writeFileSync(paths.indexes.type, JSON.stringify(indexes.type, null, 2), "utf8");
    writeFileSync(paths.indexes.confidence, JSON.stringify(indexes.confidence, null, 2), "utf8");
    writeFileSync(paths.indexes.recency, JSON.stringify(indexes.recency, null, 2), "utf8");
  }

  _appendRecord(artifactName, record, inMemoryTarget) {
    const warnings = [];
    const screened = this._screenRecord(artifactName, record);

    if (!screened.persisted) {
      warnings.push(...screened.warnings);
      return {
        persisted: false,
        warnings
      };
    }

    const paths = this.getArtifactsPath();
    appendFileSync(paths[artifactName], `${JSON.stringify(screened.record)}\n`, "utf8");

    if (Array.isArray(inMemoryTarget)) {
      const index = inMemoryTarget.findIndex((item) => item.id === screened.record.id);
      if (index >= 0) {
        inMemoryTarget[index] = screened.record;
      } else {
        inMemoryTarget.push(screened.record);
      }
    }

    warnings.push(...screened.warnings);

    return {
      persisted: true,
      record: screened.record,
      warnings
    };
  }

  _screenRecord(recordType, record) {
    const findings = [];
    const normalizedRecord = {
      ...record,
      schema_version: String(record?.schema_version ?? this.storeSchemaVersion)
    };

    const screened = cloneWithRedaction({
      value: normalizedRecord,
      redactionGate: this.redactionGate,
      contextPath: [recordType, normalizedRecord.id ?? "unknown"],
      findings
    });

    if (screened.blocked) {
      return {
        persisted: false,
        warnings: [
          `persistence_blocked:${recordType}:${normalizedRecord.id ?? "unknown"}`,
          ...stableUnique(findings.flatMap((item) => item.reason_codes ?? []))
        ]
      };
    }

    const redactionReasons = stableUnique(
      findings
        .filter((item) => item.outcome === "redact")
        .flatMap((item) => item.reason_codes ?? [])
    );

    return {
      persisted: true,
      record: screened.value,
      warnings: redactionReasons.map((code) => `persistence_redacted:${recordType}:${code}`)
    };
  }

  _ensureInitialized() {
    mkdirSync(this.rootDir, { recursive: true });

    const paths = this.getArtifactsPath();
    if (existsSync(paths.metadata)) {
      const metadata = JSON.parse(readFileSync(paths.metadata, "utf8"));
      const discoveredVersion = String(metadata.store_schema_version ?? "");

      if (discoveredVersion !== this.storeSchemaVersion) {
        throw new Error(
          `Unknown store schema version: ${discoveredVersion}. Expected ${this.storeSchemaVersion}.`
        );
      }
    } else {
      writeFileSync(paths.metadata, JSON.stringify({
        store_schema_version: this.storeSchemaVersion,
        spec_id: this.layout.spec_id,
        storage_profile: this.layout.storage_profile,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, null, 2), "utf8");
    }

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
      if (!existsSync(filePath)) {
        writeFileSync(filePath, filePath.endsWith(".ndjson") ? "" : "{}", "utf8");
      }
    }
  }

  _touchMetadata() {
    const paths = this.getArtifactsPath();
    const metadata = JSON.parse(readFileSync(paths.metadata, "utf8"));
    metadata.updated_at = new Date().toISOString();
    writeFileSync(paths.metadata, JSON.stringify(metadata, null, 2), "utf8");
  }
}
