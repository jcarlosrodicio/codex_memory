import {
  asArray,
  buildScopeKey,
  normalizeText,
  tokenize
} from "../retrieval/utils.mjs";
import { SecretRedactionGate } from "./secret-redaction-gate.mjs";
import {
  dedupeBy,
  lexicalSimilarity,
  makeDeterministicId,
  nowIso,
  signatureForCandidate
} from "./utils.mjs";
import { assessMemoryQuality } from "./memory-quality-policy.mjs";

function candidateSort(a, b) {
  if (b.confidence !== a.confidence) {
    return b.confidence - a.confidence;
  }

  if (a.created_at !== b.created_at) {
    return String(a.created_at).localeCompare(String(b.created_at));
  }

  return String(a.id).localeCompare(String(b.id));
}

function findSupersededAtoms(candidate, atoms) {
  return atoms.filter((atom) => {
    if (atom.atom_type !== candidate.atom_type) {
      return false;
    }

    if (buildScopeKey(atom.scope) !== buildScopeKey(candidate.scope)) {
      return false;
    }

    if (normalizeText(atom.content) === normalizeText(candidate.content)) {
      return false;
    }

    return lexicalSimilarity(atom.content, candidate.content) >= 0.72;
  });
}

function hasNegation(text) {
  return /\b(do not|don't|not|never|no|without|cannot|can't)\b/i.test(String(text ?? ""));
}

function contradictionComparableText(text) {
  return normalizeText(text)
    .replace(/\bdo not\b/g, " ")
    .replace(/\bdon't\b/g, " ")
    .replace(/\bcannot\b/g, " ")
    .replace(/\bcan't\b/g, " ")
    .replace(/\bnever\b/g, " ")
    .replace(/\bwithout\b/g, " ")
    .replace(/\bnot\b/g, " ")
    .replace(/\bno\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findContradictAtoms(candidate, atoms) {
  const candidateNegated = hasNegation(candidate.content);
  const candidateComparable = contradictionComparableText(candidate.content);
  const candidateComparableTokenCount = tokenize(candidateComparable).length;

  return atoms.filter((atom) => {
    if (!["preference", "constraint", "decision"].includes(atom.atom_type)) {
      return false;
    }

    if (buildScopeKey(atom.scope) !== buildScopeKey(candidate.scope)) {
      return false;
    }

    const atomNegated = hasNegation(atom.content);
    if (atomNegated === candidateNegated) {
      return false;
    }

    const atomComparable = contradictionComparableText(atom.content);
    const atomComparableTokenCount = tokenize(atomComparable).length;
    if (candidateComparableTokenCount < 2 || atomComparableTokenCount < 2) {
      return false;
    }

    return lexicalSimilarity(atomComparable, candidateComparable) >= 0.72;
  });
}

function capsuleSummary(sessionRef, promotedAtoms) {
  const top = promotedAtoms.slice(0, 8).map((atom) => `${atom.atom_type}: ${atom.content}`);
  return `Session ${sessionRef} learned ${promotedAtoms.length} durable signals. ${top.join(" | ")}`;
}

export class SessionConsolidator {
  constructor(options = {}) {
    this.minPromotionConfidence = options.minPromotionConfidence ?? 0.68;
    this.redactionGate = options.redactionGate ?? new SecretRedactionGate();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  consolidate({ sessionState, memoryStore = {}, disableLearning = false }) {
    const warnings = [];
    const allCandidates = asArray(sessionState?.signal_buffer).slice().sort(candidateSort);

    if (disableLearning) {
      return {
        learning_enabled: false,
        promoted_atoms: [],
        promoted_edges: [],
        promoted_capsule: null,
        dropped: allCandidates.map((candidate) => ({
          candidate_id: candidate.id,
          reason: "learning_disabled"
        })),
        warnings
      };
    }

    const durableAtoms = asArray(memoryStore.atoms);
    const durableEdges = asArray(memoryStore.edges);
    const durableCapsules = asArray(memoryStore.capsules);

    const uniqueCandidates = dedupeBy(allCandidates, signatureForCandidate);
    const promotedAtoms = [];
    const promotedEdges = [];
    const dropped = [];

    for (const candidate of uniqueCandidates) {
      if (candidate.confidence < this.minPromotionConfidence) {
        dropped.push({
          candidate_id: candidate.id,
          reason: "low_confidence_not_promoted"
        });
        continue;
      }

      const quality = assessMemoryQuality(candidate.content, {
        atomType: candidate.atom_type
      });
      if (!quality.accepted) {
        dropped.push({
          candidate_id: candidate.id,
          reason: "rejected_by_quality_policy",
          quality_reason: quality.reason
        });
        continue;
      }

      const redaction = this.redactionGate.inspect(candidate.content, { id: candidate.id });
      if (redaction.outcome === "block") {
        dropped.push({
          candidate_id: candidate.id,
          reason: "blocked_by_redaction",
          reason_codes: redaction.reason_codes,
          audit_ref: redaction.audit_ref
        });
        continue;
      }

      const normalizedContent = normalizeText(redaction.value);
      const existingAtom = durableAtoms.find((atom) => (
        atom.atom_type === candidate.atom_type
        && buildScopeKey(atom.scope) === buildScopeKey(candidate.scope)
        && normalizeText(atom.content) === normalizedContent
      ));

      if (existingAtom) {
        existingAtom.reuse_count = Number(existingAtom.reuse_count ?? 0) + 1;
        existingAtom.updated_at = nowIso(this.now);
        dropped.push({
          candidate_id: candidate.id,
          reason: "deduplicated_existing_atom",
          durable_atom_id: existingAtom.id
        });
        continue;
      }

      const superseded = findSupersededAtoms(candidate, [...durableAtoms, ...promotedAtoms]);
      const contradicts = findContradictAtoms(candidate, [...durableAtoms, ...promotedAtoms]);

      const atomId = makeDeterministicId("atom", [candidate.scope.scope_key, candidate.atom_type, redaction.value]);
      const atom = {
        id: atomId,
        scope: candidate.scope,
        provenance: {
          producer: "SessionConsolidator",
          source_event_ids: [candidate.event_id],
          source_signal_id: candidate.id,
          promotion_phase: "session_end"
        },
        atom_type: candidate.atom_type,
        content: redaction.value,
        confidence: Number(candidate.confidence.toFixed(4)),
        created_at: nowIso(this.now),
        source_event_ids: [candidate.event_id],
        tags: dedupeBy(tokenize(candidate.content), (value) => value).slice(0, 8),
        supersedes: superseded.map((item) => item.id)
      };

      promotedAtoms.push(atom);
      durableAtoms.push(atom);

      for (const supersededAtom of superseded) {
        const edgeId = makeDeterministicId("edge", [atom.id, supersededAtom.id, "supersedes"]);
        promotedEdges.push({
          id: edgeId,
          scope: atom.scope,
          provenance: {
            producer: "SessionConsolidator",
            source_event_ids: [candidate.event_id]
          },
          edge_type: "supersedes",
          from_memory_id: atom.id,
          to_memory_id: supersededAtom.id,
          confidence: atom.confidence,
          created_at: nowIso(this.now)
        });
      }

      for (const contradictedAtom of contradicts) {
        const edgeId = makeDeterministicId("edge", [atom.id, contradictedAtom.id, "contradicts"]);
        promotedEdges.push({
          id: edgeId,
          scope: atom.scope,
          provenance: {
            producer: "SessionConsolidator",
            source_event_ids: [candidate.event_id]
          },
          edge_type: "contradicts",
          from_memory_id: atom.id,
          to_memory_id: contradictedAtom.id,
          confidence: Number(Math.min(atom.confidence, contradictedAtom.confidence ?? atom.confidence).toFixed(4)),
          created_at: nowIso(this.now)
        });
      }
    }

    durableEdges.push(...promotedEdges);

    let promotedCapsule = null;
    if (promotedAtoms.length > 0) {
      const scope = promotedAtoms[0].scope;
      const summary = capsuleSummary(sessionState.session_ref, promotedAtoms);
      const redaction = this.redactionGate.inspect(summary, {
        id: `capsule-${sessionState.session_ref}`
      });

      if (redaction.outcome !== "block") {
        promotedCapsule = {
          id: makeDeterministicId("capsule", [sessionState.session_ref, promotedAtoms.map((atom) => atom.id).join(",")]),
          scope,
          provenance: {
            producer: "SessionConsolidator",
            source_event_ids: dedupeBy(promotedAtoms.flatMap((atom) => atom.source_event_ids ?? []), (id) => id),
            consolidation_phase: "session_end"
          },
          summary: redaction.value,
          source_memory_ids: promotedAtoms.map((atom) => atom.id),
          confidence: Number((promotedAtoms.reduce((sum, atom) => sum + atom.confidence, 0) / promotedAtoms.length).toFixed(4)),
          created_at: nowIso(this.now),
          compression_method: "deterministic_session_summary"
        };

        durableCapsules.push(promotedCapsule);
      } else {
        warnings.push("session_capsule_blocked_by_redaction");
      }
    }

    return {
      learning_enabled: true,
      promoted_atoms: promotedAtoms,
      promoted_edges: promotedEdges,
      promoted_capsule: promotedCapsule,
      dropped,
      warnings
    };
  }
}
