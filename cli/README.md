# cli

Operational command package for inspecting, measuring, and maintaining a real `codex-memory` store.

This package reads canonical artifacts produced by `core/` and `adapters/codex/`. It does not invent parallel memory state.

## Start Here

For day-to-day use, open the dashboard:

```bash
node ./cli/bin/codex-memory-inspect.mjs open-dashboard
```

If you want a file instead of opening a browser:

```bash
node ./cli/bin/codex-memory-inspect.mjs dashboard --output /tmp/codex-memory-dashboard.html --json
```

The default dashboard path is:

- `~/.codex/plugins/codex-memory/data/runtime/dashboard.html`

## Main Commands

Inspection and health:

- `node ./cli/bin/codex-memory-inspect.mjs status --json`
- `node ./cli/bin/codex-memory-inspect.mjs metrics --json`
- `node ./cli/bin/codex-memory-inspect.mjs dashboard`
- `node ./cli/bin/codex-memory-inspect.mjs open-dashboard`
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

## What To Read First

If you are trying to answer “is this plugin helping or not?”, look at:

- `dashboard`
- `metrics`
- `inspect-last-pack`
- `analyze-store`

That gives you:

- whether hooks are enabled at all
- current runtime state
- injection frequency
- empty-pack frequency
- token savings overall and on injected prompts
- dominant drop reasons
- current durable-noise levels in the store

## Cleanup Behavior

`analyze-store` is read-only. It reports:

- duplicate artifacts
- low-value durable noise
- policy reason breakdowns for noisy atoms/capsules
- orphaned edges that point at missing memory ids

`compact-store` is also read-only until `--apply` is passed. With `--apply`, it:

- deduplicates canonical `events`, `atoms`, `edges`, and `capsules`
- removes durable noise using the same deterministic policy used by promotion
- removes orphaned edges that point at removed or already-missing memory
- rebuilds indexes from the cleaned canonical artifacts

That safety gate matters because compaction rewrites canonical storage.

## Reading The Metrics

The most important fields in `metrics` are:

- `runtime.hooks_enabled`
- `injection_rate`
- `empty_pack_rate`
- `avg_token_savings_estimate`
- `avg_token_savings_on_injected_prompts`
- `max_token_savings_estimate`
- `prompt_drop_reasons`
- `learning.quality_policy_filtered_reasons`
- `store.noise`
- `store.edges.zero_edges_visible`

Useful heuristics:

- high `injection_rate` is good only if injected prompts also save meaningful tokens
- high `empty_pack_rate` means the plugin often had nothing relevant enough to inject
- `scope_mismatch` dominating empty packs usually means memory exists but in the wrong repo or branch
- `below_lexical_threshold` dominating empty packs usually means memory exists but lexical matching is still weak
- high store-noise detection means the persisted store is drifting toward process chatter or review residue

## Boundary Rules

- CLI reuses canonical artifacts produced by `core/` and `adapters/codex/`
- CLI stays local-first and zero-deps
- cleanup is deterministic
- destructive rewrites require explicit `--apply`
