# SPEC-016 — Session Consolidation and Learning Promotion

**Status:** Proposed  
**Layer:** Codex Session Pipeline  
**Depends on:** [SPEC-005, SPEC-006, SPEC-007, SPEC-014]

## Product objective

Convert raw session evidence into durable, compressed, and reusable memory only when the signal is strong enough to justify future prompt budget.

## Architectural decision

Learning promotion happens as a consolidation step, typically at session end, where candidate signals are deduplicated, scored, and promoted into atoms, capsules, and edges.

## Public interfaces or types affected

- Consolidation policy inputs
- Durable promotion rules
- Deduplication and supersession markers
- Session capsule schema

## Invariants and exclusions

- Not every captured signal becomes durable memory.
- Promotion must preserve provenance and confidence.
- Superseded or contradictory memory must be reflected in durable state.
- Continuous background retraining is out of scope.

## Data flow

Candidate signals are read from the session buffer, evaluated against consolidation rules, deduplicated against existing memory, and written as durable atoms, capsules, and edges when eligible.

## Fallback behavior

If promotion cannot safely classify a candidate, the candidate must remain ephemeral or be dropped rather than promoted optimistically.

## Acceptance criteria

- The spec defines how a session produces a capsule plus durable atoms when appropriate.
- Deduplication and supersession rules are explicit.
- Low-confidence signals are not promoted by default.

## Risks and open questions

- Consolidation rules may need repository-specific tuning later.
- Session end may not always be the only useful promotion point, but it is the v1 default.
