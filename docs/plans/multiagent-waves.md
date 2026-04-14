# Multi-agent implementation waves — codex-memory

Updated: 2026-04-14

## Collision rules

- One branch per agent and per spec.
- One PR per spec unless a wave explicitly groups documentation-only work.
- Do not start a wave until the previous wave's dependencies are merged.
- Every PR must reference the corresponding spec acceptance criteria.
- Every milestone must end with a local demo proof, not only tests.

## Milestones

### Milestone A: Minimal Installable Plugin

- `SPEC-003` Codex Adapter and Hook Contracts
- `SPEC-004` Config Schema, Defaults, and Feature Modes

Required proof:

- installability proof
- plugin enablement proof in the local Codex flow

### Milestone B: Minimal End-to-End Memory

- `SPEC-005` Canonical Memory Data Model
- `SPEC-006` Memory Store, Indexes, and Schema Versioning
- `SPEC-007` Secret Redaction and Safe Persistence
- `SPEC-008` Memory Scoping and Conflict Rules
- `SPEC-009` Repository and Branch Scope Resolution

Required proof:

- end-to-end proof for capture and persistence
- scope isolation proof across at least two repos

### Milestone C: Useful Zero-Dependency Retrieval

- `SPEC-010` Lexical Retrieval Engine
- `SPEC-011` Graph Memory and Expansion Policy
- `SPEC-013` Token Budgeting and Context Pack Builder

Required proof:

- retrieval proof
- pack budget proof
- minimal metrics proof

### Milestone D: Runtime Hardening and Operational Control

- `SPEC-021` Hook Runtime Controls and Safe Degradation

Required proof:

- kill switch proof
- throttling or loop-guard proof
- degraded `session_end` proof

### Milestone E: Explainability, Metrics, and Release Proof

- `SPEC-014` Capture and Signal Extraction Pipeline
- `SPEC-015` Prompt Injection and Session Controls
- `SPEC-016` Session Consolidation and Learning Promotion
- `SPEC-017` Explainability, Audit Trail, and Inspection CLI
- `SPEC-018` Evaluation and Benchmark Methodology
- `SPEC-019` Quality Gates and Release Readiness

Required proof:

- golden-path replay proof
- metrics proof
- safety proof
- release proof

### Milestone F: Public Surface

- `SPEC-020` Public Documentation and OSS Positioning

Required proof:

- docs-to-behavior alignment proof

## Waves

### Wave 1

- `SPEC-001` Product Vision and Non-Goals
- `SPEC-002` Engine Architecture and Package Boundaries

### Wave 2

- `SPEC-003` Codex Adapter and Hook Contracts
- `SPEC-004` Config Schema, Defaults, and Feature Modes
- `SPEC-005` Canonical Memory Data Model

### Wave 3

- `SPEC-006` Memory Store, Indexes, and Schema Versioning
- `SPEC-007` Secret Redaction and Safe Persistence
- `SPEC-008` Memory Scoping and Conflict Rules

### Wave 4

- `SPEC-009` Repository and Branch Scope Resolution
- `SPEC-010` Lexical Retrieval Engine

### Wave 5

- `SPEC-011` Graph Memory and Expansion Policy
- `SPEC-013` Token Budgeting and Context Pack Builder

### Wave 6

- `SPEC-021` Hook Runtime Controls and Safe Degradation

### Wave 7

- `SPEC-014` Capture and Signal Extraction Pipeline
- `SPEC-015` Prompt Injection and Session Controls
- `SPEC-016` Session Consolidation and Learning Promotion

### Wave 8

- `SPEC-017` Explainability, Audit Trail, and Inspection CLI
- `SPEC-018` Evaluation and Benchmark Methodology
- `SPEC-019` Quality Gates and Release Readiness

### Wave 9

- `SPEC-020` Public Documentation and OSS Positioning

### Post-MVP Enhancements

- `SPEC-012` Semantic Backend Interface
- `SPEC-022` Selective Install and Installation State
- `SPEC-023` Session State Query, Export, Compact, and Metrics CLI
- `SPEC-024` Memory Safety Audit

## Suggested ownership split

- Agent A: frozen foundation and install path stewardship (`SPEC-001` to `SPEC-004`)
- Agent B: memory model and zero-dependency retrieval (`SPEC-005` to `SPEC-013`, excluding post-MVP `SPEC-012`)
- Agent C: runtime hardening and Codex lifecycle (`SPEC-014` to `SPEC-017`, plus `SPEC-021`)
- Agent D: evaluation, quality, public docs, and post-MVP operator surface (`SPEC-018` to `SPEC-020`, plus `SPEC-022` to `SPEC-024` and later `SPEC-012`)

## Demo gates

- **Done for spec**: the spec's acceptance criteria are satisfied.
- **Done for milestone**: the local milestone demo proof is attached and reproducible.
- **Done for release**: release evidence required by `SPEC-019` is complete.

## Prompt template

```text
Implement {SPEC-ID} on branch {BRANCH}.
Respect explicit dependencies and do not expand scope beyond the spec.
Deliver code changes, tests, risks, acceptance-criteria evidence, and the milestone proof required by the current implementation stage.
```
