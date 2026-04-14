# SPEC-020 — Public Documentation and OSS Positioning

**Status:** Proposed  
**Layer:** Public OSS Docs  
**Depends on:** [SPEC-017, SPEC-018, SPEC-019]

## Product objective

Ensure the repository explains the product clearly to public readers, contributors, and future users before implementation details begin to dominate the project.

## Architectural decision

Documentation is treated as part of the product surface. The README and companion docs must explain the problem, architecture, safety model, operating modes, and contribution flow in public-facing language.

## Public interfaces or types affected

- `README.md`
- `docs/architecture.md`
- `docs/security-and-privacy.md`
- `docs/spec-roadmap.md`
- future contributing and quickstart guides

## Invariants and exclusions

- Public docs must describe the project as `memory engine + Codex adapter`.
- README content must be understandable without reading internal planning docs first.
- Documentation must state that semantic retrieval is optional.
- Marketing copy unsupported by specs or benchmarks is out of scope.

## Data flow

Architecture and spec decisions are distilled into public docs. Those docs point readers toward the spec index, roadmap, and safety model without requiring prior context from private design discussions.

## Fallback behavior

If implementation lags behind docs, the docs must clearly label roadmap items as planned rather than shipped.

## Acceptance criteria

- The README covers problem statement, core ideas, modes of operation, safety, and roadmap.
- Public docs link to the spec tree and stay consistent with it.
- The repository can be understood by a new GitHub visitor in a single reading pass.

## Risks and open questions

- Public docs can drift quickly unless they are tied to spec changes.
- The eventual quickstart will depend on runtime choices that are not finalized yet.
