import { DEFAULT_LEXICAL_WEIGHTS } from "./constants.mjs";
import {
  asArray,
  clampScore,
  estimateTokens,
  isScopeCompatible,
  lexicalOverlapScore,
  normalizeScope,
  recencyScore,
  resolveMemoryText,
  reuseScore,
  scopeProximityScore,
  stableScoreSort,
  tokenize
} from "./utils.mjs";

function resolveMemoryType(memoryObject) {
  if (memoryObject.summary) {
    return "capsule";
  }

  return "atom";
}

function contentForMatch(memoryObject) {
  if (memoryObject.summary) {
    return `${memoryObject.summary} ${asArray(memoryObject.tags).join(" ")}`.trim();
  }

  return `${memoryObject.content ?? ""} ${asArray(memoryObject.tags).join(" ")}`.trim();
}

function resolveFreshnessMaxAgeDays(freshness) {
  if (freshness == null) {
    return null;
  }

  if (typeof freshness === "number" && Number.isFinite(freshness) && freshness >= 0) {
    return freshness;
  }

  if (
    typeof freshness === "object"
    && Number.isFinite(freshness.max_age_days)
    && freshness.max_age_days >= 0
  ) {
    return Number(freshness.max_age_days);
  }

  return null;
}

export class LexicalRetrievalEngine {
  constructor(options = {}) {
    this.weights = {
      ...DEFAULT_LEXICAL_WEIGHTS,
      ...(options.weights ?? {})
    };
    this.minLexicalScore = options.minLexicalScore ?? 0.05;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  retrieve({ taskContext = {}, memoryStore = {}, scope, filters = {} }) {
    const activeScope = normalizeScope(scope);
    const nowIso = this.now();
    const nowMs = Date.parse(nowIso);
    const queryTokens = tokenize(taskContext.text ?? taskContext.prompt ?? "");
    const freshnessMaxAgeDays = resolveFreshnessMaxAgeDays(filters.freshness);
    const memoryObjects = [
      ...asArray(memoryStore.atoms),
      ...asArray(memoryStore.capsules)
    ];

    const dropped = [];
    const candidates = [];

    for (const memoryObject of memoryObjects) {
      const objectScope = normalizeScope(memoryObject.scope);
      if (!isScopeCompatible(objectScope, activeScope)) {
        dropped.push({
          memory_id: memoryObject.id,
          reason: "scope_mismatch",
          stage: "lexical"
        });
        continue;
      }

      const memoryType = resolveMemoryType(memoryObject);
      if (filters.memory_types?.length && !filters.memory_types.includes(memoryType)) {
        dropped.push({
          memory_id: memoryObject.id,
          reason: "filtered_by_memory_type",
          stage: "lexical"
        });
        continue;
      }

      if (filters.atom_types?.length && memoryType === "atom") {
        if (!filters.atom_types.includes(memoryObject.atom_type)) {
          dropped.push({
            memory_id: memoryObject.id,
            reason: "filtered_by_atom_type",
            stage: "lexical"
          });
          continue;
        }
      }

      if (filters.tags?.length) {
        const tags = asArray(memoryObject.tags);
        const matchedTag = filters.tags.some((tag) => tags.includes(tag));
        if (!matchedTag) {
          dropped.push({
            memory_id: memoryObject.id,
            reason: "filtered_by_tag",
            stage: "lexical"
          });
          continue;
        }
      }

      if (freshnessMaxAgeDays !== null) {
        const freshnessTimestamp = memoryObject.updated_at ?? memoryObject.created_at;
        const freshnessMs = Date.parse(freshnessTimestamp ?? "");

        if (!Number.isFinite(freshnessMs) || !Number.isFinite(nowMs)) {
          dropped.push({
            memory_id: memoryObject.id,
            reason: "filtered_by_freshness_missing_timestamp",
            stage: "lexical"
          });
          continue;
        }

        const ageDays = Math.max(0, (nowMs - freshnessMs) / (24 * 60 * 60 * 1000));
        if (ageDays > freshnessMaxAgeDays) {
          dropped.push({
            memory_id: memoryObject.id,
            reason: "filtered_by_freshness",
            stage: "lexical"
          });
          continue;
        }
      }

      const lexical = lexicalOverlapScore(queryTokens, tokenize(contentForMatch(memoryObject)));
      if (lexical < this.minLexicalScore && !filters.allow_low_lexical_match) {
        dropped.push({
          memory_id: memoryObject.id,
          reason: "below_lexical_threshold",
          stage: "lexical"
        });
        continue;
      }

      const scopeScore = scopeProximityScore(objectScope, activeScope);
      const confidenceScore = clampScore(Number(memoryObject.confidence ?? 0.5));
      const recency = recencyScore(memoryObject.updated_at ?? memoryObject.created_at, nowIso);
      const reuse = reuseScore(memoryObject);

      const finalScore = clampScore(
        (lexical * this.weights.lexical)
        + (scopeScore * this.weights.scope)
        + (confidenceScore * this.weights.confidence)
        + (recency * this.weights.recency)
        + (reuse * this.weights.reuse)
      );

      const text = resolveMemoryText(memoryObject);

      candidates.push({
        memory_id: memoryObject.id,
        memory_type: memoryType,
        atom_type: memoryObject.atom_type ?? null,
        scope: objectScope,
        content: text,
        created_at: memoryObject.created_at,
        updated_at: memoryObject.updated_at,
        supersedes: asArray(memoryObject.supersedes),
        superseded_by: asArray(memoryObject.superseded_by),
        score: finalScore,
        score_breakdown: {
          lexical,
          scope: scopeScore,
          confidence: confidenceScore,
          recency,
          reuse,
          final: finalScore
        },
        token_estimate: Number(memoryObject.token_estimate ?? estimateTokens(text)),
        provenance: {
          retrieval_stage: "lexical",
          why_included: [
            "lexical_match",
            "scope_compatible",
            "deterministic_ranked"
          ]
        }
      });
    }

    const ranked = stableScoreSort(candidates);

    return {
      query_tokens: queryTokens,
      candidates: ranked,
      dropped,
      stats: {
        scanned_count: memoryObjects.length,
        retrieved_count: ranked.length,
        dropped_count: dropped.length
      }
    };
  }
}
