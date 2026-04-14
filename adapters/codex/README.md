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
Layer 4 injection behavior and controls are defined in
[`contracts/prompt-injection-session-controls.v1.json`](./contracts/prompt-injection-session-controls.v1.json).

## Runtime module

`adapters/codex/src/codex-memory-adapter.mjs` exposes `CodexMemoryAdapter`, which
implements the four lifecycle hooks and delegates memory-domain rules to `core`.

Runtime hook entrypoint:

- `adapters/codex/bin/codex-memory-hook.mjs`
- repo runtime hook config: `.codex/hooks.json`

Codex runtime discovery uses `~/.codex/hooks.json` (global) and `<repo>/.codex/hooks.json` (repo-local).

Recommended activation for production usage across repositories is global hooks installation:

- `node ./adapters/codex/bin/install-global-hooks.mjs`

This performs a safe merge into `~/.codex/hooks.json` and preserves non-Codex Memory hooks.
It also enables `codex_hooks = true` under `[features]` in `~/.codex/config.toml`.

Event mapping used for real runtime:

- `SessionStart` -> `onSessionStart`
- `UserPromptSubmit` -> `onBeforePrompt`
- `Stop` -> `onStop` (captures response and performs bounded consolidation)

The runtime entrypoint still supports legacy method names for local test/backward compatibility:

- `on_session_start` / `onSessionStart`
- `on_before_prompt` / `onBeforePrompt`
- `on_after_response` / `onAfterResponse`
- `on_session_end` / `onSessionEnd`

Durable artifacts are persisted through `core`'s local-first store implementation
(`LocalMemoryStore`) and written as canonical NDJSON files (`events`, `atoms`,
`edges`, `capsules`) with secondary indexes in `~/.codex/plugins/codex-memory/data`
by default.

### Fallback behavior

- Missing hook capabilities degrade to explicit warnings and reduced features.
- Fallback paths never write malformed memory artifacts.
- Hook availability differences across Codex runtimes cannot corrupt stored memory.

## Boundary rules

- Do not define canonical memory model types in this package.
- Do not implement storage policy in this package.
- Do not implement retrieval ranking policy in this package.
