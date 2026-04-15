# SPEC-025 — Runtime Hook Wiring and Local Persistence Activation

**Status:** Implemented
**Layer:** Runtime Activation and Local Persistence
**Depends on:** [SPEC-003, SPEC-006, SPEC-007, SPEC-014, SPEC-015, SPEC-016]

## Product objective

Turn the implemented Codex session pipeline into a real local user-facing feature by wiring the plugin to actual Codex runtime hooks and persisting observable memory artifacts on disk.

## Architectural decision

Runtime activation is treated as a bridge spec between the session pipeline and the later audit/evaluation surfaces. The Codex adapter remains responsible for runtime integration, while the core remains responsible for memory-domain logic and persistence formats. Durable artifacts must be written to a local-first file-based store that follows the canonical store contracts rather than introducing a second runtime-only state model.

## Public interfaces or types affected

- `.codex-plugin/plugin.json` plugin manifest metadata
- `~/.codex/hooks.json` global Codex runtime hook wiring (recommended activation path)
- `adapters/codex/bin/install-global-hooks.mjs` safe global hook installer/merger
- `~/.codex/config.toml` `[features].codex_hooks = true` activation flag set by installer
- Adapter runtime entry scripts or commands used by Codex hooks
- installer-resolved Node executable path used by those commands
- Local persisted artifacts for:
  - events
  - atoms
  - edges
  - capsules
- Minimal local verification surface for confirming that memory was captured and persisted

## Invariants and exclusions

- Runtime activation must not move memory-domain policy from `core` into the adapter.
- Persistence must remain local-first, file-based, and zero-dependency.
- Durable writes must obey `SPEC-006` and `SPEC-007`.
- `disable_learning=true` must prevent durable promotion even when capture still runs.
- `disable_injection=true` must not silently disable unrelated runtime behavior unless another spec explicitly says so.
- Installing the plugin and seeing it in Codex is not sufficient evidence of working memory persistence.
- Full audit CLI, operator dashboards, and rich metrics UX remain out of scope for this spec.

## Data flow

Codex runtime hooks invoke adapter entrypoints during supported host events (`SessionStart`, `UserPromptSubmit`, `Stop`). Global activation via `~/.codex/hooks.json` keeps the plugin active across repositories and is the single recommended path. The repository avoids shipping an active repo-local `.codex/hooks.json` to prevent duplicate execution when global hooks are already enabled. The adapter maps host events into the internal pipeline lifecycle, delegates capture/injection/consolidation into the core, and flushes canonical durable artifacts to the local store.

To avoid real host failures such as `hook exited with code 127`, installer-generated commands must use an explicit Node executable path instead of assuming `node` is available in the runtime `PATH`.

## Fallback behavior

If a hook is unavailable or fails, the runtime must degrade explicitly without corrupting existing persisted artifacts. If durable writes fail, the session must not crash the user workflow; the runtime should emit a warning or minimal audit signal and continue without pretending the write succeeded. If runtime activation is incomplete, documentation must say that the plugin is installable but not yet fully observable in live Codex sessions.

## Acceptance criteria

- The plugin declares and wires the Codex lifecycle hooks required for real session execution.
- A documented, non-destructive global activation path exists so hooks are active outside the `codex-memory` repository.
- Global activation flow sets both hook registry and `codex_hooks` feature flag without requiring manual config edits in the normal case.
- Global activation flow writes hook commands that remain executable even when the host surface does not expose `node` in `PATH`.
- A real Codex session can produce observable local persisted artifacts without test-only scaffolding.
- The persistence path and artifact layout are documented and stable enough for local verification.
- Default local persistence path is stable and independent from workspace cwd (`~/.codex/plugins/codex-memory/data`).
- Durable artifacts written by runtime activation follow canonical store contracts instead of ad hoc formats.
- `disable_learning=true` prevents durable atom/edge/capsule promotion during a real session.
- Secret blocking and redaction still apply before durable writes.
- Failure to wire or write is explicit and non-fatal.
- The repository avoids dual activation layers that would execute the same hook chain twice.
- The repository documents the difference between:
  - plugin installation,
  - runtime activation,
  - and richer audit/metrics surfaces that arrive later.

## Risks and open questions

- Codex runtime hook availability may differ across app and CLI surfaces.
- File write timing and flushing semantics may need careful tuning to avoid partial artifacts.
- Some verification affordances may later migrate into `SPEC-017`, but this spec must still provide a minimal path for manual proof.
