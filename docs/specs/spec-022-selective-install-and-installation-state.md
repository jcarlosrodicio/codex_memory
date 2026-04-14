# SPEC-022 — Selective Install and Installation State

**Status:** Proposed  
**Layer:** Post-MVP Operator Surface  
**Depends on:** [SPEC-020]

## Product objective

Allow advanced users to install, upgrade, or omit optional components of `codex-memory` without compromising the simple default path.

## Architectural decision

Installation is modeled as a plan-and-apply workflow with explicit local state describing which components are present and which defaults are active.

## Public interfaces or types affected

- Install plan output
- Install apply workflow
- Local installation state metadata
- Upgrade and uninstall behavior

## Invariants and exclusions

- The default installation path must remain simpler than selective install.
- Selective install cannot weaken the zero-dependency core requirements.
- Optional semantic features must remain additive.
- Remote package distribution logic is out of scope.

## Data flow

The installer computes a local plan from requested capabilities, applies the selected components, records installation state, and exposes enough metadata for upgrades or clean removal.

## Fallback behavior

If selective install metadata is missing or inconsistent, the runtime must fall back to the default supported local install assumptions rather than guessing advanced component state.

## Acceptance criteria

- The spec distinguishes default install from selective install.
- Installation state is queryable and version-aware.
- Optional components can be added later without forcing a reinstall of the default path.

## Risks and open questions

- Selective install can complicate support if the component matrix grows too quickly.
