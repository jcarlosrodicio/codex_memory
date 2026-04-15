# Architecture Overview

`codex-memory` is designed as a reusable memory engine with a Codex adapter, not as a one-off plugin. The runtime is local-first, deterministic by default, and structured so that persistence, retrieval, injection, and operational tooling remain inspectable.

## System shape

The architecture is split into three layers:

1. Memory core
   - canonical memory model
   - store layout and schema versioning
   - deterministic retrieval and graph expansion
   - token budgeting and pack building
   - session learning and promotion quality rules

2. Adapter layer
   - Codex lifecycle hooks
   - host-event normalization
   - runtime controls and safe degradation
   - local persistence activation

3. Operational layer
   - inspection and audit commands
   - benchmark and quality-gates tooling
   - store analysis and compaction

## Package boundaries

```text
core/
adapters/codex/
cli/
```

Boundary ownership:

- `core/` owns the memory-domain behavior.
- `adapters/codex/` owns Codex-specific runtime wiring only.
- `cli/` owns operator commands over canonical artifacts.

The CLI consumes the same canonical state as the runtime. It does not redefine memory semantics; it exposes them.

## Canonical memory objects

The engine revolves around five objects:

- `MemoryEvent`: raw session signal
- `MemoryAtom`: smallest durable reusable memory
- `MemoryEdge`: relationship between memory objects
- `MemoryCapsule`: compressed session-level summary
- `ContextPack`: bounded payload injected into the next prompt

These remain the public model across runtime, inspection, and benchmarks.

## Retrieval strategy

The retrieval path is cheap-first and deterministic:

1. filter by scope,
2. rank lexically,
3. expand through graph relations when useful,
4. query the semantic backend only if enabled,
5. assemble a bounded `ContextPack`.

Semantic retrieval is optional. The zero-deps path must stay useful and stable when semantic mode is `off`.

## Learning pipeline

The learning pipeline is intentionally conservative:

1. hook events are normalized into `MemoryEvent`s,
2. candidate signals are extracted from prompt/response excerpts,
3. a memory-quality policy rejects generic scaffolding and trivial fragments,
4. the consolidator promotes only durable candidates above the confidence threshold,
5. the store persists canonical artifacts and rebuilds indexes.

This is the key design change for MVP quality: durable promotion is not “anything extractable.” It is filtered to prefer memory that will plausibly save tokens or improve future work.

## Good memory vs noise

The repo now uses one shared deterministic policy for both promotion and store maintenance.

Good durable memory usually looks like:

- a recurring preference,
- a concrete workflow or command,
- a real constraint,
- a stable decision,
- a repo/runtime/config fact with useful specificity.

Noise includes things like:

- `You are a helpful assistant`
- system scaffolding such as “your job is to…”
- prompt boilerplate for UI title generation
- review/meta artifacts like `::code-comment{...}`
- incomplete bullet/header fragments
- trivial or overly generic snippets with no durable value

Using the same policy in both runtime promotion and `compact-store` keeps the product auditable and consistent.

## Store maintenance architecture

The local store remains file-based and canonical artifacts remain the source of truth. Secondary indexes are rebuildable caches.

Store maintenance now follows this flow:

1. analyze the current store,
2. detect duplicate/equivalent artifacts in `events`, `atoms`, `edges`, and `capsules`,
3. flag low-value durable artifacts via the memory-quality policy,
4. compact only when the operator passes `--apply`,
5. rewrite canonical artifacts,
6. rebuild indexes from canonical state.

This keeps cleanup explicit, deterministic, zero-deps, and safe to re-run.

## Design constraints

- local-first persistence
- no mandatory external services
- deterministic default behavior
- explainable prompt injection
- explicit scope isolation
- safe runtime degradation
- explicit store maintenance for public-release hygiene

## Documentation map

- [docs/installation.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/installation.md)
- [docs/security-and-privacy.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/security-and-privacy.md)
- [docs/spec-roadmap.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/spec-roadmap.md)
- [docs/specs/README.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/specs/README.md)
