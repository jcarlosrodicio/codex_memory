# SPEC-006 — Memory Store, Indexes, and Schema Versioning

**Status:** Proposed  
**Layer:** Memory Model  
**Depends on:** [SPEC-004, SPEC-005]

## Product objective

Define how canonical memory objects are persisted, indexed, and evolved over time without locking the project into external infrastructure.

## Architectural decision

The default persistence layer is local-first and append-friendly, with versioned schemas and lightweight indexes that support cheap retrieval and safe migrations.

## Public interfaces or types affected

- Event store format
- Atom store format
- Capsule and edge persistence
- Index metadata for scope, type, confidence, and recency
- Schema version markers and migration hooks

## Invariants and exclusions

- Durable storage must preserve provenance and scope.
- Indexes must accelerate reads without becoming the source of truth.
- Schema versioning must be explicit.
- External databases are optional future extensions, not required in v1.

## Data flow

Validated memory objects are written to durable stores. Secondary indexes are updated in a deterministic way. Readers reconstruct queryable views from the stores and indexes while respecting schema version compatibility.

## Fallback behavior

If an index becomes unavailable or stale, the canonical store remains readable and rebuildable. If a future schema is unknown, the runtime must fail clearly rather than silently misreading data.

## Acceptance criteria

- The spec names the canonical persisted artifacts for events, atoms, edges, and capsules.
- The index strategy supports filters by scope, type, confidence, and time.
- The versioning story covers forward failure and controlled migration.

## Risks and open questions

- Storage layout may need to evolve once real replay datasets exist.
- Index rebuild costs need benchmark coverage in later evaluation specs.
