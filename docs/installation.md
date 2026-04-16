# Installation

This guide is the supported setup path for a user starting from zero.

It covers:

- plugin discovery in Codex
- runtime activation through global hooks
- persistence verification
- dashboard usage
- store cleanup when needed

## Before You Start

You need:

- Codex app or Codex CLI installed
- this repository cloned locally
- a working Node installation on your machine

The runtime installer writes the absolute Node path into the global hook config, so Codex does not need `node` in `PATH` later.

## 1. Link The Plugin Into Codex

From the repository root:

```bash
mkdir -p ~/.codex/plugins ~/.agents/plugins
ln -s "$(pwd)" ~/.codex/plugins/codex-memory
```

## 2. Register The Local Plugin Marketplace Entry

Create or update `~/.agents/plugins/marketplace.json`:

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

If you already have other local plugins, keep them and add `codex-memory` to the existing `plugins` array.

## 3. Install The Plugin In Codex

1. Restart Codex.
2. Open the plugin picker.
3. Install `Codex Memory` from `Local Plugins`.

Expected result:

- Codex app shows `Codex Memory` in the plugins list.
- Codex CLI can install or show it from `/plugins`.

At this point the plugin is discoverable, but hooks are not active yet.

## 4. Activate Runtime Hooks Globally

From this repository:

```bash
node ./adapters/codex/bin/install-global-hooks.mjs
```

This command safely:

- merges `~/.codex/hooks.json`
- enables `codex_hooks = true` in `~/.codex/config.toml`
- writes hook commands with an absolute Node executable path
- avoids overwriting unrelated hooks or unrelated config
- warns instead of corrupting ambiguous TOML layouts

At runtime, the plugin also treats `hooks_enabled` as `true` by default.

- default behavior: hooks enabled
- optional override: `CODEX_MEMORY_HOOKS_ENABLED=false`

When `hooks_enabled` is set to `false`, the plugin remains installed and hook execution stays non-fatal, but Codex Memory becomes inactive:

- no capture
- no prompt injection
- no durable learning
- no session consolidation
- `status`, `metrics`, and the dashboard show hooks as disabled

The expected feature flag is:

```toml
[features]
codex_hooks = true
```

## 5. Verify Activation

Run:

```bash
test -f ~/.codex/hooks.json && echo "global hooks config present"
rg -n "codex_hooks\\s*=\\s*true" ~/.codex/config.toml
rg -n "codex-memory-hook\\.mjs" ~/.codex/hooks.json
```

Healthy hook commands should reference an absolute Node path. They should not look like:

```text
node ".../codex-memory-hook.mjs"
```

They should look more like:

```text
"/absolute/path/to/node" ".../codex-memory-hook.mjs"
```

This repository intentionally does not ship an active repo-local `.codex/hooks.json`, because global and repo-local activation together cause duplicate execution inside `codex-memory`.

## 6. Run A Real Session

Open Codex in any repo and do a few real prompts. Then inspect the store:

```bash
ls -l ~/.codex/plugins/codex-memory/data
node ./cli/bin/codex-memory-inspect.mjs status --json
node ./cli/bin/codex-memory-inspect.mjs metrics --json
```

The default store path is:

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

## 7. Open The Dashboard

The recommended human-facing surface is the dashboard:

```bash
node ./cli/bin/codex-memory-inspect.mjs open-dashboard
```

If your environment is headless or you want an explicit file:

```bash
node ./cli/bin/codex-memory-inspect.mjs dashboard --output /tmp/codex-memory-dashboard.html --json
```

The default dashboard path is:

- `~/.codex/plugins/codex-memory/data/runtime/dashboard.html`

What to look for:

- `hooks_enabled`
- `memory_enabled` and `learning_enabled`
- `injection_rate`
- `empty_pack_rate`
- average token savings
- average token savings on injected prompts
- top empty-pack reasons
- quality-policy filtered reasons
- store noise
- whether `edges` are still zero

## 8. Understand What The Plugin Keeps

`codex-memory` is designed to keep durable, reusable memory such as:

- preferences
- workflows
- constraints
- technical decisions
- stable repo facts
- bugfix knowledge worth reusing

It rejects low-value durable noise such as:

- `You are a helpful assistant`
- generic system scaffolding
- title-only payloads such as `{"title":"Revisa SPEC-026 API v1"}`
- reminders like `Revisar SPEC-029 y SPEC-030`
- review chatter like `No encontré findings nuevos...`
- process notes like `If not blocked, summarize files edited so far...`
- absolute-path review fragments with line refs and no durable value

If you still see artifacts like those in the store, use the cleanup flow below.

## 9. Analyze And Clean The Store

Analyze the store without changing anything:

```bash
node ./cli/bin/codex-memory-inspect.mjs analyze-store --json
```

Preview compaction:

```bash
node ./cli/bin/codex-memory-inspect.mjs compact-store --json
```

Apply compaction:

```bash
node ./cli/bin/codex-memory-inspect.mjs compact-store --apply --json
```

`compact-store` only rewrites canonical artifacts when `--apply` is present.

Cleanup is useful when:

- historical runs learned obvious noise
- old store contents distort benchmarks or dashboard readings
- you want a cleaner baseline before continued dogfooding or demos

## 10. Troubleshooting

### Hooks fail with `code 127`

If Codex shows:

- `Failed`
- `error: hook exited with code 127`

rerun the installer:

```bash
node ./adapters/codex/bin/install-global-hooks.mjs
rg -n "codex-memory-hook\\.mjs" ~/.codex/hooks.json
```

This usually means the hook config was generated earlier with bare `node` instead of an absolute Node path.

### Plugin installs but no memory appears

Check these in order:

1. `codex_hooks = true` exists in `~/.codex/config.toml`
2. `~/.codex/hooks.json` contains `codex-memory-hook.mjs`
3. `CODEX_MEMORY_HOOKS_ENABLED` is not set to `false`
4. a real Codex session has been run after activation
5. `~/.codex/plugins/codex-memory/data/runtime/status.json` updates
6. `status`, `metrics`, and `dashboard` show fresh data

### Dashboard says memory is not winning

Read these metrics first:

- `injection_rate`
- `empty_pack_rate`
- `avg_token_savings_on_injected_prompts`
- `prompt_drop_reasons.empty_pack`
- `store.noise.detected`

Common interpretations:

- high injected savings + high empty-pack rate: memory helps when it lands, but recall is still too sparse
- high store noise: promotion quality is leaking low-value durable memory
- `scope_mismatch` dominating: memory exists, but mostly in another repo or branch
- `below_lexical_threshold` dominating: retrieval relevance is too weak

## Related Docs

- [README.md](../README.md)
- [cli/README.md](../cli/README.md)
- [docs/metrics.md](metrics.md)
- [docs/architecture.md](architecture.md)
- [docs/security-and-privacy.md](security-and-privacy.md)
