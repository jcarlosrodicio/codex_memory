# SPEC-004 — Config Schema, Defaults, and Feature Modes

**Status:** Proposed  
**Layer:** Foundation  
**Depends on:** [SPEC-001, SPEC-002]

## Product objective

Provide a deterministic configuration model that makes the engine portable, explicit, and safe to operate across different repositories and user environments.

## Architectural decision

Configuration is layered and versioned, with explicit feature modes for optional capabilities instead of implicit auto-detection.

## Public interfaces or types affected

- Global config
- Repo-local overrides
- Session overrides
- Feature mode flags such as `semantic.mode = off|light|custom`
- Budget and persistence policies
- Install profiles such as `default`, `power-user`, and `advanced-semantic`

## Invariants and exclusions

- Unknown keys must fail validation.
- Precedence must be deterministic: session override > repo override > user default.
- Feature toggles must expose safe defaults.
- Default installation must map to a single safe config profile with semantic retrieval disabled.
- Dynamic remote config loading is out of scope.

## Data flow

Config is loaded from layered sources, validated against a versioned schema, merged in precedence order, and passed into the core and adapter as immutable runtime settings.

## Fallback behavior

If an optional feature is misconfigured or unavailable, the engine must fall back to the corresponding safe mode instead of silently enabling an alternative backend.

## Acceptance criteria

- The config model defines feature modes for persistence, learning, semantic retrieval, and prompt injection.
- Precedence order is documented and reused consistently in later specs.
- The schema includes versioning guidance for future migrations.
- A default install profile can be documented in less than one quickstart page.

## Risks and open questions

- Too many early config knobs could obscure the default path.
- Some runtime-specific toggles may belong in the Codex adapter rather than the core schema.
