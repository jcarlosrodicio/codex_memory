# core

Reusable memory engine package.

This package owns memory-domain behavior and remains host-agnostic.

## Responsibilities

- Canonical memory model and storage contracts
- Retrieval orchestration (`RetrievalEngine`)
- Context composition under budget (`ContextPackBuilder`)
- Optional semantic extension contract (`SemanticBackend`)
- Host-agnostic normalized boundary for adapter events

## Adapter boundary contract

`core` receives normalized lifecycle events via
[`contracts/adapter-core-normalized-events.json`](./contracts/adapter-core-normalized-events.json).

This preserves a strict rule: adapters normalize host payloads first, then cross into core using host-agnostic event fields.

## Canonical memory model contract

`core` publishes the v1 canonical memory object model at
[`contracts/memory-model.canonical.v1.json`](./contracts/memory-model.canonical.v1.json).

This contract defines the five canonical objects (`MemoryEvent`, `MemoryAtom`,
`MemoryEdge`, `MemoryCapsule`, `ContextPack`) including required versus
optional fields and the fixed v1 `MemoryAtom` taxonomy.

## Memory store layout and versioning contract

`core` publishes the v1 local-first store/index/versioning contract at
[`contracts/memory-store-layout.v1.json`](./contracts/memory-store-layout.v1.json).

This contract names canonical persisted artifacts for events, atoms, edges, and
capsules, declares indexes as secondary read accelerators, and makes schema
versioning plus migration hooks explicit.

## Boundary rules

- Do not import or depend on Codex runtime types here.
- Adapter-specific lifecycle logic belongs in `adapters/codex/`.
- CLI command wiring belongs in `cli/`.
