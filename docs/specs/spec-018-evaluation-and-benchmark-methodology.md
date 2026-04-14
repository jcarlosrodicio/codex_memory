# SPEC-018 — Evaluation and Benchmark Methodology

**Status:** Proposed  
**Layer:** Operations and Evaluation  
**Depends on:** [SPEC-013, SPEC-015, SPEC-016, SPEC-017]

## Product objective

Define how the project will prove that it saves tokens without reducing answer quality or introducing memory contamination.

## Architectural decision

Evaluation is based on replayable session fixtures and comparative benchmarks rather than anecdotal examples.

## Public interfaces or types affected

- Replay harness inputs and outputs
- Benchmark report format
- Core metrics such as token savings, hit rate, contamination rate, contradiction rate, and user-correction rate
- Runtime metric definitions shared with inspection surfaces

## Invariants and exclusions

- Evaluation must compare memory-assisted runs against a baseline.
- Fixtures must be anonymized or synthetic unless explicitly cleared.
- Metrics must include both efficiency and correctness dimensions.
- Release metrics must be understandable both to maintainers and end users inspecting local behavior.
- Live production telemetry collection is out of scope for v1.

## Data flow

Replay fixtures feed normalized tasks into the engine. The benchmark runner records retrieved candidates, packed context, injection results, and outcome metrics for each configuration mode.

## Fallback behavior

If semantic mode is unavailable, benchmark suites must still run in lexical-only and lexical-plus-graph modes so the zero-dependency baseline remains measurable.

## Acceptance criteria

- The spec defines benchmark datasets and required metrics.
- The methodology compares at least baseline, cheap-first, and cheap-first-plus-semantic modes.
- Token savings and memory quality are both first-class outputs.
- The spec distinguishes benchmark metrics from local runtime health metrics and defines both sets.

## Risks and open questions

- Measuring “effectiveness” may require proxy metrics before user studies exist.
- Small replay sets can overfit retrieval heuristics.
- Users may misread aggressive token savings as success unless correction and contamination metrics are presented alongside them.
