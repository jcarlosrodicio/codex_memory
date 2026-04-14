# Security and Privacy

`codex-memory` is intended to persist information extracted from agent conversations. That makes safety a product requirement, not an afterthought.

## Security goals

- Avoid storing secrets and credentials in memory artifacts.
- Prevent accidental leakage of memory across scopes.
- Keep memory injection inspectable and reversible.
- Make optional capabilities fail closed rather than silently broadening access.

## Persistence model

The default persistence model is local-first and file-based. Specs define the exact formats, versioning rules, and indexes, but the high-level rules are stable:

- raw events are not assumed safe for long-term reuse,
- durable memory must pass a consolidation and redaction pipeline,
- schema upgrades must be explicit and reversible,
- audit artifacts must explain what was persisted and what was dropped.

## Secret handling

Before any content becomes durable memory, the engine must:

- scan for credentials, API keys, tokens, passwords, and common secret patterns,
- redact or block persistence according to policy,
- surface the outcome in the audit trail.

The repository treats “store first, sanitize later” as out of scope.

## Scope isolation

Memory is not globally interchangeable. The engine must distinguish:

- global preferences,
- repository or branch-specific rules,
- session-local working context.

The specs require explicit precedence, conflict handling, and fallback behavior so memory from one project does not contaminate another.

## Injection safety

Prompt injection is a controlled output of the engine. It must be:

- token-bounded,
- attributable,
- stable under disabled optional backends,
- safe to turn off per session or per environment.

## Public repository expectations

Because this is a public repository:

- the documentation must explain the safety model in plain language,
- extension points must define safe defaults,
- examples must avoid real secrets and sensitive transcripts,
- evaluation fixtures should be anonymized or synthetic unless explicitly cleared.

## Related documents

- Architecture: [`docs/architecture.md`](./architecture.md)
- Spec roadmap: [`docs/spec-roadmap.md`](./spec-roadmap.md)
- Spec index: [`docs/specs/README.md`](./specs/README.md)
