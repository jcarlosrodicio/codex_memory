import { readFileSync } from "node:fs";
import { CodexMemoryAdapter } from "../../adapters/codex/src/index.mjs";

function estimateTokens(text) {
  const normalized = String(text ?? "").trim();
  if (!normalized) {
    return 0;
  }

  return normalized.split(/\s+/).length;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildSeedStore(scope) {
  return {
    events: [],
    atoms: [
      {
        id: "seed-workflow-1",
        scope,
        provenance: { producer: "benchmark-seed" },
        atom_type: "workflow",
        content: "always run node --test before finalize",
        confidence: 0.9,
        created_at: "2026-04-10T00:00:00.000Z"
      }
    ],
    edges: [],
    capsules: []
  };
}

async function runMode({ fixture, mode }) {
  const scope = {
    level: "branch_or_workspace",
    repository_id: fixture.session_start.workspace.repository,
    branch_or_workspace_id: fixture.session_start.workspace.branch,
    scope_key: `repo::${fixture.session_start.workspace.repository}::branch_or_workspace::${fixture.session_start.workspace.branch}`
  };

  const semanticMode = mode === "cheap-first-plus-semantic" ? "light" : "off";

  const memoryStore = buildSeedStore(scope);
  const adapter = new CodexMemoryAdapter({
    memoryStore,
    pipeline_options: {
      retrieval_options: {
        semanticMode,
        lexical_options: {
          now: () => "2026-04-14T10:00:00.000Z"
        },
        pack_options: {
          hard_token_budget: fixture.before_prompt?.budget_hint?.max_tokens_for_memory ?? 80,
          now: () => "2026-04-14T10:00:00.000Z"
        }
      },
      event_options: {
        now: () => "2026-04-14T10:00:00.000Z"
      },
      consolidation_options: {
        now: () => "2026-04-14T10:05:00.000Z"
      }
    }
  });

  const startPayload = clone(fixture.session_start);
  const beforePayload = clone(fixture.before_prompt);
  const afterPayload = clone(fixture.after_response);
  const endPayload = clone(fixture.session_end);

  if (mode === "baseline") {
    startPayload.controls.disable_injection = true;
    startPayload.controls.disable_learning = true;
    beforePayload.user_visible_controls.disable_injection = true;
    beforePayload.user_visible_controls.disable_learning = true;
    afterPayload.controls.disable_learning = true;
  }

  adapter.onSessionStart(startPayload);
  const before = await adapter.onBeforePrompt(beforePayload);
  adapter.onAfterResponse(afterPayload);
  const end = adapter.onSessionEnd(endPayload);

  const baselinePromptTokens = estimateTokens(beforePayload.prompt_text);
  const packMetrics = before.injection_metadata?.pack_metrics ?? {
    pack_tokens: Number(before.context_pack?.token_estimate ?? 0),
    retrieved_count: Number(before.context_pack_audit?.included?.length ?? 0),
    dropped_count: Number(before.context_pack_audit?.dropped?.length ?? 0),
    token_savings_estimate: 0,
    memory_enabled: mode !== "baseline",
    semantic_mode: semanticMode
  };

  const contradictionEdges = (end.consolidation?.promoted_edges ?? []).filter((edge) => edge.edge_type === "contradicts");
  const promotedAtoms = end.consolidation?.promoted_atoms ?? [];

  const contaminationCount = (before.context_pack_audit?.included ?? []).filter((item) => {
    const atom = memoryStore.atoms.find((candidate) => candidate.id === item.memory_id);
    if (!atom) {
      return false;
    }

    return atom.scope?.repository_id !== scope.repository_id;
  }).length;

  const includedCount = before.context_pack_audit?.included?.length ?? 0;

  return {
    mode,
    semantic_mode: semanticMode,
    metrics: {
      baseline_prompt_tokens: baselinePromptTokens,
      pack_tokens: Number(packMetrics.pack_tokens ?? 0),
      retrieved_count: Number(packMetrics.retrieved_count ?? 0),
      dropped_count: Number(packMetrics.dropped_count ?? 0),
      token_savings_estimate: Number(packMetrics.token_savings_estimate ?? 0),
      scope_contamination_rate: includedCount === 0 ? 0 : contaminationCount / includedCount,
      contradiction_injection_rate: promotedAtoms.length === 0 ? 0 : contradictionEdges.length / promotedAtoms.length,
      user_correction_rate: 0
    }
  };
}

export async function runBenchmark({ fixturePath }) {
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const modes = [
    "baseline",
    "cheap-first",
    "cheap-first-plus-semantic"
  ];

  const reports = [];
  for (const mode of modes) {
    reports.push(await runMode({ fixture, mode }));
  }

  return {
    spec_id: "SPEC-018",
    benchmark_schema_version: "1",
    generated_at: new Date().toISOString(),
    fixture_path: fixturePath,
    zero_dependency_success: reports.some((item) => item.mode === "cheap-first" && item.semantic_mode === "off"),
    modes: reports
  };
}
