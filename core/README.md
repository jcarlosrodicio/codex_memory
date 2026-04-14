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

## Secret redaction and safe persistence contract

`core` publishes the v1 redaction/safety gate contract at
[`contracts/secret-redaction-policy.v1.json`](./contracts/secret-redaction-policy.v1.json).

This contract defines mandatory pre-write redaction gates, explicit persistence
outcomes (`allow`, `redact`, `block`), minimum detection coverage classes, and
safe fallback behavior when classification certainty or optional backends fail.

## Memory scoping and conflict rules contract

`core` publishes the v1 scope/conflict policy contract at
[`contracts/memory-scoping-policy.v1.json`](./contracts/memory-scoping-policy.v1.json).

This contract defines scope precedence, contradiction and supersession handling,
cross-repository isolation defaults, and the safe fallback to the narrowest scope
when scope resolution is incomplete.

## Repository and branch scope resolution contract

`core` publishes the v1 repository/branch scope resolution contract at
[`contracts/repository-branch-scope-resolution.v1.json`](./contracts/repository-branch-scope-resolution.v1.json).

This contract defines deterministic local identity derivation from adapter hints,
filesystem context, and local VCS metadata, plus explicit non-Git fallback and
stable scope key formats reused by storage, retrieval, and audit surfaces.

## Retrieval and packing contracts

`core` publishes Layer 3 retrieval and packing contracts at:

- [`contracts/lexical-retrieval-engine.v1.json`](./contracts/lexical-retrieval-engine.v1.json) (`SPEC-010`)
- [`contracts/graph-expansion-policy.v1.json`](./contracts/graph-expansion-policy.v1.json) (`SPEC-011`)
- [`contracts/semantic-backend-interface.v1.json`](./contracts/semantic-backend-interface.v1.json) (`SPEC-012` scaffolding)
- [`contracts/context-pack-builder.v1.json`](./contracts/context-pack-builder.v1.json) (`SPEC-013`)

These contracts preserve a zero-dependency default path: lexical retrieval +
graph expansion + strict-budget context packing, with semantic mode optional and
`off` by default.

## Runtime modules (zero-deps)

`core/src/` now contains the host-agnostic runtime modules for Layer 3:

- `LexicalRetrievalEngine`
- `GraphExpansionPolicy`
- `ContextPackBuilder`
- `RetrievalEngine` orchestration
- optional `SemanticBackend` interface + fallback helpers

## Boundary rules

- Do not import or depend on Codex runtime types here.
- Adapter-specific lifecycle logic belongs in `adapters/codex/`.
- CLI command wiring belongs in `cli/`.
