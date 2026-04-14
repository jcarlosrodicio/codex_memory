# Multi-agent runbook

This runbook assumes the rewritten spec tree is the source of truth.

1. Pick the next ready spec from [`docs/plans/multiagent-waves.md`](./multiagent-waves.md).
2. Create the branch listed in [`docs/plans/branch-map.md`](./branch-map.md).
3. Implement only the behavior described by that spec and its explicit dependencies.
4. Open a PR using [`docs/templates/pr-template-spec.md`](../templates/pr-template-spec.md).
5. Update spec status and any impacted roadmap docs after merge.

## Guardrails

- One implementation branch per spec.
- No implementation before dependencies are closed.
- Do not collapse multiple specs into one PR unless a wave explicitly says so.
- Public docs changes should follow the product behavior they document, not lead it.

## Suggested commands

```bash
git checkout -b feat/spec-xxx-slug
git add -A
git commit -m "SPEC-XXX: implement <short summary>"
git push -u origin feat/spec-xxx-slug
```
