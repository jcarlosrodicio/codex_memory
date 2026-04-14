# cli

Operational command package for local inspection and replay flows.

This package is a consumer of persisted artifacts and core interfaces.

## Responsibilities

- Inspection commands for memory and pack decisions
- Replay and maintenance workflows
- Operational entry points for local verification

## Boundary rules

- CLI should reuse persisted artifacts produced by the core/adapter pipeline.
- CLI must not redefine memory semantics owned by `core/`.

