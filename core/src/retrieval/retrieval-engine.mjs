import { DEFAULT_SEMANTIC_MODE } from "./constants.mjs";
import { ContextPackBuilder } from "./context-pack-builder.mjs";
import { GraphExpansionPolicy } from "./graph-expansion-policy.mjs";
import { LexicalRetrievalEngine } from "./lexical-retrieval-engine.mjs";
import { resolveSemanticCandidates } from "./semantic-backend-interface.mjs";

function mergeSemanticSignals(candidates, semanticCandidates) {
  const byId = new Map(candidates.map((candidate) => [candidate.memory_id, candidate]));

  for (const semanticCandidate of semanticCandidates) {
    const existing = byId.get(semanticCandidate.memory_id);
    if (!existing) {
      continue;
    }

    const semanticScore = Math.max(0, Math.min(1, Number(semanticCandidate.score ?? 0)));
    const mergedScore = Math.max(existing.score, Math.min(1, (existing.score * 0.8) + (semanticScore * 0.2)));

    byId.set(existing.memory_id, {
      ...existing,
      score: mergedScore,
      score_breakdown: {
        ...(existing.score_breakdown ?? {}),
        semantic: semanticScore,
        final: mergedScore
      },
      provenance: {
        ...(existing.provenance ?? {}),
        retrieval_stage: `${existing.provenance?.retrieval_stage ?? "retrieval"}+semantic`,
        why_included: [
          ...new Set([...(existing.provenance?.why_included ?? []), "semantic_merge"])
        ]
      }
    });
  }

  return [...byId.values()];
}

export class RetrievalEngine {
  constructor(options = {}) {
    this.semanticMode = options.semanticMode ?? DEFAULT_SEMANTIC_MODE;
    this.semanticBackend = options.semanticBackend;
    this.lexical = options.lexical ?? new LexicalRetrievalEngine(options.lexical_options);
    this.graph = options.graph ?? new GraphExpansionPolicy(options.graph_options);
    this.packBuilder = options.packBuilder ?? new ContextPackBuilder(options.pack_options);
  }

  async retrieve(taskContext = {}, options = {}) {
    const scope = options.scope ?? { level: "global", scope_key: "global" };
    const memoryStore = options.memoryStore ?? {};
    const memoryEnabled = options.memoryEnabled ?? true;

    if (!memoryEnabled) {
      const emptyPack = this.packBuilder.build({
        candidates: [],
        scope,
        tokenBudget: options.budget,
        semanticMode: this.semanticMode,
        memoryEnabled: false,
        retrievedCount: 0,
        retrievalDrops: []
      });

      return {
        context_pack: emptyPack,
        candidates: [],
        telemetry: {
          lexical: { scanned_count: 0, retrieved_count: 0, dropped_count: 0 },
          graph: { seed_count: 0, expanded_count: 0, dropped_count: 0 },
          semantic: {
            semantic_mode: this.semanticMode,
            status: "skipped",
            reason: "memory_disabled"
          }
        },
        metrics: emptyPack.metrics
      };
    }

    const lexicalResult = this.lexical.retrieve({
      taskContext,
      memoryStore,
      scope,
      filters: options.filters ?? {}
    });

    const graphResult = this.graph.apply({
      rankedCandidates: lexicalResult.candidates,
      memoryStore,
      scope
    });

    const semanticResult = await resolveSemanticCandidates({
      semanticMode: this.semanticMode,
      semanticBackend: this.semanticBackend,
      taskContext,
      limit: options.semantic_limit ?? 5
    });

    const mergedCandidates = mergeSemanticSignals(graphResult.candidates, semanticResult.candidates);

    const contextPack = this.packBuilder.build({
      candidates: mergedCandidates,
      scope,
      tokenBudget: options.budget,
      semanticMode: this.semanticMode,
      memoryEnabled: true,
      retrievedCount: mergedCandidates.length,
      retrievalDrops: [...lexicalResult.dropped, ...graphResult.dropped]
    });

    return {
      context_pack: contextPack,
      candidates: mergedCandidates,
      telemetry: {
        lexical: lexicalResult.stats,
        graph: graphResult.stats,
        semantic: {
          semantic_mode: semanticResult.semantic_mode,
          status: semanticResult.status,
          reason: semanticResult.reason,
          candidate_count: semanticResult.candidates.length
        }
      },
      metrics: contextPack.metrics
    };
  }
}
