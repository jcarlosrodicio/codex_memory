import { DEFAULT_SEMANTIC_MODE } from "./constants.mjs";
import { asArray } from "./utils.mjs";

export class SemanticBackend {
  getCapabilities() {
    throw new Error("SemanticBackend.getCapabilities must be implemented by adapters.");
  }

  async healthCheck() {
    throw new Error("SemanticBackend.healthCheck must be implemented by adapters.");
  }

  async index() {
    throw new Error("SemanticBackend.index must be implemented by adapters.");
  }

  async search() {
    throw new Error("SemanticBackend.search must be implemented by adapters.");
  }
}

export class NullSemanticBackend extends SemanticBackend {
  getCapabilities() {
    return {
      available: false,
      reason: "semantic_mode_off"
    };
  }

  async healthCheck() {
    return {
      healthy: false,
      reason: "semantic_mode_off"
    };
  }

  async index() {
    return {
      indexed_count: 0,
      skipped: true,
      reason: "semantic_mode_off"
    };
  }

  async search() {
    return {
      candidates: [],
      skipped: true,
      reason: "semantic_mode_off"
    };
  }
}

export async function resolveSemanticCandidates({
  semanticMode = DEFAULT_SEMANTIC_MODE,
  semanticBackend,
  taskContext = {},
  limit = 5
}) {
  if (semanticMode === "off") {
    return {
      semantic_mode: "off",
      status: "skipped",
      reason: "semantic_mode_off",
      candidates: []
    };
  }

  if (!semanticBackend) {
    return {
      semantic_mode: semanticMode,
      status: "degraded",
      reason: "semantic_backend_missing",
      candidates: []
    };
  }

  const health = await semanticBackend.healthCheck();
  if (!health?.healthy) {
    return {
      semantic_mode: semanticMode,
      status: "degraded",
      reason: "semantic_backend_unhealthy",
      candidates: []
    };
  }

  try {
    const response = await semanticBackend.search({
      query: String(taskContext.text ?? taskContext.prompt ?? ""),
      limit
    });

    const normalizedCandidates = asArray(response?.candidates).map((candidate) => ({
      memory_id: candidate.memory_id,
      score: Number(candidate.score ?? 0),
      provenance: {
        retrieval_stage: "semantic",
        why_included: ["semantic_similarity"],
        backend: candidate.backend ?? null
      }
    }));

    return {
      semantic_mode: semanticMode,
      status: "ok",
      reason: "semantic_backend_used",
      candidates: normalizedCandidates
    };
  } catch (error) {
    return {
      semantic_mode: semanticMode,
      status: "degraded",
      reason: "semantic_backend_error",
      candidates: [],
      error: String(error)
    };
  }
}
