# adapters/codex

First-party Codex adapter package.

This package translates Codex session lifecycle events into normalized inputs for the engine in `core/`.

## Responsibilities

- Hook and lifecycle integration with Codex surfaces
- Host/runtime signal normalization
- Injection and control wiring that consumes core outputs
- Session-level controls (`disable_injection`, `disable_learning`)
- Local-first installation contract for Codex app and Codex CLI compatibility

## SPEC-003 hook contracts

Defined in [`contracts/codex-hook-contracts.json`](./contracts/codex-hook-contracts.json):

- `on_session_start`: initialize session state and emit normalized session context.
- `on_before_prompt`: request retrieval and return optional bounded context injection.
- `on_after_response`: emit learning candidates and audit metadata.
- `on_session_end`: finalize lifecycle and flush audit artifacts.

Session controls are defined in [`contracts/session-controls.json`](./contracts/session-controls.json).

### Fallback behavior

- Missing hook capabilities degrade to explicit warnings and reduced features.
- Fallback paths never write malformed memory artifacts.
- Hook availability differences across Codex runtimes cannot corrupt stored memory.

## Boundary rules

- Do not define canonical memory model types in this package.
- Do not implement storage policy in this package.
- Do not implement retrieval ranking policy in this package.
