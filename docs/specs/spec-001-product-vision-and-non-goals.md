# SPEC-001 — Product Vision and Non-Goals

**Status:** Proposed  
**Layer:** Foundation  
**Depends on:** []

## Product objective

Define what `codex-memory` is actually building: a reusable, local-first memory engine for coding agents with a first-party Codex adapter, optimized to save tokens **without degrading task effectiveness**.

## Architectural decision

The repository is productized around a reusable engine and explicit adapters. It is not framed as a Codex-only plugin, and it is not framed as a generic document search tool.

## Public interfaces or types affected

- Product boundary between `core`, `adapters/codex`, and `cli`
- Definition of supported operating modes: `zero-deps core`, `semantic optional`
- Product-level success metrics for token savings and retrieval quality

## Invariants and exclusions

- The default experience must remain useful with no external services.
- Token savings must come from memory selection and compression, not from silently dropping important context.
- Graph memory is a core concept.
- Semantic retrieval is optional.
- Full transcript replay is explicitly out of scope as the primary memory mechanism.
- “Universal agent memory for every host” is out of scope for v1; Codex is the only required adapter.

## Data flow

User interaction produces session signals. Those signals are normalized into memory objects, stored under explicit scopes, retrieved through cheap-first ranking, compressed into a `ContextPack`, and optionally injected back into Codex prompts.

## Fallback behavior

If optional semantic retrieval is disabled, the product must still support durable memory capture, graph-aware retrieval, and token-bounded prompt injection.

## Acceptance criteria

- Public docs consistently describe the product as `memory engine + Codex adapter`.
- The spec tree defines how token savings will be measured.
- The repository contains an explicit statement of non-goals for v1.
- No core spec assumes mandatory external vector infrastructure.

## Risks and open questions

- “Saving tokens” can be interpreted too narrowly unless paired with quality metrics.
- A future adapter ecosystem could pressure the engine into overly abstract interfaces too early.
