# SPEC-023 — Session State Query, Export, Compact, and Metrics CLI

**Status:** Proposed  
**Layer:** Post-MVP Operator Surface  
**Depends on:** [SPEC-017, SPEC-018]

## Product objective

Give maintainers and advanced users better operational visibility over stored session and memory state after the MVP is already usable.

## Architectural decision

The operator CLI extends the basic inspection surface with query, export, compaction, and historical metrics workflows over canonical local state.

## Public interfaces or types affected

- Session and memory query commands
- Export commands for sessions and memory artifacts
- Compact or archive workflows
- Historical metrics views

## Invariants and exclusions

- These workflows build on canonical stores and audits rather than inventing parallel state.
- Export and compaction must preserve safety and scope boundaries.
- Historical metrics are an operator feature, not a prerequisite for the default user experience.
- GUI dashboards are out of scope.

## Data flow

The CLI reads sessions, atoms, capsules, edges, and audit artifacts; filters or exports them; and optionally compacts old data according to explicit retention rules.

## Fallback behavior

If extended operator indexes are absent, the CLI should still be able to query canonical stores with slower but correct behavior.

## Acceptance criteria

- The spec defines query, export, compact, and metrics capabilities separately.
- Historical metrics can be derived without altering the runtime retrieval contract.
- Operator workflows preserve scope and safety constraints.

## Risks and open questions

- Compaction policy may require extra care to avoid destroying useful replay evidence.
