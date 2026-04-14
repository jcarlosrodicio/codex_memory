# SPEC-005 — Canonical Memory Data Model

**Status:** Implemented  
**Layer:** Memory Model  
**Depends on:** [SPEC-001, SPEC-002]

## Product objective

Turn “memory” into a concrete, reusable domain model that all later specs can build on without redefining concepts.

## Architectural decision

The engine exposes five canonical memory objects:

- `MemoryEvent`
- `MemoryAtom`
- `MemoryEdge`
- `MemoryCapsule`
- `ContextPack`

## Public interfaces or types affected

- Core object schemas and stable field names
- Memory type taxonomy such as `preference`, `workflow`, `decision`, `constraint`, `bugfix`, `fact`, `artifact`, `open_loop`
- Confidence, timestamps, scope identifiers, provenance, and supersession metadata

## Invariants and exclusions

- `MemoryEvent` is raw and not automatically durable.
- `MemoryAtom` is the smallest durable reusable unit.
- `MemoryCapsule` is compressed and scope-aware.
- `MemoryEdge` is typed and directional.
- `ContextPack` is bounded, explainable, and ephemeral.
- Free-form transcript blobs are not canonical durable memory objects.

## Data flow

Adapter signals become `MemoryEvent` objects. Consolidation logic promotes selected events into `MemoryAtom` and `MemoryCapsule` artifacts. Retrieval resolves atoms and related edges into a ranked candidate set that is then packed into a `ContextPack`.

## Fallback behavior

If a producer cannot supply all optional metadata, the object must still be valid with missing optional fields; however, required identity, scope, and provenance fields cannot be omitted.

## Acceptance criteria

- Each canonical object has a clear purpose and boundary.
- Required versus optional fields are explicit.
- The taxonomy for durable atom types is fixed for v1.
- Later specs reuse these names without inventing parallel models.

## Risks and open questions

- Overloading `MemoryAtom` with too many subtypes could weaken retrieval quality.
- Future adapters may need extra provenance fields, but that should not change the base model.
