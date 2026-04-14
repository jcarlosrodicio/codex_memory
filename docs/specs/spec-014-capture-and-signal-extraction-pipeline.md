# SPEC-014 — Capture and Signal Extraction Pipeline

**Status:** Proposed  
**Layer:** Codex Session Pipeline  
**Depends on:** [SPEC-003, SPEC-005, SPEC-007]

## Product objective

Capture the right signals from Codex sessions so the engine learns from useful interaction patterns instead of persisting raw conversation noise.

## Architectural decision

Capture is split into two stages:

- raw lifecycle event capture,
- bounded signal extraction into candidate memory facts.

## Public interfaces or types affected

- Hook-to-event mapping
- Session buffers for candidate signals
- Candidate signal schema for decisions, preferences, workflows, bugfixes, and open loops

## Invariants and exclusions

- Raw capture does not imply durable storage.
- Extraction rules must produce provenance and confidence metadata.
- Secret screening applies before durable promotion.
- End-to-end summarization of every response is out of scope.

## Data flow

Codex hook payloads become `MemoryEvent` objects. The extraction pipeline tags candidate memory items, stores them in a bounded session buffer, and passes only validated candidates to later consolidation.

## Fallback behavior

If extraction confidence is low, the candidate remains buffered or is dropped; low-confidence capture must not become durable memory by default.

## Acceptance criteria

- The spec defines which hook events can produce candidate memory.
- Candidate signals include type, scope, provenance, and confidence.
- Buffering behavior is explicit and bounded.

## Risks and open questions

- Signal extraction heuristics may require refinement with replay data.
- Some useful memory may only be reliably identified at session end.
