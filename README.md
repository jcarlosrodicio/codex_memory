# codex-memory

`codex-memory` is a local-first memory engine for coding agents, with a first-party adapter for Codex.

It captures useful signals from real Codex sessions, promotes only durable memory, and reinjects small bounded context packs instead of replaying raw transcript history.

## What It Gives You

- local persistence under `~/.codex/plugins/codex-memory/data`
- scoped memory by repo and branch
- bounded prompt injection instead of full transcript replay
- deterministic memory quality filtering
- audit artifacts that explain what was injected, dropped, learned, or skipped
- a local visual dashboard to see whether memory is actually helping

## Quick Start

From the repository root:

```bash
mkdir -p ~/.codex/plugins ~/.agents/plugins
ln -s "$(pwd)" ~/.codex/plugins/codex-memory
```

Create or update `~/.agents/plugins/marketplace.json` so Codex can discover the plugin:

```json
{
  "name": "local-plugins",
  "interface": {
    "displayName": "Local Plugins"
  },
  "plugins": [
    {
      "name": "codex-memory",
      "source": {
        "source": "local",
        "path": "./.codex/plugins/codex-memory"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

Then:

1. Restart Codex.
2. Install `Codex Memory` from `Local Plugins` in the app, or via `/plugins` in Codex CLI.
3. Run the global hook installer from this repo:

```bash
node ./adapters/codex/bin/install-global-hooks.mjs
```

That installer:

- merges `~/.codex/hooks.json` safely
- enables `codex_hooks = true` in `~/.codex/config.toml`
- writes hook commands with an absolute Node path so runtime does not depend on `PATH`

`codex-memory` also treats `hooks_enabled` as enabled by default at runtime.

- default: `hooks_enabled = true`
- optional override: `CODEX_MEMORY_HOOKS_ENABLED=false`

If you turn it off, the plugin stays installed and the hooks still return safely, but runtime behavior is suspended:

- no capture
- no context injection
- no durable learning or consolidation
- `status`, `metrics`, and the dashboard will show hooks as disabled

## Verify The Install

Check the global hook registry and feature flag:

```bash
test -f ~/.codex/hooks.json && echo "hooks config present"
rg -n "codex_hooks\\s*=\\s*true" ~/.codex/config.toml
rg -n "codex-memory-hook\\.mjs" ~/.codex/hooks.json
```

Then use Codex in any repo for a few prompts and inspect the runtime:

```bash
node ./cli/bin/codex-memory-inspect.mjs status --json
node ./cli/bin/codex-memory-inspect.mjs metrics --json
node ./cli/bin/codex-memory-inspect.mjs open-dashboard
```

The default dashboard path is:

- `~/.codex/plugins/codex-memory/data/runtime/dashboard.html`

If you are on a headless surface:

```bash
node ./cli/bin/codex-memory-inspect.mjs dashboard --output /tmp/codex-memory-dashboard.html --json
```

## How It Works

1. Codex hooks capture session events such as `SessionStart`, `UserPromptSubmit`, and `Stop`.
2. The session pipeline normalizes those events and extracts candidate signals.
3. A memory-quality policy rejects generic scaffolding, review chatter, process noise, and other low-value fragments before durable promotion.
4. Durable atoms and session capsules are persisted to the local store.
5. Retrieval builds a bounded `ContextPack` for future prompts in the same scope.
6. Runtime artifacts explain what happened so you can audit the system.

## Dashboard And Metrics

The recommended human-facing surface is the dashboard:

```bash
node ./cli/bin/codex-memory-inspect.mjs dashboard
node ./cli/bin/codex-memory-inspect.mjs open-dashboard
```

The dashboard and `metrics` output answer the questions that matter most:

- whether hooks are enabled at all
- how often memory is injected
- how often prompts still end in `empty_pack`
- how much token savings happen overall
- how much token savings happen only on injected prompts
- which reasons dominate drops and empty packs
- how much candidate memory is being filtered by quality policy
- whether the persisted store still contains noisy durable artifacts
- whether graph edges are still effectively unused

Practical reading:

- high `avg_token_savings_on_injected_prompts` is good
- high `empty_pack_rate` means the system still misses too many useful opportunities
- `scope_mismatch` dominating empty packs usually means memory exists, but in another repo or branch
- `below_lexical_threshold` dominating empty packs usually means memory exists, but relevance is too weak for that prompt
- visible store noise means compaction is probably worth running

More detail lives in [docs/metrics.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/metrics.md).

## Good Memory Policy

`codex-memory` only tries to keep memory that is likely to save tokens or improve future work.

Useful durable memory is usually one of these:

- recurring preferences
- repository workflows or commands worth repeating
- constraints that bound future work
- technical decisions that supersede older behavior
- stable repo/runtime/config facts
- bugfix knowledge worth reusing

The runtime rejects low-value durable noise, including examples like:

- `You are a helpful assistant`
- generic system scaffolding such as “your job is to…”
- title-only payloads such as `{"title":"Revisa SPEC-026 API v1"}`
- reminders like `Revisar SPEC-029 y SPEC-030`
- review chatter such as `No encontré findings nuevos en este fix`
- process notes such as `If not blocked, summarize files edited so far...`
- absolute home-path review fragments and line-specific file commentary with no reusable rule
- subjective conversational residue such as “mi conclusión es…”

This policy is deterministic, zero-deps, and shared by both promotion and store cleanup.

## Store Layout

Default local store path:

- `~/.codex/plugins/codex-memory/data`

Canonical artifacts:

- `events.ndjson`
- `atoms.ndjson`
- `edges.ndjson`
- `capsules.ndjson`
- `index.scope.json`
- `index.type.json`
- `index.confidence.json`
- `index.recency.json`

Runtime artifacts:

- `runtime/status.json`
- `runtime/last-pack.json`
- `runtime/audit.ndjson`
- `runtime/sessions/<session-id>.json`

Override the root with `CODEX_MEMORY_STORE_DIR` if needed.

## Analyze And Clean The Store

Inspection and maintenance commands:

```bash
node ./cli/bin/codex-memory-inspect.mjs status --json
node ./cli/bin/codex-memory-inspect.mjs metrics --json
node ./cli/bin/codex-memory-inspect.mjs inspect-last-pack --json
node ./cli/bin/codex-memory-inspect.mjs analyze-store --json
node ./cli/bin/codex-memory-inspect.mjs compact-store --json
node ./cli/bin/codex-memory-inspect.mjs compact-store --apply --json
```

`analyze-store` is read-only and reports:

- duplicate artifacts
- noisy durable memory
- orphaned edges
- policy reason breakdowns for noisy artifacts

`compact-store` is also safe by default. It only rewrites canonical artifacts when you pass `--apply`.

Use compaction when:

- historical runtime behavior learned obvious noise
- you want cleaner dashboard and metric baselines
- audits or benchmarks are inflated by old low-value artifacts
- you want the persisted store to reflect the current memory policy

## Troubleshooting

If Codex shows:

- `Failed`
- `error: hook exited with code 127`

rerun the installer so the global hook config is regenerated with the current Node path:

```bash
node ./adapters/codex/bin/install-global-hooks.mjs
rg -n "codex-memory-hook\\.mjs" ~/.codex/hooks.json
```

Healthy hook commands should start with an absolute Node path, not bare `node`.

If the plugin installs but no memory appears:

1. confirm `codex_hooks = true` exists in `~/.codex/config.toml`
2. confirm `~/.codex/hooks.json` contains `codex-memory-hook.mjs`
3. confirm you did not disable runtime with `CODEX_MEMORY_HOOKS_ENABLED=false`
4. run a short real Codex session
5. check `~/.codex/plugins/codex-memory/data/runtime/status.json`
6. open the dashboard

## Documentation Map

- [docs/installation.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/installation.md)
- [docs/architecture.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/architecture.md)
- [docs/security-and-privacy.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/security-and-privacy.md)
- [docs/metrics.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/metrics.md)
- [cli/README.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/cli/README.md)
- [docs/spec-roadmap.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/spec-roadmap.md)
