# SPEC-008 — Memory Scoping and Conflict Rules

**Status:** Implemented  
**Layer:** Memory Model  
**Depends on:** [SPEC-005, SPEC-006]

## Product objective

Prevent the engine from mixing unrelated memory while still allowing high-value durable context to survive across sessions.

## Architectural decision

Memory is explicitly scoped and ordered by precedence:

- global user memory,
- repository memory,
- branch or workspace refinements where applicable,
- session-local working memory.

## Public interfaces or types affected

- Scope identifiers
- Precedence model for retrieval and injection
- Conflict markers such as `contradicts` and `supersedes`

## Invariants and exclusions

- Session memory cannot silently override durable repo memory without provenance.
- Global preferences cannot erase repo-local constraints.
- Contradictory atoms must be marked and resolved during retrieval.
- Cross-user shared memory is out of scope.

## Data flow

Every memory object is assigned a scope. Retrieval first filters and ranks within scope, then resolves precedence and conflict rules before handing candidates to pack construction.

## Fallback behavior

If scope resolution is incomplete, the engine must fall back to the narrowest safe scope instead of broadening to global memory.

## Acceptance criteria

- Scope precedence is defined in one place and reused by retrieval and packing specs.
- The spec explains how superseded or contradictory memory is handled.
- Cross-repository contamination is explicitly prevented by default.

## Risks and open questions

- Branch-level scoping may be too fine-grained for some repos and too coarse for others.
- Some long-lived user workflows may need more flexible “applies to” rules later.
