# cli

Operational command package for local inspection, benchmarking, release-readiness checks, and store maintenance.

This package consumes canonical artifacts produced by `core/` and `adapters/codex/`. It does not redefine memory semantics; it exposes and audits them.

## Commands

Inspection and health:

- `node ./cli/bin/codex-memory-inspect.mjs status --json`
- `node ./cli/bin/codex-memory-inspect.mjs metrics --json`
- `node ./cli/bin/codex-memory-inspect.mjs inspect-last-pack --json`
- `node ./cli/bin/codex-memory-inspect.mjs inspect-session --session-id <session-id> --json`
- `node ./cli/bin/codex-memory-inspect.mjs explain-atom --atom-id <atom-id> --json`

Store maintenance:

- `node ./cli/bin/codex-memory-inspect.mjs analyze-store --json`
- `node ./cli/bin/codex-memory-inspect.mjs compact-store --json`
- `node ./cli/bin/codex-memory-inspect.mjs compact-store --apply --json`

Evaluation:

- `node ./cli/bin/codex-memory-benchmark.mjs --fixture ./adapters/codex/tests/fixtures/layer4-golden-path-session.json --json`
- `node ./cli/bin/codex-memory-quality-gates.mjs --benchmark-report <path>.json --store-path ~/.codex/plugins/codex-memory/data --json`

## Cleanup behavior

`analyze-store` is read-only. It reports:

- duplicate/equivalent artifacts,
- low-value durable noise,
- policy reason breakdowns for noisy atoms/capsules,
- orphaned edges that point at missing memory ids.

`compact-store` is also read-only until `--apply` is passed. With `--apply`, it:

- deduplicates canonical `events`, `atoms`, `edges`, and `capsules`,
- removes durable noise using the same deterministic policy used by promotion,
- removes orphaned edges that point at removed or already-missing memory,
- rebuilds indexes from the cleaned canonical artifacts.

This safety gate matters because compaction rewrites the canonical store.

`metrics` now also surfaces learning-quality health from recent `Stop` audits, including how many candidate memories were filtered by policy before promotion and the dominant rejection reasons.

## Boundary rules

- CLI reuses canonical artifacts produced by `core/` and `adapters/codex/`.
- CLI does not invent parallel memory state.
- Cleanup stays zero-deps and deterministic.
- Destructive rewrites require the explicit `--apply` action.
