import { clampScore, normalizeText } from "../retrieval/utils.mjs";
import {
  confidenceFromSignals,
  makeDeterministicId,
  safeString
} from "./utils.mjs";
import { assessMemoryQuality } from "./memory-quality-policy.mjs";

const SIGNAL_RULES = Object.freeze([
  {
    atom_type: "preference",
    keywords: ["prefer", "please", "always", "never", "i like", "i want"]
  },
  {
    atom_type: "workflow",
    keywords: ["run", "execute", "command", "step", "workflow", "pipeline"]
  },
  {
    atom_type: "decision",
    keywords: ["decide", "decision", "we will", "choose", "selected"]
  },
  {
    atom_type: "constraint",
    keywords: ["must", "cannot", "can't", "without", "do not", "don't"]
  },
  {
    atom_type: "bugfix",
    keywords: ["fix", "bug", "error", "failing", "regression"]
  },
  {
    atom_type: "open_loop",
    keywords: ["todo", "follow up", "pending", "next step", "question"]
  },
  {
    atom_type: "fact",
    keywords: ["is", "are", "uses", "supports", "version", "default"]
  }
]);

function splitSignalSentences(text) {
  return String(text)
    .split(/\n|[.!?](?:\s+|$)/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 12)
    .slice(0, 18);
}

function matchSignalType(text) {
  const normalized = normalizeText(text);

  for (const rule of SIGNAL_RULES) {
    const matchedKeywords = rule.keywords.filter((keyword) => normalized.includes(keyword));
    if (matchedKeywords.length > 0) {
      return {
        atom_type: rule.atom_type,
        matched_keywords: matchedKeywords
      };
    }
  }

  return null;
}

function confidenceScore({
  sentence,
  matchedKeywords,
  sourceEventType
}) {
  const keywordBoost = Math.min(0.35, matchedKeywords.length * 0.08);
  const sourceBoost = sourceEventType === "AFTER_RESPONSE" ? 0.12 : 0.08;
  const lengthBoost = sentence.length >= 24 ? 0.1 : 0;

  return clampScore(confidenceFromSignals([0.38, keywordBoost, sourceBoost, lengthBoost]));
}

export class SessionSignalExtractor {
  constructor(options = {}) {
    this.maxSignalsPerEvent = options.maxSignalsPerEvent ?? 5;
    this.minConfidence = options.minConfidence ?? 0.42;
  }

  extract(memoryEvent) {
    return this.extractDetailed(memoryEvent).signals;
  }

  extractDetailed(memoryEvent) {
    const sourceText = safeString(
      memoryEvent.payload?.prompt_excerpt
      ?? memoryEvent.payload?.response_excerpt
      ?? ""
    );

    if (!sourceText) {
      return {
        signals: [],
        dropped: [],
        stats: {
          candidate_count: 0,
          accepted_count: 0,
          dropped_by_reason: {}
        }
      };
    }

    const sentenceCandidates = splitSignalSentences(sourceText);
    const signals = [];
    const dropped = [];
    const droppedByReason = {};

    const recordDrop = (sentence, reason) => {
      dropped.push({ sentence, reason });
      droppedByReason[reason] = Number(droppedByReason[reason] ?? 0) + 1;
    };

    for (const sentence of sentenceCandidates) {
      const match = matchSignalType(sentence);
      if (!match) {
        recordDrop(sentence, "no_signal_match");
        continue;
      }

      const confidence = confidenceScore({
        sentence,
        matchedKeywords: match.matched_keywords,
        sourceEventType: memoryEvent.event_type
      });

      if (confidence < this.minConfidence) {
        recordDrop(sentence, "low_signal_confidence");
        continue;
      }

      const quality = assessMemoryQuality(sentence, {
        atomType: match.atom_type
      });
      if (!quality.accepted) {
        recordDrop(sentence, quality.reason);
        continue;
      }

      signals.push({
        id: makeDeterministicId("sig", [memoryEvent.id, match.atom_type, sentence]),
        event_id: memoryEvent.id,
        atom_type: match.atom_type,
        signal_type: match.atom_type,
        content: quality.normalized_content ?? sentence,
        scope: memoryEvent.scope,
        confidence,
        created_at: memoryEvent.occurred_at,
        provenance: {
          producer: "SessionSignalExtractor",
          source_event_type: memoryEvent.event_type,
          source_event_id: memoryEvent.id,
          matched_keywords: match.matched_keywords,
          normalization_reason: quality.normalization_reason ?? null
        }
      });

      if (signals.length >= this.maxSignalsPerEvent) {
        break;
      }
    }

    return {
      signals,
      dropped,
      stats: {
        candidate_count: sentenceCandidates.length,
        accepted_count: signals.length,
        dropped_by_reason: droppedByReason
      }
    };
  }
}
