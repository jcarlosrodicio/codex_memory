# SPEC-024 — Memory Safety Audit

**Status:** Proposed  
**Layer:** Post-MVP Operator Surface  
**Depends on:** [SPEC-007, SPEC-017, SPEC-019]

## Product objective

Provide a dedicated audit workflow that checks whether a local `codex-memory` installation is behaving safely and within the intended product boundaries.

## Architectural decision

Safety auditing is treated as a structured operator workflow that validates configuration, scope isolation, persistence hygiene, and runtime defaults.

## Public interfaces or types affected

- Safety audit command outputs
- Audit checks for secrets, contamination, unsafe defaults, and degraded runtime behavior
- Machine-readable audit result format

## Invariants and exclusions

- Safety audit must not expose redacted secret material.
- Audit checks must be deterministic enough for CI or repeated local use.
- This workflow complements, but does not replace, normal runtime explainability.
- Full hosted security scanning is out of scope.

## Data flow

The audit reads config, hook state, persistent stores, and audit artifacts; evaluates predefined safety checks; and emits a local report with findings and severity levels.

## Fallback behavior

If some optional artifacts are missing, the audit should report limited coverage explicitly rather than assuming a clean state.

## Acceptance criteria

- The spec defines checks for secrets, scope contamination, and unsafe runtime defaults.
- Audit output is available for humans and scripts.
- The workflow can be used after MVP without redesigning core memory contracts.

## Risks and open questions

- Safety audits can drift into a generic linter unless tightly focused on memory-specific risk.
