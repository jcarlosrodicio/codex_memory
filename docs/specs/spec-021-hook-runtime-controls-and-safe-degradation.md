# SPEC-021 — Hook Runtime Controls and Safe Degradation

**Status:** Implemented  
**Layer:** Operations and Evaluation  
**Depends on:** [SPEC-003, SPEC-015, SPEC-016, SPEC-017]

## Product objective

Ensure the Codex adapter can be operated safely in real projects by providing runtime controls, bounded behavior, and graceful degradation when hooks fail or produce too much load.

## Architectural decision

Hook execution is controlled through explicit runtime profiles, kill switches, and bounded capture limits. The system must prefer a safe reduced mode over brittle failure or runaway behavior.

## Public interfaces or types affected

- Hook runtime profile controls such as `minimal`, `standard`, and `strict`
- Runtime hook enablement flag (`hooks_enabled`, default true)
- Global and per-phase disable flags
- Capture and promotion limits per session
- Safe-degradation status and reason codes
- Versioned script entrypoints for hook execution

## Invariants and exclusions

- Hooks must be disableable without editing source files.
- Runtime hook execution defaults to enabled and must degrade safely when explicitly disabled.
- The system must provide a global kill switch for memory or learning behavior.
- Hook failure cannot corrupt durable memory stores.
- Session-end fallback must still produce the minimum safe summary or status artifact when intermediate phases fail.
- Inline one-liner hooks as the primary runtime contract are out of scope.

## Data flow

Runtime settings select a hook profile, apply phase-level gates, and enforce bounded capture behavior. If a hook fails or thresholds are exceeded, the adapter records the failure, downgrades to a safer mode, and preserves the minimum artifacts needed for diagnosis.

## Fallback behavior

If any hook phase is unavailable, disabled, or failing, the adapter must continue in the narrowest safe mode, preserving installability and core user control rather than attempting partial unsafe recovery.

## Acceptance criteria

- Runtime profiles and kill switches are explicitly defined.
- The spec defines throttling or loop-prevention guards for capture and promotion.
- Session-end fallback behavior is documented and testable.
- Hook execution is described in terms of stable script entrypoints rather than fragile inline commands.
- Global hook commands must not rely on bare `node` being present in host `PATH`; installer-generated commands should use a resolved executable path, preferring a stable alias when available.
- The spec can be implemented without modifying `SPEC-001` to `SPEC-004`.

## Risks and open questions

- Runtime controls can become too complex if exposed as too many separate toggles.
- Some hook failure modes may only appear under long-running real-world sessions and need replay coverage.
