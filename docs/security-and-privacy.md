# Security and Privacy

`codex-memory` persists information extracted from agent conversations, so safety is part of the everyday product surface, not a separate add-on.

## Security goals

- avoid storing secrets or credentials in durable artifacts,
- prevent memory leakage across scopes,
- keep injection inspectable and reversible,
- make cleanup and maintenance explicit instead of silent,
- reject durable memory that is generic or misleading even if it is technically extractable.

## Persistence model

The default persistence model is local-first and file-based. Canonical NDJSON artifacts live under the active store root and secondary indexes are rebuildable caches.

High-level rules:

- raw events are captured for auditability,
- durable memory is promoted only after consolidation and quality checks,
- redaction runs before persistence,
- indexes are secondary and can be rebuilt from canonical artifacts,
- store cleanup is explicit and operator-triggered.

## Secret handling

Before content becomes durable memory, the engine scans for obvious tokens, secrets, passwords, keys, and similar sensitive material. The persistence layer either redacts or blocks the write and records the outcome in runtime artifacts.

The project treats “store first, sanitize later” as out of scope.

## Scope isolation

Memory is scoped, not globally interchangeable. The engine distinguishes between:

- global preferences,
- repository or branch/workspace rules,
- session-local context.

This reduces cross-repository contamination and keeps the injected context explainable.

## Good memory policy as a safety mechanism

Memory quality is also a safety concern. Bad durable memory does not just waste tokens; it can lower trust in the product and inject misleading context.

The runtime now blocks promotion of content such as:

- `You are a helpful assistant`
- generic system scaffolding like “your job is to…”
- UI-title and prompt-template boilerplate
- review/meta artifacts such as `::code-comment{...}`
- trivial or incomplete fragments with no durable value

The product prefers durable memory that reflects recurring preferences, workflows, constraints, decisions, and sufficiently specific facts.

## Injection safety

Prompt injection is a controlled output of the engine. It must remain:

- token-bounded,
- attributable,
- deterministic under the default mode,
- safe to disable per session or via runtime flags,
- explainable through audit artifacts.

## Store maintenance and safety

The CLI now exposes maintenance commands:

```bash
node ./cli/bin/codex-memory-inspect.mjs analyze-store --json
node ./cli/bin/codex-memory-inspect.mjs compact-store --json
node ./cli/bin/codex-memory-inspect.mjs compact-store --apply --json
```

Safety properties of this flow:

- `analyze-store` is read-only,
- `compact-store` is read-only unless `--apply` is passed,
- compaction rewrites canonical artifacts explicitly and rebuilds indexes,
- duplicate/equivalent artifacts are removed deterministically,
- low-value durable noise can be removed using the same policy used by promotion,
- orphaned edges are dropped rather than left pointing at removed atoms.

This is especially useful when historical runtime behavior created duplicate artifacts or promoted noise that the current quality policy now rejects.

## Public repository expectations

For a user or maintainer reading this repository:

- docs must describe the real safety model, not an idealized future one,
- examples must avoid real secrets,
- benchmarks should not be padded by obvious duplicate/noise artifacts,
- cleanup instructions should be explicit so maintainers can reset the store to a trustworthy baseline.

## Related documents

- [docs/architecture.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/architecture.md)
- [docs/installation.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/installation.md)
- [docs/spec-roadmap.md](/Users/juanca/Library/CloudStorage/SynologyDrive-hermes/Desarrollo/codex-memory/docs/spec-roadmap.md)
