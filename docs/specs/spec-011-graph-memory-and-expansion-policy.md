# SPEC-011 — Graph Memory and Expansion Policy

**Status:** Proposed  
**Layer:** Retrieval and Packing  
**Depends on:** [SPEC-005, SPEC-008, SPEC-010]

## Product objective

Use relationships between memory objects to recover useful context that plain lexical ranking would miss, while avoiding uncontrolled context expansion.

## Architectural decision

Graph relations are first-class and typed. Retrieval can expand from a strong lexical hit into nearby related atoms, but only under explicit limits and relevance rules.

## Public interfaces or types affected

- `MemoryEdge` taxonomy such as `derived_from`, `applies_to`, `related_to`, `caused_by`, `contradicts`, `supersedes`
- Expansion policy inputs and outputs
- Candidate provenance that records graph-based inclusion

## Invariants and exclusions

- Graph expansion starts from already-ranked seeds.
- Expansion cannot bypass scope rules.
- Contradictory or superseded edges must affect selection decisions.
- Graph support is part of the zero-dependency MVP, not a later optional add-on.
- General-purpose graph analytics are out of scope.

## Data flow

The engine starts from lexical candidates, loads relevant neighboring edges and nodes, applies expansion limits, recomputes candidate relevance, and returns enriched candidates to the pack builder.

## Fallback behavior

If graph indexes are absent or disabled, retrieval falls back to lexical-only behavior without changing the external retrieval contract.

## Acceptance criteria

- The edge taxonomy is explicit and small enough for v1.
- Expansion depth and breadth limits are defined.
- The spec explains how graph candidates are marked and scored.
- Graph expansion never broadens scope beyond the active memory rules.
- The graph path is implementable without introducing mandatory external infrastructure.

## Risks and open questions

- Too many edge types can make graph retrieval noisy.
- Some relationships may be better derived during consolidation than at query time.
