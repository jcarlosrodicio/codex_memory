# SPEC-010 — Lexical Retrieval Engine

**Status:** Proposed  
**Layer:** Retrieval and Packing  
**Depends on:** [SPEC-006, SPEC-008, SPEC-009]

## Product objective

Provide a deterministic, inexpensive retrieval path that already delivers meaningful memory recall before graph or semantic expansion are considered.

## Architectural decision

Lexical retrieval is the default ranking stage for atoms and capsules. It ranks by task match plus scope, confidence, recency, and reuse metadata.

## Public interfaces or types affected

- `RetrievalEngine.retrieve(taskContext, budget, scope)`
- Candidate scoring fields
- Query filters by scope, type, tag, and freshness

## Invariants and exclusions

- Lexical retrieval must work with zero optional backends.
- Ranking must remain stable for identical input and index state.
- Scope filters are mandatory, not optional hints.
- LLM re-ranking is out of scope for v1 default retrieval.

## Data flow

Task context is normalized into lexical features. The engine searches indexed atoms and capsules, filters by scope and policy, computes a deterministic score, and returns ranked candidates for downstream graph expansion or pack building.

## Fallback behavior

If secondary indexes are degraded, retrieval may rebuild or scan canonical stores more slowly, but must preserve ranking semantics and scope isolation.

## Acceptance criteria

- The retrieval contract is defined in a host-agnostic way.
- The ranking formula includes lexical match plus non-text signals.
- Candidate filtering by scope and memory type is explicit.
- The spec makes lexical retrieval the default path, not an optional optimization.

## Risks and open questions

- Query normalization may need iteration once replay data exists.
- Lexical retrieval alone may underperform on paraphrased user preferences, motivating the later semantic interface.
