# Branch map by spec — codex-memory

Updated: 2026-04-14

Rule: one branch per implementation spec, using the format `feat/spec-xxx-<slug>`.

spec_id | branch | depends_on
---|---|---
SPEC-001 | `feat/spec-001-product-vision-and-non-goals` | -
SPEC-002 | `feat/spec-002-engine-architecture-and-package-boundaries` | SPEC-001
SPEC-003 | `feat/spec-003-codex-adapter-and-hook-contracts` | SPEC-001, SPEC-002
SPEC-004 | `feat/spec-004-config-schema-defaults-and-feature-modes` | SPEC-001, SPEC-002
SPEC-005 | `feat/spec-005-canonical-memory-data-model` | SPEC-001, SPEC-002
SPEC-006 | `feat/spec-006-memory-store-indexes-and-schema-versioning` | SPEC-004, SPEC-005
SPEC-007 | `feat/spec-007-secret-redaction-and-safe-persistence` | SPEC-005, SPEC-006
SPEC-008 | `feat/spec-008-memory-scoping-and-conflict-rules` | SPEC-005, SPEC-006
SPEC-009 | `feat/spec-009-repository-and-branch-scope-resolution` | SPEC-003, SPEC-008
SPEC-010 | `feat/spec-010-lexical-retrieval-engine` | SPEC-006, SPEC-008, SPEC-009
SPEC-011 | `feat/spec-011-graph-memory-and-expansion-policy` | SPEC-005, SPEC-008, SPEC-010
SPEC-012 | `feat/spec-012-semantic-backend-interface` | SPEC-002, SPEC-005, SPEC-010
SPEC-013 | `feat/spec-013-token-budgeting-and-context-pack-builder` | SPEC-010, SPEC-011, SPEC-012
SPEC-014 | `feat/spec-014-capture-and-signal-extraction-pipeline` | SPEC-003, SPEC-005, SPEC-007
SPEC-015 | `feat/spec-015-prompt-injection-and-session-controls` | SPEC-003, SPEC-013, SPEC-014
SPEC-016 | `feat/spec-016-session-consolidation-and-learning-promotion` | SPEC-005, SPEC-006, SPEC-007, SPEC-014
SPEC-017 | `feat/spec-017-explainability-audit-trail-and-inspection-cli` | SPEC-013, SPEC-015, SPEC-016
SPEC-018 | `feat/spec-018-evaluation-and-benchmark-methodology` | SPEC-013, SPEC-015, SPEC-016, SPEC-017
SPEC-019 | `feat/spec-019-quality-gates-and-release-readiness` | SPEC-007, SPEC-017, SPEC-018
SPEC-020 | `feat/spec-020-public-documentation-and-oss-positioning` | SPEC-017, SPEC-018, SPEC-019
SPEC-021 | `feat/spec-021-hook-runtime-controls-and-safe-degradation` | SPEC-003, SPEC-015, SPEC-016, SPEC-017
SPEC-022 | `feat/spec-022-selective-install-and-installation-state` | SPEC-020
SPEC-023 | `feat/spec-023-session-state-query-export-compact-and-metrics-cli` | SPEC-017, SPEC-018
SPEC-024 | `feat/spec-024-memory-safety-audit` | SPEC-007, SPEC-017, SPEC-019
