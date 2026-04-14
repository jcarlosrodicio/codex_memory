# SPEC-013 — Token Budgeting and Context Pack Builder

**Status:** Proposed  
**Layer:** Retrieval and Packing  
**Depends on:** [SPEC-010, SPEC-011, SPEC-012]

## Product objective

Transform retrieved memory into a compact prompt payload that saves tokens while preserving the highest-value context for the next Codex turn.

## Architectural decision

The engine builds a versioned `ContextPack` under a hard budget, using layered allocation, priority rules, and explainable trimming.

## Public interfaces or types affected

- `ContextPack`
- budget policy configuration
- candidate inclusion and trimming reasons
- section layout for injected memory

## Invariants and exclusions

- The `ContextPack` must have a hard token ceiling.
- Packing must respect scope and conflict resolution.
- Contradictory candidates cannot be injected without explicit treatment.
- Full transcript excerpts are not a default pack section.

## Data flow

Ranked candidates enter the pack builder with scores, scope, and provenance. The builder allocates budget by section, selects or compresses candidates, drops low-priority items, and emits a versioned `ContextPack` plus audit metadata.

## Fallback behavior

If semantic candidates are absent, the pack builder still produces the same pack schema from lexical and graph candidates only.

## Acceptance criteria

- The spec defines a default hard budget and section allocation strategy.
- Candidate trimming rules are explicit and deterministic.
- Pack output is versioned and auditable.
- The spec ties token savings to actual pack construction, not to vague summarization behavior.

## Risks and open questions

- A single default budget may need tuning by model family later.
- Section-level budgeting may evolve once real replay data exposes weak spots.
