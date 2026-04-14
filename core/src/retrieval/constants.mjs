export const GRAPH_EDGE_TYPES_V1 = Object.freeze([
  "derived_from",
  "applies_to",
  "related_to",
  "caused_by",
  "contradicts",
  "supersedes"
]);

export const DEFAULT_LEXICAL_WEIGHTS = Object.freeze({
  lexical: 0.55,
  scope: 0.15,
  confidence: 0.1,
  recency: 0.1,
  reuse: 0.1
});

export const DEFAULT_GRAPH_POLICY = Object.freeze({
  seed_limit: 8,
  max_depth: 2,
  max_breadth_per_seed: 3,
  max_expanded_candidates: 24,
  depth_decay: 0.8,
  edge_weight_by_type: {
    derived_from: 0.18,
    applies_to: 0.22,
    related_to: 0.12,
    caused_by: 0.2,
    contradicts: 0.05,
    supersedes: 0.05
  }
});

export const DEFAULT_PACK_POLICY = Object.freeze({
  context_pack_schema_version: "1",
  hard_token_budget: 600,
  section_allocation: {
    rules: 0.35,
    knowledge: 0.35,
    open_loops: 0.2,
    capsules: 0.1
  },
  min_tokens_after_trim: 12
});

export const DEFAULT_SEMANTIC_MODE = "off";

export const SCOPE_LEVELS = Object.freeze([
  "global",
  "repository",
  "branch_or_workspace",
  "session"
]);
