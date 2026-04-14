# Multi-agent implementation waves — codex-memory

Updated: 2026-04-14

## Collision rules

- One branch per agent and per spec.
- One PR per spec unless a wave explicitly groups documentation-only work.
- Do not start a wave until the previous wave's dependencies are merged.
- Every PR must reference the corresponding spec acceptance criteria.

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
- `SPEC-012` Semantic Backend Interface
- `SPEC-013` Token Budgeting and Context Pack Builder

### Wave 6

- `SPEC-014` Capture and Signal Extraction Pipeline
- `SPEC-015` Prompt Injection and Session Controls

### Wave 7

- `SPEC-016` Session Consolidation and Learning Promotion
- `SPEC-017` Explainability, Audit Trail, and Inspection CLI

### Wave 8

- `SPEC-018` Evaluation and Benchmark Methodology
- `SPEC-019` Quality Gates and Release Readiness

### Wave 9

- `SPEC-020` Public Documentation and OSS Positioning

## Suggested ownership split

- Agent A: foundation and config (`SPEC-001` to `SPEC-004`)
- Agent B: core memory model and retrieval (`SPEC-005` to `SPEC-013`)
- Agent C: Codex lifecycle and explainability (`SPEC-014` to `SPEC-017`)
- Agent D: evaluation, quality, and public docs (`SPEC-018` to `SPEC-020`)

## Prompt template

```text
Implement {SPEC-ID} on branch {BRANCH}.
Respect explicit dependencies and do not expand scope beyond the spec.
Deliver code changes, tests, risks, and acceptance-criteria evidence.
```
