# Spec Roadmap

This roadmap explains how the rewritten spec set is organized and why the sequence matters.

## Layer 1: Foundation

- `SPEC-001` Product Vision and Non-Goals
- `SPEC-002` Engine Architecture and Package Boundaries
- `SPEC-003` Codex Adapter and Hook Contracts
- `SPEC-004` Config Schema, Defaults, and Feature Modes

These specs define what the product is, where the reusable engine stops, where the Codex-specific adapter begins, and how features are configured.

## Layer 2: Memory Model

- `SPEC-005` Canonical Memory Data Model
- `SPEC-006` Memory Store, Indexes, and Schema Versioning
- `SPEC-007` Secret Redaction and Safe Persistence
- `SPEC-008` Memory Scoping and Conflict Rules
- `SPEC-009` Repository and Branch Scope Resolution

These specs turn “memory” into a concrete model with durable objects, storage rules, scope precedence, and safety constraints.

## Layer 3: Retrieval and Packing

- `SPEC-010` Lexical Retrieval Engine
- `SPEC-011` Graph Memory and Expansion Policy
- `SPEC-012` Semantic Backend Interface
- `SPEC-013` Token Budgeting and Context Pack Builder

This layer defines how the engine decides what memory is relevant and how it fits within a strict prompt budget.

Important delivery note:

- `SPEC-010`, `SPEC-011`, and `SPEC-013` define the zero-dependency retrieval MVP.
- `SPEC-012` should be designed now but can be implemented after the first useful zero-dependency release.

## Layer 4: Codex Session Pipeline

- `SPEC-014` Capture and Signal Extraction Pipeline
- `SPEC-015` Prompt Injection and Session Controls
- `SPEC-016` Session Consolidation and Learning Promotion

These specs connect the engine to actual Codex sessions and define how memory moves from raw interaction to reusable durable knowledge.

## Bridge Layer: Runtime Activation and Local Persistence

- `SPEC-025` Runtime Hook Wiring and Local Persistence Activation

This bridge layer turns the implemented session pipeline into an observable runtime feature by wiring real Codex hooks and local persisted artifacts before the richer audit and evaluation surfaces are considered complete.

Important delivery note:

- Installing the plugin and seeing it in Codex is not sufficient proof of working memory.
- Meaningful manual local validation starts only once `SPEC-025` is implemented.

## Layer 5: Operations and Evaluation

- `SPEC-017` Explainability, Audit Trail, and Inspection CLI
- `SPEC-018` Evaluation and Benchmark Methodology
- `SPEC-019` Quality Gates and Release Readiness
- `SPEC-021` Hook Runtime Controls and Safe Degradation

This layer makes the system inspectable, measurable, and safe to ship.

Important delivery note:

- `SPEC-021` is pre-release hardening, not an optional polish task.
- Minimal runtime metrics should appear as soon as `ContextPack` exists, even if `SPEC-017` closes later.
- Golden-path replay fixtures should be introduced before the end of the Codex session pipeline work, not deferred to the very end.

## Layer 6: Public OSS Docs

- `SPEC-020` Public Documentation and OSS Positioning

This final layer ensures the repository explains itself well enough for public use, adoption, and contribution.

## Post-MVP Operator Surface

- `SPEC-022` Selective Install and Installation State
- `SPEC-023` Session State Query, Export, Compact, and Metrics CLI
- `SPEC-024` Memory Safety Audit

These specs extend the operator surface after the zero-dependency MVP is already installable, measurable, and safe.

## Implementation sequencing

The future implementation should proceed in this order:

1. local installable Codex plugin minimum (`SPEC-003`, `SPEC-004`),
2. memory model and scoped persistence (`SPEC-005` to `SPEC-009`),
3. zero-dependency retrieval and budgeting (`SPEC-010`, `SPEC-011`, `SPEC-013`),
4. runtime hardening and safe degradation (`SPEC-021`),
5. Codex session pipeline with early golden-path replay (`SPEC-014` to `SPEC-016`),
6. runtime hook wiring and observable local persistence (`SPEC-025`),
7. explainability, metrics, evaluation, and release readiness (`SPEC-017` to `SPEC-019`),
8. public docs and release polish (`SPEC-020`),
9. optional semantic backend enhancement (`SPEC-012`),
10. post-MVP operator surface (`SPEC-022` to `SPEC-024`).

That order preserves architectural clarity and avoids implementing adapter behavior before the memory model is stable.
