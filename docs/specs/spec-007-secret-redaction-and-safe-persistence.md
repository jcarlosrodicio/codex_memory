# SPEC-007 — Secret Redaction and Safe Persistence

**Status:** Proposed  
**Layer:** Memory Model  
**Depends on:** [SPEC-005, SPEC-006]

## Product objective

Ensure the engine does not turn agent transcripts into a secret archive while still keeping enough context to learn durable behavior.

## Architectural decision

Secret detection and persistence safety are mandatory gates in the path from raw event to durable memory.

## Public interfaces or types affected

- Redaction policy configuration
- Persistence outcome states: `allow`, `redact`, `block`
- Audit metadata for dropped or transformed content

## Invariants and exclusions

- No durable memory object bypasses redaction checks.
- Blocked content must not be silently persisted in raw form.
- Safety behavior must be visible in audit artifacts.
- Retroactive secret cleanup of already-shipped user data is out of scope for this spec.

## Data flow

Candidate durable content is scanned for secret patterns and sensitive payload traits. The engine either redacts safe portions, blocks persistence, or allows storage with clean provenance and safety metadata.

## Fallback behavior

If secret classification is uncertain, the safe default is stricter persistence behavior. Optional backend failures must not disable redaction.

## Acceptance criteria

- The redaction pipeline applies before durable writes.
- Persistence outcomes are explicit and explainable.
- The spec covers both structured secrets and common free-text leaks.

## Risks and open questions

- Regex-only detection may have false positives and false negatives.
- Future adapter payloads may surface new secret-bearing fields that need classification.
