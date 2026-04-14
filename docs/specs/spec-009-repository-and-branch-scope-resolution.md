# SPEC-009 — Repository and Branch Scope Resolution

**Status:** Implemented  
**Layer:** Memory Model  
**Depends on:** [SPEC-003, SPEC-008]

## Product objective

Resolve repository and branch identity consistently so memory can be isolated by project without relying on manual tagging for every session.

## Architectural decision

Repository and branch scope are derived from runtime context, filesystem location, and VCS metadata when available, with safe fallbacks outside Git repositories.

## Public interfaces or types affected

- Repo scope resolver
- Branch or workspace qualifier
- Stable scope key format used by stores and retrieval

## Invariants and exclusions

- Scope keys must be reproducible across sessions.
- A non-Git workspace must still receive a stable local scope.
- The resolver cannot depend on remote network calls.
- Multi-repo workspace federation is out of scope for v1.

## Data flow

The adapter captures workspace context, the resolver derives a stable scope key, and the key is attached to all relevant memory artifacts and retrieval requests.

## Fallback behavior

If repository metadata is unavailable, the system falls back to a local workspace scope with reduced sharing rather than promoting memory to global scope.

## Acceptance criteria

- The spec defines how repo and branch identity are derived.
- Fallback behavior outside Git is explicit.
- The resulting scope key can be reused by stores, retrieval, and audit tooling.

## Risks and open questions

- Worktrees and nested repos may need additional normalization rules.
- Branch names alone may be too volatile unless paired with repository identity.

## Implementation notes

- Repository and branch scope resolution contract: `core/contracts/repository-branch-scope-resolution.v1.json`
- Acceptance verification tests: `core/tests/spec-009-scope-resolution-contracts.test.mjs`
