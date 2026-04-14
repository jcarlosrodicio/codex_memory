# SPEC-003 — Codex Adapter and Hook Contracts

**Status:** Implemented  
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
- Installation-facing adapter contract for Codex app and Codex CLI compatibility
- Local plugin installation contract, with future compatibility for marketplace publication
- Plugin packaging expectations that allow local marketplace discovery

## Invariants and exclusions

- Hooks can emit normalized events, request retrieval, and publish audit artifacts.
- Hooks cannot redefine memory semantics owned by the core.
- Hook payloads must preserve enough context to resolve scope and explain decisions.
- The adapter install path must prefer one shared configuration model across Codex surfaces where possible.
- Local installation must be a first-class supported path, not a temporary afterthought.
- Support for non-Codex hosts is out of scope for this spec.

## Data flow

Codex emits lifecycle events. The adapter translates each event into normalized inputs for the core, requests memory retrieval before prompts, and records learning candidates or audit data after responses and session close.

## Fallback behavior

If a specific hook is not available in a target runtime, the adapter must degrade gracefully and document which capabilities become unavailable. Missing optional hooks cannot corrupt stored memory.

## Acceptance criteria

- All four lifecycle hooks are defined with clear responsibilities.
- The hook contracts describe what data crosses into the core and what returns to Codex.
- Session-level controls are documented for disabling injection or learning.
- The spec defines a “simple install” target for Codex app users that does not require advanced optional backends.
- The spec defines local installation as the default initial distribution path and leaves packaging room for future marketplace publication.
- The installation story is aligned with Codex's documented plugin and marketplace flows rather than undocumented direct Git URL installation.

## Risks and open questions

- Final Codex runtime APIs may require small payload adjustments.
- Hook timing can affect how much context is available for learning candidates.
- The exact plugin packaging surface for Codex app may evolve, so installation requirements should be phrased in capability terms, not brittle UI details.

## Implementation notes

- Hook contracts: `adapters/codex/contracts/codex-hook-contracts.json`
- Session controls: `adapters/codex/contracts/session-controls.json`
- Adapter-to-core normalized boundary: `core/contracts/adapter-core-normalized-events.json`
- Local-first plugin packaging contract: `.codex-plugin/plugin.json`
- Acceptance verification tests: `adapters/codex/tests/spec-003-contracts.test.mjs`
