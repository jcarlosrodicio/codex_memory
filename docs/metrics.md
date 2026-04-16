# Metrics Strategy

`codex-memory` uses metrics for two jobs:

- help users understand whether memory is helping on real work
- help contributors diagnose why it is not

## Metric groups

### 1. Prompt outcome metrics

These answer whether memory is actually helping on real prompts:

- `injection_rate`
- `empty_pack_rate`
- `avg_token_savings_estimate`
- `avg_token_savings_on_injected_prompts`
- `max_token_savings_estimate`
- `pack_build_count`
- `prompt_drop_reasons`

### 2. Learning-quality metrics

These answer whether the engine is promoting the right memory:

- `filtered_by_quality_policy`
- `filtered_reasons`
- `quality_policy_filtered_reasons`
- `promoted_atoms`
- `promoted_capsules`

### 3. Store-health metrics

These answer whether persisted memory quality is degrading over time:

- artifact counts by type
- duplicate counts
- orphan counts
- `store.noise.detected`
- `store.noise.rate`
- `store.noise.by_reason`
- whether `edges` are still zero

### 4. Runtime health metrics

These help users understand the current live state of the plugin:

- `memory_enabled`
- `learning_enabled`
- `semantic_mode`
- `audit_last_updated_at`
- last pack tokens / retrieved / dropped / savings
- safety flags such as blocked persistence or redaction

## Minimum visible metrics for users

The default inspect surface should expose at least:

- whether hooks are enabled,
- whether memory is on,
- current semantic mode,
- injection rate and empty-pack rate,
- average savings overall and on injected prompts,
- dominant empty-pack reasons,
- filtered quality-policy reasons,
- current store noise counts,
- whether any safety filter blocked persistence recently,
- whether `edges` are still effectively unused.

Preferred local surfaces:

- the local `dashboard` for daily human use,
- CLI commands such as `status`, `metrics`, and `inspect-last-pack` for technical inspection,
- structured local audit files for scripting and long-run analysis.

Implementation note:

- `metrics` is the machine-readable surface.
- `dashboard` is the recommended human-facing surface for daily use.
- The runtime must expose enough data to answer “is memory saving tokens or not?” without needing external telemetry.

## Minimum benchmark metrics for release

Before claiming the plugin works well, benchmark outputs should show:

- median token savings versus baseline,
- memory recall on replay fixtures,
- contamination and contradiction rates,
- user-correction proxy or equivalent replay correction signal.

## Interpretation rule

No single metric is sufficient.

- High injected savings with poor `injection_rate` is a failure.
- High `injection_rate` with high store noise is a failure.
- High recall with high contamination is a failure.
- Good retrieval with poor installability is still a product problem.

Practical operator reading:

- `empty_pack_rate` tells you how often the system had nothing useful to inject.
- `avg_token_savings_on_injected_prompts` tells you how valuable memory is when it actually lands.
- `prompt_drop_reasons.empty_pack` explains why the system missed those prompts.
- `store.noise.detected` tells you whether the persisted memory is drifting toward review residue or process chatter.

The goal is balanced performance, not aggressive compression at any cost.
