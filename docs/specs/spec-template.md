# Spec Template

Use this template for every numbered spec in this repository.

```md
# SPEC-XXX — Title

**Status:** Proposed
**Layer:** Foundation | Memory Model | Retrieval and Packing | Codex Session Pipeline | Operations and Evaluation | Public OSS Docs
**Depends on:** [SPEC-AAA, SPEC-BBB]

## Product objective
State the user-facing or product-facing reason this spec exists.

## Architectural decision
Describe the main structural choice this spec locks in.

## Public interfaces or types affected
List the public contracts, objects, hooks, or CLI surfaces this spec defines or changes.

## Invariants and exclusions
- What must always be true
- What is explicitly out of scope

## Data flow
Describe how data enters, is transformed, and leaves this subsystem.

## Fallback behavior
Explain what happens when optional capabilities are disabled or unavailable.

## Acceptance criteria
- Use measurable outcomes
- Prefer observable behavior over vague completion claims

## Risks and open questions
- Remaining risks
- Future extensions that should not leak into this spec
```
