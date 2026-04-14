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
- the first useful memory artifact can be created in the first coding session.

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

The docs should eventually describe a local install flow roughly like this:

1. Copy or link the plugin into the local Codex plugin directory.
2. Add or update a local marketplace file that points to the plugin path.
3. Restart Codex if needed so the marketplace entry is discovered.
4. Enable or add the plugin from Codex app or CLI.
5. Use the default profile with semantic mode `off`.
6. Confirm health with a status or metrics surface.

The exact commands may evolve with Codex, but the user experience target should stay stable.

## Manifest and metadata target

The plugin package should be structured so it is both installable locally and ready for future publication:

- `.codex-plugin/plugin.json` must exist,
- the manifest should include stable package metadata,
- `repository` should point to the public GitHub repository,
- installation should not depend on reading the repository manually.

This gives users a clean local install path now and prepares the package for later marketplace publication.

## What should not happen

- Users should not need to choose between graph, vector, and storage options during first install.
- Users should not need to run a database.
- Users should not need to read internal specs before they can try the product.
- Users should not need separate install instructions for Codex app and Codex CLI unless a platform limitation makes that unavoidable.
- Users should not need marketplace publication before they can use the plugin locally.
- Users should not need an undocumented “install from repo URL” path to get started.
