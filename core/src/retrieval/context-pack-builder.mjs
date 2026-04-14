import { DEFAULT_PACK_POLICY } from "./constants.mjs";
import { clampScore, estimateTokens } from "./utils.mjs";

function allocationBudget(hardBudget, allocation) {
  const entries = Object.entries(allocation);
  const sectionBudget = {};
  let consumed = 0;

  for (let index = 0; index < entries.length; index += 1) {
    const [section, ratio] = entries[index];
    const remainingSections = entries.length - index;
    const remainingBudget = hardBudget - consumed;

    const budget = index === entries.length - 1
      ? remainingBudget
      : Math.max(0, Math.floor(hardBudget * ratio));

    sectionBudget[section] = Math.max(0, Math.min(remainingBudget, budget));
    consumed += sectionBudget[section];

    if (remainingSections === 1 && consumed < hardBudget) {
      sectionBudget[section] += hardBudget - consumed;
    }
  }

  return sectionBudget;
}

function sectionForCandidate(candidate) {
  if (candidate.memory_type === "capsule") {
    return "capsules";
  }

  if (["constraint", "preference", "workflow"].includes(candidate.atom_type)) {
    return "rules";
  }

  if (candidate.atom_type === "open_loop") {
    return "open_loops";
  }

  return "knowledge";
}

function trimToTokens(text, targetTokens) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (words.length <= targetTokens) {
    return text;
  }

  return `${words.slice(0, targetTokens).join(" ")} ...`;
}

function createPackId(nowIso) {
  const compact = nowIso.replace(/[-:.TZ]/g, "").slice(0, 14);
  return `pack_${compact}`;
}

export class ContextPackBuilder {
  constructor(options = {}) {
    this.policy = {
      ...DEFAULT_PACK_POLICY,
      ...options,
      section_allocation: {
        ...DEFAULT_PACK_POLICY.section_allocation,
        ...(options.section_allocation ?? {})
      }
    };
    this.now = options.now ?? (() => new Date().toISOString());
  }

  build({
    candidates = [],
    scope,
    tokenBudget,
    semanticMode,
    memoryEnabled = true,
    retrievedCount,
    retrievalDrops = []
  }) {
    const nowIso = this.now();
    const hardBudget = Number.isInteger(tokenBudget) && tokenBudget >= 0
      ? tokenBudget
      : this.policy.hard_token_budget;

    const sectionBudget = allocationBudget(hardBudget, this.policy.section_allocation);
    const sectionUsed = Object.fromEntries(Object.keys(sectionBudget).map((section) => [section, 0]));

    const sortedCandidates = [...candidates].sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return String(a.memory_id).localeCompare(String(b.memory_id));
    });

    const packItems = [];
    const trimActions = [];
    const droppedByPacking = [];

    let usedTokens = 0;

    for (const candidate of sortedCandidates) {
      const section = sectionForCandidate(candidate);
      const sectionLimit = sectionBudget[section] ?? 0;
      const sectionRemaining = Math.max(0, sectionLimit - (sectionUsed[section] ?? 0));
      const totalRemaining = Math.max(0, hardBudget - usedTokens);
      const availableTokens = Math.min(sectionRemaining, totalRemaining);
      const content = String(candidate.content ?? "");
      const originalTokens = Number(candidate.token_estimate ?? estimateTokens(content));

      if (availableTokens <= 0) {
        droppedByPacking.push({
          memory_id: candidate.memory_id,
          reason: "section_budget_exhausted",
          section,
          stage: "pack"
        });
        continue;
      }

      if (originalTokens <= availableTokens) {
        packItems.push({
          memory_id: candidate.memory_id,
          memory_type: candidate.memory_type,
          atom_type: candidate.atom_type ?? null,
          section,
          content,
          token_estimate: originalTokens,
          score: clampScore(candidate.score),
          provenance: {
            ...(candidate.provenance ?? {}),
            why_included: [
              ...new Set([...(candidate.provenance?.why_included ?? []), "within_budget"])
            ]
          }
        });

        sectionUsed[section] = (sectionUsed[section] ?? 0) + originalTokens;
        usedTokens += originalTokens;
        continue;
      }

      if (availableTokens < this.policy.min_tokens_after_trim) {
        droppedByPacking.push({
          memory_id: candidate.memory_id,
          reason: "insufficient_room_after_trim",
          section,
          stage: "pack"
        });
        continue;
      }

      const trimmedContent = trimToTokens(content, availableTokens);
      const trimmedTokens = estimateTokens(trimmedContent);

      if (trimmedTokens < this.policy.min_tokens_after_trim) {
        droppedByPacking.push({
          memory_id: candidate.memory_id,
          reason: "trimmed_below_minimum",
          section,
          stage: "pack"
        });
        continue;
      }

      trimActions.push({
        memory_id: candidate.memory_id,
        section,
        original_tokens: originalTokens,
        trimmed_tokens: trimmedTokens,
        reason: "hard_budget_trim"
      });

      packItems.push({
        memory_id: candidate.memory_id,
        memory_type: candidate.memory_type,
        atom_type: candidate.atom_type ?? null,
        section,
        content: trimmedContent,
        token_estimate: trimmedTokens,
        score: clampScore(candidate.score),
        provenance: {
          ...(candidate.provenance ?? {}),
          why_included: [
            ...new Set([...(candidate.provenance?.why_included ?? []), "trimmed_to_fit_budget"])
          ]
        }
      });

      sectionUsed[section] = (sectionUsed[section] ?? 0) + trimmedTokens;
      usedTokens += trimmedTokens;
    }

    const retrievalDropReasons = retrievalDrops.map((drop) => ({
      ...drop,
      stage: drop.stage ?? "retrieval"
    }));
    const dropReasons = [...retrievalDropReasons, ...droppedByPacking];

    const totalCandidateTokens = sortedCandidates.reduce(
      (sum, candidate) => sum + Number(candidate.token_estimate ?? estimateTokens(candidate.content ?? "")),
      0
    );

    const metrics = {
      pack_tokens: usedTokens,
      retrieved_count: retrievedCount ?? sortedCandidates.length,
      dropped_count: dropReasons.length,
      token_savings_estimate: Math.max(0, totalCandidateTokens - usedTokens),
      memory_enabled: Boolean(memoryEnabled),
      semantic_mode: semanticMode ?? "off"
    };

    return {
      id: createPackId(nowIso),
      scope,
      provenance: {
        producer: "ContextPackBuilder",
        policy_version: this.policy.context_pack_schema_version,
        generated_at: nowIso
      },
      context_pack_schema_version: this.policy.context_pack_schema_version,
      pack_items: packItems,
      token_budget: {
        hard_limit: hardBudget,
        used: usedTokens,
        remaining: Math.max(0, hardBudget - usedTokens),
        section_allocation: sectionBudget,
        section_used: sectionUsed
      },
      token_estimate: usedTokens,
      created_at: nowIso,
      trim_actions: trimActions,
      drop_reasons: dropReasons,
      decision_summary: {
        included_count: packItems.length,
        trimmed_count: trimActions.length,
        dropped_count: dropReasons.length,
        metrics
      },
      metrics
    };
  }
}
