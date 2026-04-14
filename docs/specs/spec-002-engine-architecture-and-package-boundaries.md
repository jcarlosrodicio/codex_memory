# SPEC-002 — Engine Architecture and Package Boundaries

**Status:** Implemented  
**Layer:** Foundation  
**Depends on:** [SPEC-001]

## Product objective

Lock the high-level architecture so future implementation work stays reusable, testable, and readable in a public repository.

## Architectural decision

Split the system into three packages:

- `core/` for memory domain logic and storage contracts,
- `adapters/codex/` for Codex session lifecycle integration,
- `cli/` for inspection, replay, and operational commands.

## Public interfaces or types affected

- `RetrievalEngine`
- `ContextPackBuilder`
- `SemanticBackend`
- adapter hook contracts consumed by Codex
- inspection and replay CLI surfaces

## Invariants and exclusions

- Adapter code cannot own the canonical memory model.
- Core retrieval logic cannot depend directly on Codex runtime types.
- Public docs must explain package boundaries before implementation starts.
- Spec authoring tools or repo-specific automation are not part of the runtime architecture.

## Data flow

The adapter captures runtime signals and passes normalized inputs into the core. The core persists, retrieves, ranks, and compresses memory. The CLI reads the same persisted artifacts without needing live adapter context.

## Fallback behavior

If the adapter is disabled, the engine should still be describable and testable through CLI and replay tooling. If the CLI is absent, runtime behavior must still remain explainable through audit artifacts.

## Acceptance criteria

- The repository docs show a clear target layout for `core`, `adapters/codex`, and `cli`.
- At least one foundation spec references each boundary consistently.
- No later spec places storage or retrieval policy inside the adapter layer.

## Risks and open questions

- Over-abstracting the adapter boundary too early could slow down implementation.
- A future language/runtime decision may influence package naming, but not the boundary model.
