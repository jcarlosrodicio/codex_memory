# codex-memory spec index

This repository now treats the spec set as the primary product artifact. The goal of the rewritten spec tree is to describe a **public, reusable, local-first memory engine** with a first-party Codex adapter.

## Editorial rules

Every numbered spec must include:

- product objective,
- architectural decision,
- public interfaces or types affected,
- invariants and exclusions,
- data flow,
- fallback behavior for optional capabilities,
- measurable acceptance criteria,
- risks or open questions,
- explicit dependencies.

Template: [`spec-template.md`](./spec-template.md)

## Foundation

- `SPEC-001` [Product Vision and Non-Goals](./spec-001-product-vision-and-non-goals.md)
- `SPEC-002` [Engine Architecture and Package Boundaries](./spec-002-engine-architecture-and-package-boundaries.md)
- `SPEC-003` [Codex Adapter and Hook Contracts](./spec-003-codex-adapter-and-hook-contracts.md)
- `SPEC-004` [Config Schema, Defaults, and Feature Modes](./spec-004-config-schema-defaults-and-feature-modes.md)

## Memory Model

- `SPEC-005` [Canonical Memory Data Model](./spec-005-canonical-memory-data-model.md)
- `SPEC-006` [Memory Store, Indexes, and Schema Versioning](./spec-006-memory-store-indexes-and-schema-versioning.md)
- `SPEC-007` [Secret Redaction and Safe Persistence](./spec-007-secret-redaction-and-safe-persistence.md)
- `SPEC-008` [Memory Scoping and Conflict Rules](./spec-008-memory-scoping-and-conflict-rules.md)
- `SPEC-009` [Repository and Branch Scope Resolution](./spec-009-repository-and-branch-scope-resolution.md)

## Retrieval and Packing

- `SPEC-010` [Lexical Retrieval Engine](./spec-010-lexical-retrieval-engine.md)
- `SPEC-011` [Graph Memory and Expansion Policy](./spec-011-graph-memory-and-expansion-policy.md)
- `SPEC-012` [Semantic Backend Interface](./spec-012-semantic-backend-interface.md)
- `SPEC-013` [Token Budgeting and Context Pack Builder](./spec-013-token-budgeting-and-context-pack-builder.md)

## Codex Session Pipeline

- `SPEC-014` [Capture and Signal Extraction Pipeline](./spec-014-capture-and-signal-extraction-pipeline.md)
- `SPEC-015` [Prompt Injection and Session Controls](./spec-015-prompt-injection-and-session-controls.md)
- `SPEC-016` [Session Consolidation and Learning Promotion](./spec-016-session-consolidation-and-learning-promotion.md)

## Operations and Evaluation

- `SPEC-017` [Explainability, Audit Trail, and Inspection CLI](./spec-017-explainability-audit-trail-and-inspection-cli.md)
- `SPEC-018` [Evaluation and Benchmark Methodology](./spec-018-evaluation-and-benchmark-methodology.md)
- `SPEC-019` [Quality Gates and Release Readiness](./spec-019-quality-gates-and-release-readiness.md)

## Public OSS Docs

- `SPEC-020` [Public Documentation and OSS Positioning](./spec-020-public-documentation-and-oss-positioning.md)

## Sequencing

Implementation sequencing is documented in [`../plans/multiagent-waves.md`](../plans/multiagent-waves.md). Public framing is summarized in [`../spec-roadmap.md`](../spec-roadmap.md).
