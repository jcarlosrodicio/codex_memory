# SPEC-020 — Public Documentation and OSS Positioning

**Status:** Implemented  
**Layer:** Public OSS Docs  
**Depends on:** [SPEC-017, SPEC-018, SPEC-019, SPEC-025]

## Product objective

Ensure the repository explains the actual product clearly to public readers, contributors, and future users before implementation details dominate the public surface.

## Architectural decision

Documentation is treated as part of the product surface. The README and companion docs must describe the runtime that ships today: installation, activation, persistence, metrics, memory quality rules, store cleanup, safety, and current limitations.

## Public interfaces or types affected

- `README.md`
- `docs/installation.md`
- `docs/architecture.md`
- `docs/security-and-privacy.md`
- `docs/spec-roadmap.md`
- `cli/README.md`
- store maintenance documentation tied to inspection/audit workflows

## Invariants and exclusions

- Public docs describe the project as `memory engine + Codex adapter`.
- README content must be understandable without reading internal planning docs first.
- Docs must state that semantic retrieval is optional.
- Docs must present local installation as the default first-use path until marketplace publication exists.
- Docs must describe runtime activation and observable persistence as separate from simple installability.
- Docs must explain good durable memory vs noise using deterministic, reviewable rules.
- Docs must document store maintenance commands including `analyze-store`, `compact-store`, and the explicit `--apply` gate.
- Docs must explain how the hook installer avoids bare-`node` runtime failures and how to recover from visible `hook exited with code 127`.
- Docs must not promise unsupported direct installation from a Git repository URL unless Codex docs explicitly support it.
- Marketing copy unsupported by the implemented runtime or benchmarks is out of scope.

## Data flow

Architecture and spec decisions are distilled into public docs. Public readers should be able to understand:

1. how Codex hooks activate,
2. where data persists,
3. how durable memory is promoted,
4. why obviously bad memories such as `You are a helpful assistant` are rejected,
5. why review chatter like `No encontré findings nuevos...` and path-heavy review fragments are rejected,
6. how to inspect, benchmark, and compact the local store,
7. how to verify that installed hook commands no longer depend on host `PATH`.

## Implemented scope

This spec is satisfied by the current public surface:

- the README now describes the real MVP instead of a mostly-planned repository,
- installation docs cover local install, global activation, `codex_hooks = true`, and persistence verification,
- installation docs now cover the `127` troubleshooting path and explicit-node hook command verification,
- architecture docs explain the memory-quality policy and explicit store maintenance path,
- security docs explain why bad durable memory is a safety and trust problem,
- the CLI README documents analysis and compaction commands,
- the roadmap marks `SPEC-020` as implemented and clarifies what remains post-MVP.

## Acceptance criteria

- The README covers the problem statement, core ideas, current MVP status, operating modes, safety model, maintenance commands, and roadmap posture.
- Public docs define a simple install target for Codex app users and a compatible CLI story.
- Public docs explain local installation clearly and describe marketplace publication as a future distribution channel.
- Public docs explain the healthy runtime signals and metrics a maintainer should inspect.
- Public docs define a practical “good memory” policy and name concrete rejected examples such as `You are a helpful assistant` and generic scaffolding/noise.
- Public docs explain how `analyze-store` and `compact-store --apply` fit into release hygiene and benchmark trustworthiness.
- The repository can be understood by a new GitHub visitor in one pass without hidden context.

## Remaining follow-ups

- richer export/query/history workflows still belong to post-MVP operator work,
- optional semantic-mode docs can grow once that path is real,
- future contribution docs can expand once the public runtime surface stabilizes further.
