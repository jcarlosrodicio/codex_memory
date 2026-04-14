# Multi-agent runbook

This runbook assumes the rewritten spec tree is the source of truth.

1. Pick the next ready spec from [`docs/plans/multiagent-waves.md`](./multiagent-waves.md).
2. Create the branch listed in [`docs/plans/branch-map.md`](./branch-map.md).
3. Implement only the behavior described by that spec and its explicit dependencies.
4. Capture the milestone proof required by the current stage before opening the PR.
5. Open a PR using [`docs/templates/pr-template-spec.md`](../templates/pr-template-spec.md).
6. Update spec status and any impacted roadmap docs after merge.

## Guardrails

- One implementation branch per spec.
- No implementation before dependencies are closed.
- Do not collapse multiple specs into one PR unless a wave explicitly says so.
- Public docs changes should follow the product behavior they document, not lead it.
- `SPEC-001` to `SPEC-004` are treated as frozen during the current implementation-plan improvement cycle.
- Golden-path replay evidence should start appearing no later than the Codex session pipeline stage.
- Meaningful manual local validation of live Codex sessions should not be claimed before `SPEC-025` is closed.

## Required PR evidence

- Installability proof when the milestone includes setup or enablement behavior.
- End-to-end proof when the milestone creates new memory flow.
- Metrics proof once `ContextPack` exists.
- Safety proof when runtime controls, persistence, or release gates are involved.

## Completion language

- **Done for spec**: the spec's acceptance criteria are satisfied.
- **Done for milestone**: the local milestone demo proof is attached and reproducible.
- **Done for release**: release evidence required by `SPEC-019` is complete.

## Suggested commands

```bash
git checkout -b feat/spec-xxx-slug
git add -A
git commit -m "SPEC-XXX: implement <short summary>"
git push -u origin feat/spec-xxx-slug
```
