# SPEC-017 — Explainability, Audit Trail, and Inspection CLI

**Status:** Implemented  
**Layer:** Operations and Evaluation  
**Depends on:** [SPEC-013, SPEC-015, SPEC-016]

## Product objective

Make memory decisions inspectable so users and maintainers can understand what the engine persisted, retrieved, injected, and rejected.

## Architectural decision

Every major runtime decision emits structured audit artifacts, and the CLI exposes human-readable and machine-readable inspection commands over those artifacts.

## Public interfaces or types affected

- Audit record schema
- Pack inclusion and drop reasons
- Inspection CLI commands such as `status`, `inspect-last-pack`, `inspect-session`, and `explain-atom`
- Runtime health and metrics surfaces such as `metrics` or `status --json`

## Invariants and exclusions

- Explainability is part of the product, not debug-only behavior.
- Audit output must not expose blocked secret content.
- CLI commands read the same canonical artifacts as the runtime.
- Any visual dashboard must remain local-first, zero-deps, and built on the same CLI/runtime artifacts instead of a parallel backend.

## Data flow

Retrieval, packing, injection, and consolidation stages emit audit records. The CLI reads those records and presents explanations for memory decisions, effective scope, and current backend mode.

## Fallback behavior

If verbose audit mode is disabled, the system must still emit minimal explainability artifacts needed to diagnose injection and persistence decisions.

## Acceptance criteria

- The audit model records why items entered or left a pack.
- Inspection commands are defined for both humans and scripts.
- Safety filtering applies to audit output.
- At least one inspect surface exposes the latest token, retrieval, and safety metrics needed to diagnose plugin behavior.
- The inspection surface exposes injection rate, empty-pack rate, and savings on injected prompts distinctly from overall averages.
- The inspection surface exposes quality-policy filter reasons and store-noise detection clearly enough to diagnose weak durable memory.
- A local visual dashboard exists for human operators without introducing server infrastructure or non-local telemetry.
- The docs distinguish between quick user-facing metrics in Codex and deeper local audit artifacts for contributors.
- A minimal metric surface is available as soon as `ContextPack` is implemented, even if the full CLI surface lands later.

## Risks and open questions

- Audit verbosity can become too large unless it is carefully scoped.
- Some explanations may need normalized reason codes in addition to free text.
