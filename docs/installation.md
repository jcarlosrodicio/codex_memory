# Installation Strategy

This document describes the supported installation and activation path for the current MVP. The goal is to get `codex-memory` running in Codex app or Codex CLI with the zero-deps path first, observable persistence second, and optional advanced features later.

## Product target

The install story should feel like:

- Codex app first,
- Codex CLI compatible,
- local plugin installation first,
- zero-deps by default,
- explicit activation and explicit verification.

## Supported distribution path

The first public release supports local installation through Codex's documented plugin and marketplace flow.

1. Clone the repository locally.
2. Link it into `~/.codex/plugins/codex-memory`.
3. Register it in `~/.agents/plugins/marketplace.json`.
4. Restart Codex and install `Codex Memory` from `Local Plugins`.
5. Run the global hook installer so runtime activation is actually live.

Example:

```bash
mkdir -p ~/.codex/plugins ~/.agents/plugins
ln -s "/absolute/path/to/codex-memory" ~/.codex/plugins/codex-memory
```

`~/.agents/plugins/marketplace.json`:

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

Expected result:

- Codex discovers the plugin.
- Codex app shows `Codex Memory` in the plugins list.
- Codex CLI can install it from `/plugins`.

This proves installability, not runtime activation.

## Runtime activation

Real runtime activation uses global Codex hooks:

- `~/.codex/hooks.json`

Install or refresh the hooks with:

```bash
node ./adapters/codex/bin/install-global-hooks.mjs
```

This command is idempotent and non-destructive:

- it merges `~/.codex/hooks.json` instead of replacing unrelated hooks,
- it ensures the Codex feature flag is enabled in `~/.codex/config.toml`,
- it resolves a concrete Node executable path for hook commands so runtime does not depend on host `PATH`,
- it preserves unrelated config when the file layout is safe to edit,
- it warns instead of corrupting ambiguous TOML.

The expected feature flag is:

```toml
[features]
codex_hooks = true
```

Verification:

```bash
test -f ~/.codex/hooks.json && echo "global hooks config present"
rg -n "codex_hooks\\s*=\\s*true" ~/.codex/config.toml
rg -n "codex-memory-hook\\.mjs" ~/.codex/hooks.json
```

Healthy hook commands should start with a quoted absolute Node path. They should not look like bare `node ".../codex-memory-hook.mjs"`.

This repository intentionally avoids an active repo-local `.codex/hooks.json` because global + repo-local activation causes duplicate execution in `codex-memory` itself.

## Persistence verification

Default store path:

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

Quick local verification with real hook payloads:

```bash
tmp_store="$(mktemp -d)"
printf '%s' '{"hook_event_name":"SessionStart","session_id":"manual-install-s1","cwd":"'"$PWD"'","model":"gpt-5.4"}' | node ./adapters/codex/bin/codex-memory-hook.mjs SessionStart --store-path "$tmp_store"
printf '%s' '{"hook_event_name":"UserPromptSubmit","session_id":"manual-install-s1","turn_id":"turn-1","cwd":"'"$PWD"'","model":"gpt-5.4","prompt":"Always run node --test before finalize"}' | node ./adapters/codex/bin/codex-memory-hook.mjs UserPromptSubmit --store-path "$tmp_store"
printf '%s' '{"hook_event_name":"Stop","session_id":"manual-install-s1","turn_id":"turn-1","cwd":"'"$PWD"'","model":"gpt-5.4","stop_hook_active":false,"last_assistant_message":"We will run node --test first and fix failures."}' | node ./adapters/codex/bin/codex-memory-hook.mjs Stop --store-path "$tmp_store"
ls -l "$tmp_store"
```

Then inspect the default store after a real Codex session:

```bash
ls -l ~/.codex/plugins/codex-memory/data
node ./cli/bin/codex-memory-inspect.mjs status --json
node ./cli/bin/codex-memory-inspect.mjs metrics --json
```

## Maintenance and cleanup

The MVP now includes store maintenance commands in the inspection CLI.

Analyze the current store:

```bash
node ./cli/bin/codex-memory-inspect.mjs analyze-store --json
```

Dry-run compaction:

```bash
node ./cli/bin/codex-memory-inspect.mjs compact-store --json
```

Apply compaction explicitly:

```bash
node ./cli/bin/codex-memory-inspect.mjs compact-store --apply --json
```

`compact-store` only rewrites the canonical artifacts when `--apply` is provided. The cleanup flow deduplicates exact/equivalent artifacts, removes low-value durable memory that violates the quality policy, drops edges that point to removed atoms, and rebuilds indexes from canonical state.

Run cleanup when:

- historical duplicates inflated the store,
- old runtime behavior learned obvious noise,
- benchmarks or audits need a cleaner baseline,
- you are preparing a release or demo and want the persisted store to reflect the current policy.

## Good memory expectations after install

The runtime should learn durable preferences, workflows, constraints, decisions, and stable repo facts. It should not promote generic scaffolding such as `You are a helpful assistant`, prompt templates, UI-title boilerplate, review artifacts like `::code-comment{...}`, review chatter like `No encontré findings nuevos...`, or absolute-path review fragments that only describe one temporary fix discussion.

If you see those in the store, run `analyze-store` and `compact-store --apply`, then inspect the result.

## Troubleshooting visible hook failures

If Codex shows:

- `Failed`
- `error: hook exited with code 127`

the installed hook command was likely generated by an older runtime that called bare `node` and the host surface did not expose `node` in `PATH`.

Regenerate the global hooks:

```bash
node ./adapters/codex/bin/install-global-hooks.mjs
rg -n "codex-memory-hook\\.mjs" ~/.codex/hooks.json
```

Then run a short real Codex session and confirm:

- no visible hook failure notification appears,
- `~/.codex/plugins/codex-memory/data/runtime/status.json` updates,
- `node ./cli/bin/codex-memory-inspect.mjs status --json` reports fresh `audit_last_updated_at`.

## Optional advanced path

Semantic retrieval remains optional and is not required for the default installation. The zero-deps path is the supported default for the first public release.
