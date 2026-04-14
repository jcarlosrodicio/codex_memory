import { DEFAULT_GRAPH_POLICY, GRAPH_EDGE_TYPES_V1 } from "./constants.mjs";
import {
  asArray,
  clampScore,
  estimateTokens,
  isScopeCompatible,
  normalizeScope,
  resolveMemoryText,
  stableScoreSort
} from "./utils.mjs";

function memoryById(memoryStore) {
  const byId = new Map();

  for (const atom of asArray(memoryStore.atoms)) {
    byId.set(atom.id, atom);
  }

  for (const capsule of asArray(memoryStore.capsules)) {
    byId.set(capsule.id, capsule);
  }

  return byId;
}

function edgeIsSupported(edge) {
  return GRAPH_EDGE_TYPES_V1.includes(edge.edge_type);
}

function isEdgeEligible(edge, activeScope) {
  return edgeIsSupported(edge) && isScopeCompatible(edge.scope, activeScope);
}

function candidateFromMemory(memoryObject) {
  const text = resolveMemoryText(memoryObject);
  return {
    memory_id: memoryObject.id,
    memory_type: memoryObject.summary ? "capsule" : "atom",
    atom_type: memoryObject.atom_type ?? null,
    scope: normalizeScope(memoryObject.scope),
    content: text,
    created_at: memoryObject.created_at,
    updated_at: memoryObject.updated_at,
    token_estimate: Number(memoryObject.token_estimate ?? estimateTokens(text))
  };
}

function withGraphBonus(candidate, bonus, details) {
  const score = clampScore(candidate.score + bonus);

  return {
    ...candidate,
    score,
    score_breakdown: {
      ...(candidate.score_breakdown ?? {}),
      graph_bonus: (candidate.score_breakdown?.graph_bonus ?? 0) + bonus,
      final: score
    },
    provenance: {
      ...(candidate.provenance ?? {}),
      retrieval_stage: candidate.provenance?.retrieval_stage === "lexical" ? "lexical+graph" : "graph",
      why_included: [
        ...new Set([...(candidate.provenance?.why_included ?? []), "graph_expansion"])
      ],
      graph_path: [
        ...(candidate.provenance?.graph_path ?? []),
        details
      ]
    }
  };
}

function applyConflictResolution(candidates, edges) {
  const byId = new Map(candidates.map((candidate) => [candidate.memory_id, candidate]));
  const dropped = [];

  const supersededPairs = [];
  for (const edge of edges) {
    if (edge.edge_type === "supersedes") {
      supersededPairs.push({
        winner: edge.from_memory_id,
        loser: edge.to_memory_id,
        source: "edge"
      });
    }
  }

  for (const candidate of byId.values()) {
    for (const supersededId of asArray(candidate.supersedes)) {
      supersededPairs.push({
        winner: candidate.memory_id,
        loser: supersededId,
        source: "candidate.supersedes"
      });
    }

    for (const winnerId of asArray(candidate.superseded_by)) {
      supersededPairs.push({
        winner: winnerId,
        loser: candidate.memory_id,
        source: "candidate.superseded_by"
      });
    }
  }

  for (const relation of supersededPairs) {
    if (!byId.has(relation.winner) || !byId.has(relation.loser)) {
      continue;
    }

    byId.delete(relation.loser);
    dropped.push({
      memory_id: relation.loser,
      reason: "superseded_candidate",
      stage: "graph_conflict_resolution",
      resolution_action: "drop_superseded_candidates",
      winning_memory_id: relation.winner,
      suppressed_memory_ids: [relation.loser],
      source: relation.source
    });
  }

  const contradictionPairs = [];
  for (const edge of edges) {
    if (edge.edge_type !== "contradicts") {
      continue;
    }

    contradictionPairs.push([edge.from_memory_id, edge.to_memory_id]);
  }

  for (const [leftId, rightId] of contradictionPairs) {
    const left = byId.get(leftId);
    const right = byId.get(rightId);
    if (!left || !right) {
      continue;
    }

    const winner = left.score >= right.score ? left : right;
    const loser = winner.memory_id === left.memory_id ? right : left;
    byId.delete(loser.memory_id);

    dropped.push({
      memory_id: loser.memory_id,
      reason: "contradiction_suppressed",
      stage: "graph_conflict_resolution",
      resolution_action: "pair_contradictions",
      winning_memory_id: winner.memory_id,
      suppressed_memory_ids: [loser.memory_id],
      source: "edge"
    });
  }

  return {
    candidates: stableScoreSort([...byId.values()]),
    dropped
  };
}

export class GraphExpansionPolicy {
  constructor(options = {}) {
    this.policy = {
      ...DEFAULT_GRAPH_POLICY,
      ...options,
      edge_weight_by_type: {
        ...DEFAULT_GRAPH_POLICY.edge_weight_by_type,
        ...(options.edge_weight_by_type ?? {})
      }
    };
  }

  apply({ rankedCandidates = [], memoryStore = {}, scope }) {
    const activeScope = normalizeScope(scope);
    const graphDropped = [];
    const edgeList = asArray(memoryStore.edges).filter((edge) => isEdgeEligible(edge, activeScope));

    const byId = memoryById(memoryStore);
    const candidateMap = new Map(rankedCandidates.map((candidate) => [candidate.memory_id, candidate]));

    const seeds = rankedCandidates.slice(0, this.policy.seed_limit);

    let expandedCount = 0;
    for (const seed of seeds) {
      const queue = [{ memory_id: seed.memory_id, depth: 0 }];
      const seen = new Set([seed.memory_id]);
      let breadthUsed = 0;

      while (queue.length > 0) {
        const current = queue.shift();

        if (!current || current.depth >= this.policy.max_depth) {
          continue;
        }

        const connectedEdges = edgeList.filter(
          (edge) => edge.from_memory_id === current.memory_id || edge.to_memory_id === current.memory_id
        );

        for (const edge of connectedEdges) {
          const neighborId = edge.from_memory_id === current.memory_id
            ? edge.to_memory_id
            : edge.from_memory_id;

          if (seen.has(neighborId)) {
            continue;
          }

          if (breadthUsed >= this.policy.max_breadth_per_seed) {
            graphDropped.push({
              memory_id: neighborId,
              reason: "graph_breadth_limit",
              stage: "graph"
            });
            continue;
          }

          if (expandedCount >= this.policy.max_expanded_candidates) {
            graphDropped.push({
              memory_id: neighborId,
              reason: "graph_expansion_limit",
              stage: "graph"
            });
            continue;
          }

          const neighborMemory = byId.get(neighborId);
          if (!neighborMemory) {
            graphDropped.push({
              memory_id: neighborId,
              reason: "graph_neighbor_missing",
              stage: "graph"
            });
            continue;
          }

          if (!isScopeCompatible(neighborMemory.scope, activeScope)) {
            graphDropped.push({
              memory_id: neighborId,
              reason: "scope_mismatch",
              stage: "graph"
            });
            continue;
          }

          breadthUsed += 1;
          expandedCount += 1;
          seen.add(neighborId);
          queue.push({
            memory_id: neighborId,
            depth: current.depth + 1
          });

          const edgeWeight = this.policy.edge_weight_by_type[edge.edge_type] ?? 0.1;
          const depthMultiplier = Math.pow(this.policy.depth_decay, current.depth);
          const graphBonus = clampScore(seed.score * edgeWeight * depthMultiplier);

          const existing = candidateMap.get(neighborId);
          const details = {
            seed_memory_id: seed.memory_id,
            via_edge_id: edge.id,
            edge_type: edge.edge_type,
            depth: current.depth + 1,
            graph_bonus: graphBonus
          };

          if (existing) {
            candidateMap.set(neighborId, withGraphBonus(existing, graphBonus, details));
            continue;
          }

          const baseCandidate = candidateFromMemory(neighborMemory);
          candidateMap.set(neighborId, {
            ...baseCandidate,
            score: graphBonus,
            score_breakdown: {
              lexical: 0,
              scope: 0,
              confidence: 0,
              recency: 0,
              reuse: 0,
              graph_bonus: graphBonus,
              final: graphBonus
            },
            provenance: {
              retrieval_stage: "graph",
              why_included: ["graph_expansion"],
              graph_path: [details]
            }
          });
        }
      }
    }

    const conflictResolved = applyConflictResolution([...candidateMap.values()], edgeList);

    return {
      candidates: conflictResolved.candidates,
      dropped: [...graphDropped, ...conflictResolved.dropped],
      stats: {
        seed_count: seeds.length,
        expanded_count: expandedCount,
        dropped_count: graphDropped.length + conflictResolved.dropped.length
      }
    };
  }
}
