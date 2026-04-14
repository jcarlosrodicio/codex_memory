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

## Layer 4: Codex Session Pipeline

- `SPEC-014` Capture and Signal Extraction Pipeline
- `SPEC-015` Prompt Injection and Session Controls
- `SPEC-016` Session Consolidation and Learning Promotion

These specs connect the engine to actual Codex sessions and define how memory moves from raw interaction to reusable durable knowledge.

## Layer 5: Operations and Evaluation

- `SPEC-017` Explainability, Audit Trail, and Inspection CLI
- `SPEC-018` Evaluation and Benchmark Methodology
- `SPEC-019` Quality Gates and Release Readiness

This layer makes the system inspectable, measurable, and safe to ship.

## Layer 6: Public OSS Docs

- `SPEC-020` Public Documentation and OSS Positioning

This final layer ensures the repository explains itself well enough for public use, adoption, and contribution.

## Implementation sequencing

The future implementation should proceed in this order:

1. foundation contracts,
2. memory model,
3. retrieval and budgeting,
4. Codex integration,
5. audit and evaluation,
6. public docs and release polish.

That order preserves architectural clarity and avoids implementing adapter behavior before the memory model is stable.
