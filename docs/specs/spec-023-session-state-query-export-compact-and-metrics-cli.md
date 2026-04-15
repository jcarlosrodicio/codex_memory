# SPEC-023 — Session State Query, Export, Compact, and Metrics CLI

**Status:** Partially deferred after MVP  
**Layer:** Post-MVP Operator Surface  
**Depends on:** [SPEC-017, SPEC-018]

## Product objective

Extend the operator CLI with richer query, export, compaction, and historical metrics workflows after the MVP is already usable.

## Architectural decision

The operator CLI builds on canonical local state. It does not create a second store or redefine memory semantics.

## Current MVP subset already shipped

A focused maintenance subset ships early because it is needed for a trustworthy public MVP:

- `analyze-store`
- `compact-store`
- explicit `--apply` gate for canonical rewrites
- deterministic deduplication of `events`, `atoms`, `edges`, and `capsules`
- index rebuilds from canonical artifacts
- removal of durable noise that violates the current memory-quality policy

This early subset exists to clean up historical duplicate/noise artifacts that would otherwise distort audits, benchmarks, and first impressions of the product.

## Full post-MVP scope

The broader operator surface still remains post-MVP:

- richer session and memory query commands,
- export commands for sessions and artifacts,
- archival and retention workflows,
- historical metrics views over longer time windows,
- broader forensic/safety audit surfaces.

## Invariants and exclusions

- All workflows build on canonical stores and audits rather than inventing parallel state.
- Export and compaction preserve scope and safety boundaries.
- Historical metrics are an operator feature, not a prerequisite for the default user experience.
- GUI dashboards are out of scope.

## Data flow

The CLI reads sessions, atoms, capsules, edges, and runtime audits; filters or exports them; and may compact canonical artifacts only when the operator explicitly confirms the rewrite path.

## Fallback behavior

If extended operator indexes are absent, the CLI should still query canonical stores with slower but correct behavior.

## Acceptance criteria

- The spec distinguishes the already-shipped cleanup subset from the broader post-MVP operator surface.
- Compaction preserves safety and scope constraints.
- Historical metrics can be derived without altering the runtime retrieval contract.
