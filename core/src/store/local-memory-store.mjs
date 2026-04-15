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
import { assessMemoryQuality, isNoiseMemoryRecord } from "../session/memory-quality-policy.mjs";
import { buildScopeKey, normalizeText } from "../retrieval/utils.mjs";

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

function countDefinedFields(record) {
  return Object.values(record ?? {}).filter((value) => value !== null && value !== undefined && value !== "").length;
}

function isoValue(value) {
  return String(value ?? "");
}

function canonicalText(value) {
  return normalizeText(String(value ?? ""));
}

function sortedArraySignature(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => String(item)))].sort((a, b) => a.localeCompare(b));
}

function eventSignature(record) {
  return JSON.stringify([
    record.event_type ?? "",
    buildScopeKey(record.scope),
    record.provenance?.session_ref ?? "",
    record.occurred_at ?? "",
    canonicalText(record.payload?.prompt_excerpt ?? ""),
    canonicalText(record.payload?.response_excerpt ?? ""),
    record.payload?.reason ?? "",
    JSON.stringify(sortedArraySignature(record.source_refs))
  ]);
}

function atomSignature(record) {
  return JSON.stringify([
    record.atom_type ?? "",
    buildScopeKey(record.scope),
    canonicalText(record.content),
    JSON.stringify(sortedArraySignature(record.source_event_ids)),
    JSON.stringify(sortedArraySignature(record.supersedes))
  ]);
}

function edgeSignature(record) {
  return JSON.stringify([
    record.edge_type ?? "",
    buildScopeKey(record.scope),
    record.from_memory_id ?? "",
    record.to_memory_id ?? ""
  ]);
}

function capsuleSignature(record) {
  return JSON.stringify([
    buildScopeKey(record.scope),
    canonicalText(record.summary),
    JSON.stringify(sortedArraySignature(record.source_memory_ids))
  ]);
}

function artifactSignature(artifactName, record) {
  if (artifactName === "events") {
    return eventSignature(record);
  }

  if (artifactName === "atoms") {
    return atomSignature(record);
  }

  if (artifactName === "edges") {
    return edgeSignature(record);
  }

  if (artifactName === "capsules") {
    return capsuleSignature(record);
  }

  return JSON.stringify(record);
}

function chooseCanonicalRecord(records = []) {
  return records
    .slice()
    .sort((left, right) => {
      const completeness = countDefinedFields(right) - countDefinedFields(left);
      if (completeness !== 0) {
        return completeness;
      }

      const reuseCount = Number(right.reuse_count ?? 0) - Number(left.reuse_count ?? 0);
      if (reuseCount !== 0) {
        return reuseCount;
      }

      const updated = isoValue(right.updated_at).localeCompare(isoValue(left.updated_at));
      if (updated !== 0) {
        return updated;
      }

      const created = isoValue(left.created_at ?? left.occurred_at ?? left.captured_at)
        .localeCompare(isoValue(right.created_at ?? right.occurred_at ?? right.captured_at));
      if (created !== 0) {
        return created;
      }

      return String(left.id ?? "").localeCompare(String(right.id ?? ""));
    })[0] ?? null;
}

function analyzeArtifactRecords(artifactName, records) {
  const grouped = new Map();

  for (const record of Array.isArray(records) ? records : []) {
    const signature = artifactSignature(artifactName, record);
    if (!grouped.has(signature)) {
      grouped.set(signature, []);
    }
    grouped.get(signature).push(record);
  }

  const duplicateGroups = [...grouped.values()].filter((group) => group.length > 1);
  return {
    total: Array.isArray(records) ? records.length : 0,
    duplicate_groups: duplicateGroups.length,
    duplicate_records: duplicateGroups.reduce((sum, group) => sum + group.length - 1, 0),
    duplicate_examples: duplicateGroups.slice(0, 5).map((group) => {
      const keptRecord = chooseCanonicalRecord(group);
      return {
        kept_id: keptRecord?.id ?? null,
        dropped_ids: group
          .filter((item) => item !== keptRecord)
          .map((item) => item.id)
      };
    })
  };
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

function incrementCounter(bucket, key) {
  const token = String(key ?? "unknown");
  bucket[token] = Number(bucket[token] ?? 0) + 1;
}

function qualityAssessmentForRecord(record) {
  if (record?.atom_type) {
    return assessMemoryQuality(record.content, { atomType: record.atom_type });
  }

  if (record?.summary) {
    return assessMemoryQuality(record.summary, { atomType: "capsule" });
  }

  return { accepted: true, reason: "non_quality_managed_record" };
}

function orphanEdges(records = [], validMemoryIds = new Set()) {
  return (Array.isArray(records) ? records : []).filter((record) => (
    !validMemoryIds.has(String(record.from_memory_id ?? ""))
    || !validMemoryIds.has(String(record.to_memory_id ?? ""))
  ));
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

  analyzeArtifacts(memoryStore = this.loadMemoryStore()) {
    const duplicateStats = {
      events: analyzeArtifactRecords("events", memoryStore.events),
      atoms: analyzeArtifactRecords("atoms", memoryStore.atoms),
      edges: analyzeArtifactRecords("edges", memoryStore.edges),
      capsules: analyzeArtifactRecords("capsules", memoryStore.capsules)
    };

    const noise = {
      atoms: (Array.isArray(memoryStore.atoms) ? memoryStore.atoms : []).filter((record) => isNoiseMemoryRecord(record)),
      capsules: (Array.isArray(memoryStore.capsules) ? memoryStore.capsules : []).filter((record) => isNoiseMemoryRecord(record))
    };
    const noiseReasonCounts = {
      atoms: {},
      capsules: {}
    };

    for (const record of noise.atoms) {
      incrementCounter(noiseReasonCounts.atoms, qualityAssessmentForRecord(record).reason);
    }

    for (const record of noise.capsules) {
      incrementCounter(noiseReasonCounts.capsules, qualityAssessmentForRecord(record).reason);
    }

    const validMemoryIds = new Set([
      ...(Array.isArray(memoryStore.atoms) ? memoryStore.atoms : []).map((record) => String(record.id)),
      ...(Array.isArray(memoryStore.capsules) ? memoryStore.capsules : []).map((record) => String(record.id))
    ]);
    const orphaned = {
      edges: orphanEdges(memoryStore.edges, validMemoryIds)
    };

    return {
      store_path: this.rootDir,
      artifact_counts: {
        events: memoryStore.events.length,
        atoms: memoryStore.atoms.length,
        edges: memoryStore.edges.length,
        capsules: memoryStore.capsules.length
      },
      duplicate_counts: {
        events: duplicateStats.events.duplicate_records,
        atoms: duplicateStats.atoms.duplicate_records,
        edges: duplicateStats.edges.duplicate_records,
        capsules: duplicateStats.capsules.duplicate_records
      },
      noise_counts: {
        atoms: noise.atoms.length,
        capsules: noise.capsules.length
      },
      orphan_counts: {
        edges: orphaned.edges.length
      },
      duplicate_examples: {
        events: duplicateStats.events.duplicate_examples,
        atoms: duplicateStats.atoms.duplicate_examples,
        edges: duplicateStats.edges.duplicate_examples,
        capsules: duplicateStats.capsules.duplicate_examples
      },
      orphan_examples: {
        edges: orphaned.edges.slice(0, 10).map((record) => ({
          id: record.id,
          from_memory_id: record.from_memory_id,
          to_memory_id: record.to_memory_id
        }))
      },
      noise_examples: {
        atoms: noise.atoms.slice(0, 10).map((record) => ({
          id: record.id,
          atom_type: record.atom_type,
          content: record.content
        })),
        capsules: noise.capsules.slice(0, 10).map((record) => ({
          id: record.id,
          summary: record.summary
        }))
      },
      noise_reason_counts: noiseReasonCounts
    };
  }

  compactArtifacts({ apply = false } = {}) {
    const current = this.loadMemoryStore();
    const analysis = this.analyzeArtifacts(current);

    if (!apply) {
      return {
        command: "compact-store",
        applied: false,
        reason: "compact-store requires --apply to rewrite canonical artifacts",
        removed: {
          events: analysis.duplicate_counts.events,
          atoms: analysis.duplicate_counts.atoms + analysis.noise_counts.atoms,
          edges: analysis.duplicate_counts.edges + analysis.orphan_counts.edges,
          capsules: analysis.duplicate_counts.capsules + analysis.noise_counts.capsules
        },
        analysis
      };
    }

    const dedupeArtifact = (artifactName, records) => {
      const grouped = new Map();
      for (const record of records) {
        const signature = artifactSignature(artifactName, record);
        if (!grouped.has(signature)) {
          grouped.set(signature, []);
        }
        grouped.get(signature).push(record);
      }

      return [...grouped.values()].map((group) => chooseCanonicalRecord(group)).filter(Boolean);
    };

    const dedupedEvents = dedupeArtifact("events", current.events);
    let dedupedAtoms = dedupeArtifact("atoms", current.atoms);
    let dedupedEdges = dedupeArtifact("edges", current.edges);
    let dedupedCapsules = dedupeArtifact("capsules", current.capsules);
    const removedBreakdown = {
      events: {
        duplicates: current.events.length - dedupedEvents.length
      },
      atoms: {
        duplicates: current.atoms.length - dedupedAtoms.length,
        noise: 0
      },
      edges: {
        duplicates: current.edges.length - dedupedEdges.length,
        orphans: 0
      },
      capsules: {
        duplicates: current.capsules.length - dedupedCapsules.length,
        noise: 0,
        orphaned_sources: 0
      }
    };

    const removedNoiseAtomIds = new Set(
      dedupedAtoms.filter((record) => isNoiseMemoryRecord(record)).map((record) => String(record.id))
    );
    removedBreakdown.atoms.noise = removedNoiseAtomIds.size;
    dedupedAtoms = dedupedAtoms.filter((record) => !removedNoiseAtomIds.has(String(record.id)));

    const survivingAtomIds = new Set(dedupedAtoms.map((record) => String(record.id)));
    const survivingMemoryIds = new Set([
      ...survivingAtomIds,
      ...dedupedCapsules.map((record) => String(record.id))
    ]);

    dedupedEdges = dedupedEdges.filter((record) => {
      const keep = (
        !removedNoiseAtomIds.has(String(record.from_memory_id))
        && !removedNoiseAtomIds.has(String(record.to_memory_id))
        && survivingMemoryIds.has(String(record.from_memory_id))
        && survivingMemoryIds.has(String(record.to_memory_id))
      );

      if (!keep) {
        removedBreakdown.edges.orphans += 1;
      }

      return keep;
    });

    const dedupedCapsulesBeforeQuality = dedupedCapsules.length;
    dedupedCapsules = dedupedCapsules.filter((record) => {
      return !isNoiseMemoryRecord(record);
    });
    removedBreakdown.capsules.noise = dedupedCapsulesBeforeQuality - dedupedCapsules.length;

    const capsulesBeforeOrphanCheck = dedupedCapsules.length;
    dedupedCapsules = dedupedCapsules.filter((record) => {
      const sourceIds = Array.isArray(record.source_memory_ids)
        ? record.source_memory_ids.map((item) => String(item))
        : [];

      return sourceIds.length === 0 || sourceIds.some((id) => survivingAtomIds.has(id));
    });
    removedBreakdown.capsules.orphaned_sources = capsulesBeforeOrphanCheck - dedupedCapsules.length;

    const cleanStore = {
      events: dedupedEvents,
      atoms: dedupedAtoms,
      edges: dedupedEdges,
      capsules: dedupedCapsules
    };

    this.rewriteCanonicalArtifact("events", cleanStore.events);
    this.rewriteCanonicalArtifact("atoms", cleanStore.atoms);
    this.rewriteCanonicalArtifact("edges", cleanStore.edges);
    this.rewriteCanonicalArtifact("capsules", cleanStore.capsules);
    this.rebuildIndexes(cleanStore);

    return {
      command: "compact-store",
      applied: true,
      removed: {
        events: current.events.length - cleanStore.events.length,
        atoms: current.atoms.length - cleanStore.atoms.length,
        edges: current.edges.length - cleanStore.edges.length,
        capsules: current.capsules.length - cleanStore.capsules.length
      },
      removed_breakdown: removedBreakdown,
      kept: {
        events: cleanStore.events.length,
        atoms: cleanStore.atoms.length,
        edges: cleanStore.edges.length,
        capsules: cleanStore.capsules.length
      },
      analysis_before: analysis,
      analysis_after: this.analyzeArtifacts(cleanStore)
    };
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
