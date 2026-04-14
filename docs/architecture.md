# Architecture Overview

`codex-memory` is designed as a **memory engine** with a **Codex adapter**, not as a one-off plugin.

## System shape

The architecture is intentionally split into three layers:

1. **Memory core**
   - canonical data model
   - storage and schema versioning
   - retrieval and ranking
   - token budgeting and pack building

2. **Adapter layer**
   - agent-specific hooks
   - session lifecycle integration
   - input/output transformations for the host runtime

3. **Operational layer**
   - audit and inspection commands
   - replay and benchmark tooling
   - quality gates and release checks

## Package boundaries

Target package layout:

```text
core/
adapters/codex/
cli/
```

Boundary ownership:

- `core/` owns memory-domain logic, storage contracts, retrieval orchestration, and pack building.
- `adapters/codex/` owns Codex lifecycle integration and host normalization only.
- `cli/` owns inspection/replay operational surfaces that consume persisted artifacts.

Adapter layer exclusion:

- Storage policy and retrieval policy stay in `core/`, not in `adapters/codex/`.

## Core memory objects

The engine revolves around five canonical objects:

- `MemoryEvent` — raw signal captured from a session
- `MemoryAtom` — smallest durable reusable fact, rule, or preference
- `MemoryEdge` — typed relationship between memory objects
- `MemoryCapsule` — compressed summary for a session or scope
- `ContextPack` — bounded payload injected into the next prompt

These objects are defined in the specs as the public model the whole project must preserve.

## Retrieval strategy

The repository adopts a **cheap-first** retrieval model:

1. filter by scope,
2. rank with lexical retrieval,
3. expand through graph relations when useful,
4. query the semantic backend only if enabled,
5. assemble a bounded `ContextPack`.

This keeps the default path predictable, fast, and dependency-light while still leaving room for more capable semantic retrieval.

Implementation priority matters:

- lexical retrieval and graph expansion are part of the zero-dependency core,
- semantic retrieval is intentionally deferred until after the base product is working, measurable, and easy to install.

## Why graph is core

A memory engine is not only a search index. It must understand relationships such as:

- this rule applies to this repository,
- this decision supersedes an older one,
- this workaround caused this bugfix,
- this preference comes from repeated user behavior.

Those relationships are first-class, which is why graph memory belongs in the core model rather than as an optional add-on.

## Why semantic search is optional

Semantic retrieval can improve recall, but it is not required to deliver value in this product:

- it can add operational complexity,
- it may require local models or bundled runtimes,
- it should not block basic functionality in a public reusable repository.

For that reason, semantic search is modeled as a backend contract with an `off` mode that remains fully supported.

The design includes the semantic interface now so later work has a clean extension point, but the first public implementation should prove the value of the zero-dependency path before adding this optional layer.

## Design constraints

- Local-first persistence
- No mandatory external services
- Scope isolation between global, repo, and session memory
- Explainable prompt injection
- Measurable token budgeting
- Reusable engine interfaces across adapters

## Documentation map

- Spec index: [`docs/specs/README.md`](./specs/README.md)
- Public roadmap: [`docs/spec-roadmap.md`](./spec-roadmap.md)
- Security and privacy: [`docs/security-and-privacy.md`](./security-and-privacy.md)
