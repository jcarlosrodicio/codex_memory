# SPEC-003 — Codex Adapter and Hook Contracts

**Status:** Proposed  
**Layer:** Foundation  
**Depends on:** [SPEC-001, SPEC-002]

## Product objective

Define the minimum Codex-specific integration surface needed to connect the memory engine to real sessions without contaminating the reusable core.

## Architectural decision

Codex integration is modeled as an adapter with a stable set of lifecycle hooks:

- `on_session_start`
- `on_before_prompt`
- `on_after_response`
- `on_session_end`

## Public interfaces or types affected

- Hook payload contracts
- Adapter-to-core normalization boundary
- Session control flags exposed to Codex users

## Invariants and exclusions

- Hooks can emit normalized events, request retrieval, and publish audit artifacts.
- Hooks cannot redefine memory semantics owned by the core.
- Hook payloads must preserve enough context to resolve scope and explain decisions.
- Support for non-Codex hosts is out of scope for this spec.

## Data flow

Codex emits lifecycle events. The adapter translates each event into normalized inputs for the core, requests memory retrieval before prompts, and records learning candidates or audit data after responses and session close.

## Fallback behavior

If a specific hook is not available in a target runtime, the adapter must degrade gracefully and document which capabilities become unavailable. Missing optional hooks cannot corrupt stored memory.

## Acceptance criteria

- All four lifecycle hooks are defined with clear responsibilities.
- The hook contracts describe what data crosses into the core and what returns to Codex.
- Session-level controls are documented for disabling injection or learning.

## Risks and open questions

- Final Codex runtime APIs may require small payload adjustments.
- Hook timing can affect how much context is available for learning candidates.
