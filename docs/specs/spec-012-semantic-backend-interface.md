# SPEC-012 — Semantic Backend Interface

**Status:** Proposed  
**Layer:** Retrieval and Packing  
**Depends on:** [SPEC-002, SPEC-005, SPEC-010]

## Product objective

Define an optional semantic retrieval contract that can improve recall without making the project depend on external databases or mandatory local model setup.

## Architectural decision

Semantic retrieval is modeled as a pluggable backend interface with explicit modes:

- `off`
- `light`
- `custom`

This interface is defined early for architectural clarity, but its implementation is intentionally deferred until after the zero-dependency MVP is complete.

## Public interfaces or types affected

- `SemanticBackend`
- vector indexing and lookup contract
- backend health and capability reporting
- semantic candidate merge inputs for the retrieval pipeline

## Invariants and exclusions

- The core product must remain functional in `off` mode.
- The first public MVP must be shippable without implementing this spec.
- Semantic backend results must still obey scope and safety rules.
- The interface cannot assume a specific vector database implementation.
- Bundled model procurement and installation UX are out of scope for this spec.

## Data flow

When enabled, the retrieval pipeline sends normalized memory objects and query payloads into the semantic backend, receives scored candidates, and merges them with lexical and graph candidates before pack building.

## Fallback behavior

If the backend is disabled, missing, unhealthy, or unsupported on the current machine, the engine must continue with lexical and graph retrieval only.

## Acceptance criteria

- The semantic contract defines indexing, search, and health semantics.
- The spec names the supported feature modes and what they mean.
- A missing backend does not change the core retrieval API.
- The spec is written so it can be implemented after the zero-dependency release without redesigning core retrieval contracts.

## Risks and open questions

- “Light” mode will need a future concrete implementation choice.
- Candidate score normalization may require replay data before it can be finalized.
- Implementing semantic retrieval too early could delay validation of the simpler product that most users will install first.
