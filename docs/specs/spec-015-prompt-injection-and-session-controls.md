# SPEC-015 — Prompt Injection and Session Controls

**Status:** Proposed  
**Layer:** Codex Session Pipeline  
**Depends on:** [SPEC-003, SPEC-013, SPEC-014]

## Product objective

Inject memory into Codex prompts in a way that is compact, inspectable, and safe to disable when a session does not benefit from memory.

## Architectural decision

Prompt injection consumes a prepared `ContextPack` and is controlled by explicit per-session and per-environment toggles.

## Public interfaces or types affected

- Injection payload shape
- Session flags such as `memory.off`, `learning.off`, and `audit.verbose`
- Adapter response metadata showing whether injection occurred

## Invariants and exclusions

- Injection must be bounded by the pack budget.
- Users must be able to disable injection without disabling the entire adapter.
- The adapter cannot mutate the pack semantics defined by the core.
- Free-form prompt templating for arbitrary hosts is out of scope.

## Data flow

Before a prompt is sent, the adapter requests a `ContextPack`, serializes it into the expected Codex injection block, applies session controls, and records the injection decision in audit outputs.

## Fallback behavior

If pack generation fails or injection is disabled, the adapter must send the prompt without memory and record the reason clearly.

## Acceptance criteria

- The spec defines how and when memory is injected.
- Session controls cover disabling injection and learning independently.
- Failure to inject is observable and non-fatal.

## Risks and open questions

- Prompt formatting may need adaptation once Codex runtime constraints are finalized.
- Some models may react differently to section ordering inside the injected pack.
