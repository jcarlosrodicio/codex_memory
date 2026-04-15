# codex-memory

`codex-memory` is a local-first memory engine for coding agents, with a first-party adapter for Codex.

The product goal is simple: reduce raw prompt replay and reinject only the memory that is durable, scoped, explainable, and actually useful. The MVP already captures real Codex hook events, promotes durable memory into a local store, injects bounded context packs, records audit artifacts, and now includes store cleanup plus a practical memory-quality policy.

## What ships today

- `core/`: deterministic memory model, storage, retrieval, packing, and learning promotion.
- `adapters/codex/`: real Codex hook integration with global activation and safe degradation.
- `cli/`: inspection, benchmark, quality-gates, and store maintenance commands.
- `docs/`: public docs and numbered specs aligned to the current runtime.

## Why this exists

Saving whole chat transcripts is easy, but it makes agent memory worse:

- it burns tokens on repeated raw history,
- it mixes durable preferences with one-off noise,
- it preserves contradictions instead of resolving them,
- it leaks context across repos, branches, and sessions,
- it makes it hard to audit why something was remembered.

`codex-memory` keeps the cheap-first, zero-deps path as the default: lexical retrieval, explicit scope rules, deterministic promotion, bounded injection, and file-based persistence.

## MVP status

The repo is no longer only a design skeleton. Layers 1-5 are implemented enough to run end-to-end locally:

- capture and normalization,
- signal extraction and session consolidation,
- lexical retrieval and graph expansion,
- runtime controls and observable local persistence,
- inspection, benchmarking, and release-quality checks,
- public OSS documentation for real users.

Still intentionally out of scope for the first public release:

- mandatory semantic/vector infrastructure,
- replaying full chat transcripts as the main memory format,
- a multi-adapter ecosystem beyond Codex.

## How it works

1. Codex hooks capture session events.
2. The session pipeline extracts candidate signals from prompt/response excerpts.
3. A memory-quality policy rejects generic scaffolding and low-value fragments before durable promotion.
4. The consolidator promotes durable atoms, edges, and session capsules into the local store.
5. Retrieval builds a bounded `ContextPack` for the next task.
6. Runtime artifacts explain what was injected, dropped, redacted, learned, or skipped.

## Good memory policy

The project now treats “good memory” as a deterministic product rule, not a vague aspiration.

Durable memory is usually one of these:

- user preferences that are likely to recur,
- repository workflows or commands worth repeating,
- constraints that bound future work,
- decisions that supersede older behavior,
- concrete facts about the repo/runtime/config that are stable enough to matter.

The pipeline rejects content that is technically extractable but not useful durable memory, including examples like:

- `You are a helpful assistant`
- generic system scaffolding such as “your job is to…”
- prompt boilerplate or UI-title instructions
- review chatter such as `No encontré findings nuevos en este fix`
- review/meta artifacts such as `::code-comment{...}`
- absolute user-home file references or line-specific review fragments with no durable value
- fragments ending in `:` or trivial bullet/header leftovers
- text that is too generic, too short, or too unspecific to save tokens later
- subjective process chatter such as “mi conclusión es…” or “siguiente paso razonable…”

This policy is deterministic, zero-deps, auditable in tests, and shared between promotion and store maintenance.

## Store layout and persistence

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

Override the store root with `CODEX_MEMORY_STORE_DIR` when needed.

## Install and activate

Local marketplace install is the supported first-use path.

1. Clone the repository.
2. Link it into `~/.codex/plugins/codex-memory`.
3. Add it to `~/.agents/plugins/marketplace.json`.
4. Restart Codex and install `Codex Memory` from `Local Plugins`.
5. Run the global hook installer.

```bash
mkdir -p ~/.codex/plugins ~/.agents/plugins
ln -s "/absolute/path/to/codex-memory" ~/.codex/plugins/codex-memory
node ./adapters/codex/bin/install-global-hooks.mjs
rg -n "codex_hooks\\s*=\\s*true" ~/.codex/config.toml
```

That installer safely merges `~/.codex/hooks.json` and ensures:

```toml
[features]
codex_hooks = true
```

The repo intentionally does not ship an always-on repo-local `.codex/hooks.json`, because combining repo-local and global activation causes duplicate execution inside `codex-memory`.

The installer also writes hook commands with an explicit Node executable path instead of bare `node`. This avoids the common real-world failure mode:

- `Failed`
- `error: hook exited with code 127`

If you still see `127`, the usual fix is to rerun the installer so `~/.codex/hooks.json` is regenerated with the current Node path:

```bash
node ./adapters/codex/bin/install-global-hooks.mjs
rg -n "codex-memory-hook\\.mjs" ~/.codex/hooks.json
```

Healthy output should show commands that start with a quoted absolute Node path, not plain `node`.

Detailed setup is in [docs/installation.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/installation.md).

## Inspect, measure, and maintain

Core operator commands:

```bash
node ./cli/bin/codex-memory-inspect.mjs status --json
node ./cli/bin/codex-memory-inspect.mjs metrics --json
node ./cli/bin/codex-memory-inspect.mjs inspect-last-pack --json
node ./cli/bin/codex-memory-inspect.mjs analyze-store --json
node ./cli/bin/codex-memory-inspect.mjs compact-store --json
node ./cli/bin/codex-memory-inspect.mjs compact-store --apply --json
node ./cli/bin/codex-memory-benchmark.mjs --fixture ./adapters/codex/tests/fixtures/layer4-golden-path-session.json --json
node ./cli/bin/codex-memory-quality-gates.mjs --benchmark-report <path>.json --store-path ~/.codex/plugins/codex-memory/data --json
```

`analyze-store` reports duplicate and low-value artifacts in canonical storage.

`metrics` now also summarizes recent learning quality, including how many candidate memories were filtered by policy before durable promotion.

`compact-store` is safe by default and only rewrites canonical artifacts when you pass `--apply`. The compaction flow:

- deduplicates exact/equivalent `events`, `atoms`, `edges`, and `capsules`,
- drops atoms/capsules that match the same noise policy used by promotion,
- removes orphaned edges pointing at missing or removed memory,
- rebuilds secondary indexes from canonical artifacts.

Use compaction when:

- earlier runtime versions created duplicate entries,
- benchmarks or audits look inflated by historical noise,
- the store has accumulated generic memories that should never have been durable,
- you want a cleaner pre-release baseline.

## Metrics and health

The MVP is healthy when you can verify all of these:

- hooks run in real Codex sessions,
- canonical artifacts appear under the store path,
- `status` shows runtime and learning state,
- `metrics` shows pack/retrieval/drop/token-savings numbers,
- `inspect-last-pack` explains injection decisions,
- benchmarks and quality gates stay green,
- store analysis shows duplicates/noise under control.

## Safety model

The product is local-first and fail-closed by default:

- redaction runs before persistence,
- scope isolation prevents cross-repo contamination by default,
- learning and injection can be disabled safely,
- semantic mode stays optional,
- audit artifacts explain what happened.

Security details live in [docs/security-and-privacy.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/security-and-privacy.md).

## Repository map

- [docs/installation.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/installation.md)
- [docs/architecture.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/architecture.md)
- [docs/security-and-privacy.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/security-and-privacy.md)
- [docs/spec-roadmap.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/spec-roadmap.md)
- [docs/specs/spec-020-public-documentation-and-oss-positioning.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/specs/spec-020-public-documentation-and-oss-positioning.md)
- [cli/README.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/cli/README.md)

## Public-release posture

After this pass, the repo is much closer to a usable first public release:

- real runtime activation exists,
- persistence is observable,
- learning quality is curated instead of purely permissive,
- the store can be analyzed and compacted safely,
- the OSS docs describe the product that actually ships.

The biggest remaining follow-up after this MVP block is broader operator surface work beyond the current maintenance commands, especially richer export/query flows and deeper safety auditing.
