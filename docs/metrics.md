# Metrics Strategy

`codex-memory` needs metrics for two different jobs:

- prove the product works,
- help users and contributors diagnose when it does not.

## Metric groups

### 1. Efficiency metrics

These measure whether memory is reducing prompt cost:

- `baseline_prompt_tokens`
- `memory_pack_tokens`
- `token_savings_absolute`
- `token_savings_percent`
- `pack_fill_rate`

### 2. Retrieval quality metrics

These measure whether the right memory is being selected:

- `retrieval_hit_rate_at_k`
- `capsule_hit_rate`
- `graph_expansion_yield`
- `semantic_assist_rate`

### 3. Safety and correctness metrics

These measure whether memory harms usability:

- `scope_contamination_rate`
- `contradiction_injection_rate`
- `secret_block_rate`
- `user_correction_rate`
- `pack_drop_reason_distribution`

### 4. Runtime health metrics

These help users understand the current state of the plugin:

- `memory_enabled`
- `learning_enabled`
- `semantic_mode`
- `last_pack_build_ms`
- `last_retrieval_ms`
- `index_health`
- `audit_last_updated_at`

## Minimum visible metrics for users

The default inspect surface should expose at least:

- whether memory is on,
- current semantic mode,
- last pack size,
- last token savings estimate,
- number of retrieved items,
- number of dropped items,
- whether any safety filter blocked persistence recently.

Preferred local surfaces:

- Codex app status or plugin panel for the last-run summary,
- CLI commands such as `status`, `metrics`, or `inspect-last-pack`,
- structured local audit files for scripting and long-run analysis.

Implementation planning note:

- As soon as `ContextPack` exists, the implementation should expose a minimum metric set: `pack_tokens`, `retrieved_count`, `dropped_count`, `token_savings_estimate`, `memory_enabled`, and `semantic_mode`.
- Full benchmark depth can come later, but these metrics should not wait until the end of the roadmap.

## Minimum benchmark metrics for release

Before claiming the plugin works well, benchmark outputs should show:

- median token savings versus baseline,
- memory recall on replay fixtures,
- contamination and contradiction rates,
- user-correction proxy or equivalent replay correction signal.

## Interpretation rule

No single metric is sufficient.

- High token savings with poor recall is a failure.
- High recall with high contamination is a failure.
- Good retrieval with poor installability is still a product problem.

The goal is balanced performance, not aggressive compression at any cost.
