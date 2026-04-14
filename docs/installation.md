# Installation Strategy

This document defines what “simple installation” should mean for `codex-memory`, with the primary target being the Codex app, a compatible secondary path for Codex CLI, and a local-first distribution story before any future marketplace publication.

## Product target

The install story should feel like:

- **Codex app first** for the best user experience,
- **Codex CLI compatible** for power users and shared config,
- **local plugin installation first** so the project is usable before publication,
- **zero-dependency by default** so a new user can get value without local models, vector databases, or external services.

## Why this direction

OpenAI currently describes Codex as available across the Codex app, CLI, and IDE surfaces, and documents plugin packaging as the installable unit for reusable workflows in Codex. OpenAI also documents local marketplaces, local plugin installation, shared MCP configuration between Codex CLI and the IDE extension, and plugin metadata fields such as `repository`.

Design implication for this repo:

- ship `codex-memory` as a plugin-oriented package,
- optimize the first release for local plugin installation,
- expose it through a local marketplace entry rather than relying on manual file spelunking,
- keep the default install path independent of external infrastructure,
- make optional integrations additive rather than required for first use.

Important constraint from the current docs:

- Codex docs clearly document local plugin installation and marketplace-based discovery.
- This repository should not assume an officially supported “install directly from a Git repository URL” flow unless the Codex docs later document one.

So the product should be designed to feel close to that ideal, while using the officially documented local marketplace path for v1.

## Distribution path

### Phase 1: Local install

The first supported distribution path should be local installation.

That means the project should be packaged so a user can:

- place the plugin in the local Codex plugin directory or project plugin directory,
- register it in a repo-scoped or personal marketplace file,
- enable or install it from Codex,
- use shared local configuration for app and CLI,
- start working without any external service.

This is the required path for the first public release.

### Phase 2: Marketplace-ready packaging

The repository should leave a clean path for later publication in the Codex plugin marketplace.

That means:

- plugin metadata should be structured from the beginning,
- the plugin manifest should include repository metadata and other public package fields,
- documentation should avoid assuming only private/local usage,
- the local install flow should closely resemble the later marketplace flow,
- marketplace publication should simplify distribution, not change the runtime model.

Marketplace publication is a future delivery channel, not a separate product.

## Installation tiers

### Tier 1: Fast path

Target audience: users who want memory working in Codex app with minimal setup.

Requirements:

- install the plugin locally,
- expose it through a local Codex marketplace,
- enable or add it in Codex app,
- grant only the minimum local permissions it needs,
- use default local persistence,
- keep semantic mode `off`,
- expose a visible “memory active” status and an easy session-level off switch.

Success criteria:

- a new user can complete setup in under 5 minutes,
- no extra service needs to be installed,
- the first useful memory artifact can be created in the first coding session once runtime activation is implemented.

### Tier 2: Power-user local path

Target audience: CLI users and teams sharing configuration.

Requirements:

- same plugin package or equivalent shared config,
- same local install can be used by Codex app and Codex CLI,
- repo-local overrides,
- deterministic config schema,
- inspection commands available from CLI.

Success criteria:

- the same repository configuration works in Codex app and Codex CLI,
- installation does not require divergent config models for each surface.

### Tier 3: Optional semantic mode

Target audience: users who want higher recall and accept extra setup.

Requirements:

- semantic backend stays optional,
- install guide clearly labels it as advanced,
- failure to enable it must not break the core product.

Success criteria:

- advanced setup is separate from the default quickstart,
- the product behaves correctly when the optional backend is absent.

## UX requirements

- One primary quickstart, not multiple competing entry points.
- A clear “default mode” badge in docs and UI.
- Local install must be the documented default until marketplace publication exists.
- An obvious way to disable memory per session.
- A visible health/status command or panel.
- No silent fallback from a broken advanced mode into an unsafe mode.

## Target local install flow

The verified local install flow for the current repository is:

1. Clone the repository somewhere on the local machine.
2. Link the repository into `~/.codex/plugins/codex-memory`.
3. Create or update `~/.agents/plugins/marketplace.json`.
4. Point the marketplace entry at `./.codex/plugins/codex-memory`.
5. Restart Codex completely so the personal marketplace is reloaded.
6. Open `Plugins` in Codex app or `/plugins` in Codex CLI.
7. Search for `Codex Memory` and install it from `Local Plugins`.
8. Start in the default profile with semantic mode `off`.
9. Confirm the plugin is visible in Codex and ready for later memory and metrics surfaces.

Example:

```bash
mkdir -p ~/.codex/plugins
ln -s "/absolute/path/to/codex-memory" ~/.codex/plugins/codex-memory
mkdir -p ~/.agents/plugins
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

- Codex CLI reports that the plugin was installed.
- Codex app shows `Codex Memory` in the plugins list after restart.

This is an installation proof only. It does not, by itself, prove that live Codex sessions are invoking the adapter hooks or writing durable memory artifacts.

If discovery fails, check these first:

- `~/.agents/plugins/marketplace.json` exists.
- `source.path` is relative and set to `./.codex/plugins/codex-memory`.
- `~/.codex/plugins/codex-memory` points to this repository.
- Codex was fully restarted after adding or updating the marketplace entry.

This exact flow should stay stable unless Codex changes its local plugin packaging rules.

## Runtime activation note

The repository now treats real live-session validation as a separate bridge concern captured by `SPEC-025`.

That distinction matters:

- installation means the plugin is discoverable and enabled in Codex,
- runtime activation means Codex lifecycle hooks actually invoke the adapter,
- observable local persistence means a user can inspect file-based memory artifacts after a real session.

`SPEC-025` now wires runtime hooks and local persistence, so end-to-end live-session verification is available in local environments.

## Runtime activation and persistence verification

Codex runtime hook discovery uses:

- `~/.codex/hooks.json` for global hooks
- `<repo>/.codex/hooks.json` for repo-scoped hooks

Recommended activation for Codex Memory across repositories:

- install Codex Memory entries into `~/.codex/hooks.json`

Install/update command (safe merge with existing hooks):

```bash
node ./adapters/codex/bin/install-global-hooks.mjs
```

This command preserves pre-existing user hooks and refreshes only Codex Memory hook entries.
It also enables Codex hooks feature flag automatically in `~/.codex/config.toml` by ensuring:

```toml
[features]
codex_hooks = true
```

Normal flow does not require manual `config.toml` editing.

Repo-local fallback wiring:

- `.codex/hooks.json`

Quick activation sanity check:

```bash
test -f ~/.codex/hooks.json && echo "global hooks config present"
rg -n "codex_hooks\\s*=\\s*true" ~/.codex/config.toml
```

Canonical local artifacts are persisted as NDJSON in the active store path:

- `events.ndjson`
- `atoms.ndjson`
- `edges.ndjson`
- `capsules.ndjson`

Default store path:

- `~/.codex/plugins/codex-memory/data`

Optional override:

- `CODEX_MEMORY_STORE_DIR=/absolute/path`

Manual verification from terminal using real Codex hook events:

```bash
tmp_store="$(mktemp -d)"
printf '%s' '{"hook_event_name":"SessionStart","session_id":"manual-install-s1","cwd":"'"$PWD"'","model":"gpt-5.4"}' | node ./adapters/codex/bin/codex-memory-hook.mjs SessionStart --store-path "$tmp_store"
printf '%s' '{"hook_event_name":"UserPromptSubmit","session_id":"manual-install-s1","turn_id":"turn-1","cwd":"'"$PWD"'","model":"gpt-5.4","prompt":"Always run node --test before finalize"}' | node ./adapters/codex/bin/codex-memory-hook.mjs UserPromptSubmit --store-path "$tmp_store"
printf '%s' '{"hook_event_name":"Stop","session_id":"manual-install-s1","turn_id":"turn-1","cwd":"'"$PWD"'","model":"gpt-5.4","stop_hook_active":false,"last_assistant_message":"We will run node --test first and fix failures."}' | node ./adapters/codex/bin/codex-memory-hook.mjs Stop --store-path "$tmp_store"
ls -l "$tmp_store"
```

Expected proof:

- hook commands return JSON compatible with Codex hook output,
- canonical artifact files are present,
- `atoms/edges/capsules` are produced when learning is enabled,
- setting `disable_learning=true` keeps event capture but blocks durable promotion.

Inspect the default persistent location used by Codex Memory:

```bash
ls -l ~/.codex/plugins/codex-memory/data
sed -n '1,5p' ~/.codex/plugins/codex-memory/data/events.ndjson
sed -n '1,5p' ~/.codex/plugins/codex-memory/data/atoms.ndjson
```

Cross-repo verification:

1. Install plugin once in Codex.
2. Run `node ./adapters/codex/bin/install-global-hooks.mjs`.
3. Open Codex in a different repository.
4. Run one short turn.
5. Confirm artifacts update in `~/.codex/plugins/codex-memory/data/`.

If installer output contains warnings, treat them as actionable:

- hook warnings: installer preserved existing hooks and adjusted Codex Memory entries.
- config warnings: installer found ambiguous `config.toml` structure and skipped unsafe edits; manual follow-up may be required.

## Manifest and metadata target

The plugin package should be structured so it is both installable locally and ready for future publication:

- `.codex-plugin/plugin.json` must exist,
- the manifest should include stable package metadata,
- `repository` should point to the public GitHub repository,
- installation should not depend on reading the repository manually.

This gives users a clean local install path now and prepares the package for later marketplace publication.

## Implementation planning note

The first implementation milestone should prove this local install flow early. Installability should not be validated only at the end of the project.

## What should not happen

- Users should not need to choose between graph, vector, and storage options during first install.
- Users should not need to run a database.
- Users should not need to read internal specs before they can try the product.
- Users should not need separate install instructions for Codex app and Codex CLI unless a platform limitation makes that unavoidable.
- Users should not need marketplace publication before they can use the plugin locally.
- Users should not need an undocumented “install from repo URL” path to get started.
