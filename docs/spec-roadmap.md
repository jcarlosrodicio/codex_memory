# Spec Roadmap

This roadmap explains how the spec set is organized, what is already implemented in the MVP, and what remains intentionally post-MVP.

## Layer 1: Foundation

- `SPEC-001` Product Vision and Non-Goals
- `SPEC-002` Engine Architecture and Package Boundaries
- `SPEC-003` Codex Adapter and Hook Contracts
- `SPEC-004` Config Schema, Defaults, and Feature Modes

Status: implemented enough for the current MVP runtime.

## Layer 2: Memory Model

- `SPEC-005` Canonical Memory Data Model
- `SPEC-006` Memory Store, Indexes, and Schema Versioning
- `SPEC-007` Secret Redaction and Safe Persistence
- `SPEC-008` Memory Scoping and Conflict Rules
- `SPEC-009` Repository and Branch Scope Resolution

Status: implemented. Canonical artifacts, indexes, scope rules, and redaction-backed persistence are live.

## Layer 3: Retrieval and Packing

- `SPEC-010` Lexical Retrieval Engine
- `SPEC-011` Graph Memory and Expansion Policy
- `SPEC-012` Semantic Backend Interface
- `SPEC-013` Token Budgeting and Context Pack Builder

Status:

- `SPEC-010`, `SPEC-011`, and `SPEC-013` are part of the current zero-deps MVP.
- `SPEC-012` remains optional and is not required for first public use.

## Layer 4: Codex Session Pipeline

- `SPEC-014` Capture and Signal Extraction Pipeline
- `SPEC-015` Prompt Injection and Session Controls
- `SPEC-016` Session Consolidation and Learning Promotion

Status: implemented with a stricter memory-quality policy so durable promotion rejects generic scaffolding and low-value fragments.

## Bridge Layer: Runtime Activation and Local Persistence

- `SPEC-025` Runtime Hook Wiring and Local Persistence Activation

Status: implemented.

This bridge layer makes the product observable in real Codex sessions:

- hooks are wired globally,
- `codex_hooks = true` is enabled safely,
- local persisted artifacts are visible under `~/.codex/plugins/codex-memory/data`.

## Layer 5: Operations and Evaluation

- `SPEC-017` Explainability, Audit Trail, and Inspection CLI
- `SPEC-018` Evaluation and Benchmark Methodology
- `SPEC-019` Quality Gates and Release Readiness
- `SPEC-021` Hook Runtime Controls and Safe Degradation

Status: implemented for the MVP operator loop.

The current CLI covers:

- status and metrics,
- session and atom inspection,
- last-pack explainability,
- benchmark reports,
- quality gates,
- store maintenance with `analyze-store` and `compact-store`.

## Layer 6: Public OSS Docs

- `SPEC-020` Public Documentation and OSS Positioning

Status: implemented in the public docs surface.

The repository now explains:

- what the product does,
- how to install and activate it,
- where data persists,
- what counts as good durable memory,
- how to analyze and compact the store,
- what is MVP vs future work.

## Post-MVP Operator Surface

- `SPEC-022` Selective Install and Installation State
- `SPEC-023` Session State Query, Export, Compact, and Metrics CLI
- `SPEC-024` Memory Safety Audit

Status: partially deferred.

Important nuance:

- the MVP now ships a practical subset of store maintenance early because historical duplicate/noise cleanup is necessary for public usability,
- richer query/export/history workflows still belong to post-MVP operator expansion,
- deeper safety audit tooling beyond the current runtime + cleanup surfaces remains future work.

## Implementation sequencing

The repo has effectively reached this order:

1. installable Codex plugin minimum,
2. memory model and scoped persistence,
3. zero-deps retrieval and budgeting,
4. Codex session pipeline,
5. runtime activation and observable local persistence,
6. explainability, metrics, evaluation, and release readiness,
7. public docs and release polish,
8. optional semantic enhancement,
9. post-MVP operator expansion.

This keeps the product understandable and usable before advanced operator features grow broader.
