# codex-memory

`codex-memory` is a local-first memory engine for coding agents, with a first-party adapter for Codex.

Its goal is simple: **reduce raw prompt context and re-inject only the memory that helps the agent perform better**. Instead of replaying entire chat histories, the system captures durable signals, compresses them into reusable memory objects, and builds a bounded context pack for each new turn.

## What this is

- A reusable memory core for agent workflows.
- A Codex adapter that plugs the core into session hooks.
- A specs-first public repository that defines how memory is captured, consolidated, retrieved, audited, and safely injected.

## Why not just save all chats

Saving every chat transcript is easy, but it is a poor memory strategy for an agent:

- It burns tokens on repeated raw history.
- It mixes durable preferences with one-off noise.
- It preserves contradictions instead of resolving them.
- It leaks context across repos, branches, and sessions.

This project aims to keep what matters and drop what does not.

## Core ideas

### 1. Multi-level memory

Memory is scoped so the engine can distinguish between:

- global user preferences,
- repository and branch-specific rules,
- short-lived session context.

### 2. Cheap-first retrieval

The default path is deterministic and inexpensive:

- lexical retrieval,
- scope filters,
- confidence and recency ranking,
- graph expansion only when it helps.

### 3. Graph-first structure, semantic search optional

Relationships between memory objects are part of the core design and belong in the first release. Semantic search is supported through an optional backend interface, but the product must remain useful when semantic mode is disabled and the first public milestone should ship without requiring a semantic backend.

### 4. Token budgeting as a product feature

The engine does not merely retrieve memory. It composes a `ContextPack` under a strict budget and records why each item was kept, trimmed, or rejected.

## How it works

1. Hooks capture signals from the active agent session.
2. Session data is consolidated into durable memory atoms and compressed capsules.
3. A retrieval pipeline ranks relevant memory for the next task.
4. A bounded `ContextPack` is injected into the next prompt.
5. Audit artifacts explain what the engine decided and why.

## Repository layout

This repository currently focuses on design and planning:

- [`docs/specs/`](docs/specs/) — numbered implementation specs
- [`docs/spec-roadmap.md`](docs/spec-roadmap.md) — public roadmap of the spec set
- [`docs/architecture.md`](docs/architecture.md) — engine architecture overview
- [`docs/security-and-privacy.md`](docs/security-and-privacy.md) — persistence and safety model
- [`docs/plans/`](docs/plans/) — implementation sequencing and wave planning

Target implementation layout described by the specs:

- `core/` — reusable memory engine
- `adapters/codex/` — Codex hook integration
- `cli/` — inspection, replay, and maintenance commands
- `docs/` — public and internal documentation

## Modes of operation

### Zero-dependency core

The base product must work without external services or mandatory model downloads. This mode relies on local storage, deterministic retrieval, graph expansion, and bounded context packing.

### Optional semantic backend

Semantic retrieval is an extension point, not a requirement. The core interfaces must remain stable when semantic mode is set to `off`, and the semantic backend is planned as a post-MVP enhancement after the zero-dependency foundation is validated.

## Installation target

The intended installation experience is **simple in Codex app, compatible with Codex CLI, and still useful in zero-dependency mode**.

Design target:

- installable locally as a Codex plugin package from day one,
- discoverable through a local Codex marketplace entry,
- minimal manual setup for the default mode,
- no mandatory external database or hosted service,
- one clear local path for “works now,”
- a future publication path for the Codex plugin marketplace,
- and a second path for optional semantic enhancements.

The repository is being designed so the first useful setup can be explained in a short quickstart:

1. install the plugin locally in Codex,
2. expose it through a local marketplace entry,
3. enable it from Codex app or Codex CLI,
4. point it at the local repository or workspace,
5. keep semantic mode disabled by default,
6. start with safe local persistence and visible audit output.

The long-term goal is that a user can identify the plugin from its repository metadata and later install it from a published marketplace entry. For the first releases, the supported path is local installation through Codex's plugin system rather than direct install from a Git URL.

Marketplace publication is a later distribution step, not a blocker for the core user experience.

See the evolving install guidance in [`docs/installation.md`](docs/installation.md).

## Metrics and observability

This project is not treating “memory” as a black box. A useful release needs metrics that answer two questions:

- is it actually saving prompt tokens,
- is it preserving or improving answer quality.

The current design work tracks both runtime and evaluation metrics, including:

- token reduction versus baseline,
- memory hit rate,
- contamination across scopes,
- contradiction rate,
- user correction rate,
- pack fill rate and drop reasons.

The intended user-facing surfaces are:

- a quick status view in Codex app,
- CLI inspection commands for local runs,
- and structured local audit artifacts for deeper analysis.

See [`docs/metrics.md`](docs/metrics.md) and [`docs/specs/spec-018-evaluation-and-benchmark-methodology.md`](docs/specs/spec-018-evaluation-and-benchmark-methodology.md).

## Privacy and safety

- Local-first persistence
- Secret redaction before storage
- Scope-aware memory isolation
- Explainable prompt injection
- Explicit fallback behavior when optional capabilities are unavailable

See [`docs/security-and-privacy.md`](docs/security-and-privacy.md).

## License

This repository is released under the MIT License. See [`LICENSE`](LICENSE).

## Roadmap

The first milestone is not code. It is a coherent spec set that makes the future implementation obvious and reusable.

Current repository goals:

- rewrite the legacy specs into a layered product architecture,
- define measurable token-saving behavior,
- land a strong zero-dependency MVP before optional semantic enhancements,
- document the public OSS story from day one,
- prepare a clean handoff for implementation work.

## Contributing and design process

This repository is **specs-first**.

- Product and architecture changes should start as spec changes.
- New adapters should build on the reusable memory core.
- New retrieval backends should implement the published backend contracts rather than changing the engine model.
- Public documentation changes should stay aligned with the spec tree.

### How to contribute

1. Read the spec index in [`docs/specs/README.md`](docs/specs/README.md) and the roadmap in [`docs/spec-roadmap.md`](docs/spec-roadmap.md).
2. If your change affects behavior, update the relevant numbered spec first or include a new spec proposal.
3. Keep the architecture split intact: reusable engine in `core`, host-specific behavior in `adapters`, operational tooling in `cli`.
4. Prefer small pull requests scoped to a single spec or a tightly related doc change.
5. When introducing optional backends or adapters, document the fallback behavior and safe defaults explicitly.

### Good first contributions

- tighten acceptance criteria in a spec,
- improve public docs clarity,
- propose evaluation fixtures or benchmark methodology,
- refine safety or scope-isolation guidance,
- draft adapter or backend extension specs without bypassing the core model.
