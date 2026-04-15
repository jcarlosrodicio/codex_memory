import { RetrievalEngine } from "../retrieval/retrieval-engine.mjs";
import { asArray, buildScopeKey } from "../retrieval/utils.mjs";
import { SessionEventNormalizer } from "./event-normalizer.mjs";
import { SessionSignalExtractor } from "./signal-extractor.mjs";
import { SessionConsolidator } from "./session-consolidator.mjs";

function withBoundedBuffer(existing, incoming, maxItems) {
  const merged = [...asArray(existing), ...asArray(incoming)];
  if (merged.length <= maxItems) {
    return {
      values: merged,
      dropped: 0
    };
  }

  const dropped = merged.length - maxItems;
  return {
    values: merged.slice(dropped),
    dropped
  };
}

function serializeContextPack(contextPack) {
  const lines = [
    "[CODEX_MEMORY_CONTEXT v1]",
    `pack_id=${contextPack.id}`,
    `scope=${buildScopeKey(contextPack.scope)}`,
    `token_estimate=${contextPack.token_estimate}`
  ];

  for (const item of contextPack.pack_items) {
    lines.push(`- [${item.section}] (${item.memory_type}:${item.atom_type ?? "n/a"}) ${item.content}`);
  }

  lines.push("[/CODEX_MEMORY_CONTEXT]");
  return lines.join("\n");
}

function mergeReasonCounts(target, incoming = {}) {
  for (const [reason, count] of Object.entries(incoming)) {
    target[reason] = Number(target[reason] ?? 0) + Number(count ?? 0);
  }
}

export class SessionPipelineCore {
  constructor(options = {}) {
    this.retrievalEngine = options.retrievalEngine ?? new RetrievalEngine(options.retrieval_options);
    this.eventNormalizer = options.eventNormalizer ?? new SessionEventNormalizer(options.event_options);
    this.signalExtractor = options.signalExtractor ?? new SessionSignalExtractor(options.signal_options);
    this.consolidator = options.consolidator ?? new SessionConsolidator(options.consolidation_options);
    this.maxEventBuffer = options.maxEventBuffer ?? 200;
    this.maxSignalBuffer = options.maxSignalBuffer ?? 80;
  }

  initSession(startEvent) {
    const memoryEvent = this.eventNormalizer.normalize(startEvent);

    const state = {
      session_ref: startEvent.session_ref,
      scope: memoryEvent.scope,
      controls: {
        disable_injection: Boolean(startEvent.session_controls?.disable_injection),
        disable_learning: Boolean(startEvent.session_controls?.disable_learning)
      },
      event_buffer: [memoryEvent],
      signal_buffer: [],
      warnings: [],
      learning_stats: {
        signals_seen: 0,
        signals_promoted_to_buffer: 0,
        signals_rejected_by_quality_policy: 0,
        dropped_by_reason: {}
      }
    };

    return {
      state,
      memory_event: memoryEvent
    };
  }

  capture(state, adapterEvent) {
    const memoryEvent = this.eventNormalizer.normalize({
      ...adapterEvent,
      scope: adapterEvent.scope ?? state.scope
    });

    const extraction = this.signalExtractor.extractDetailed(memoryEvent);
    const extractedSignals = extraction.signals;

    const nextEventBuffer = withBoundedBuffer(state.event_buffer, [memoryEvent], this.maxEventBuffer);
    const nextSignalBuffer = withBoundedBuffer(state.signal_buffer, extractedSignals, this.maxSignalBuffer);

    state.event_buffer = nextEventBuffer.values;
    state.signal_buffer = nextSignalBuffer.values;

    if (nextEventBuffer.dropped > 0) {
      state.warnings.push(`event_buffer_trimmed:${nextEventBuffer.dropped}`);
    }

    if (nextSignalBuffer.dropped > 0) {
      state.warnings.push(`signal_buffer_trimmed:${nextSignalBuffer.dropped}`);
    }

    state.learning_stats.signals_seen += Number(extraction.stats.candidate_count ?? 0);
    state.learning_stats.signals_promoted_to_buffer += extractedSignals.length;
    state.learning_stats.signals_rejected_by_quality_policy += Number(
      Object.entries(extraction.stats.dropped_by_reason ?? {})
        .filter(([reason]) => !["no_signal_match", "low_signal_confidence"].includes(reason))
        .reduce((sum, [, count]) => sum + Number(count ?? 0), 0)
    );
    mergeReasonCounts(state.learning_stats.dropped_by_reason, extraction.stats.dropped_by_reason);

    return {
      memory_event: memoryEvent,
      extracted_signals: extractedSignals,
      extraction_stats: extraction.stats,
      state
    };
  }

  async buildInjection({
    state,
    taskContext,
    budget,
    memoryStore,
    disableInjection = false,
    memoryEnabled = true
  }) {
    if (disableInjection || !memoryEnabled) {
      return {
        inject_context: false,
        context_pack: null,
        serialized_block: null,
        decision_summary: {
          reason: disableInjection ? "injection_disabled_by_session_control" : "memory_disabled",
          audit_ref: null
        }
      };
    }

    const retrieval = await this.retrievalEngine.retrieve(taskContext, {
      scope: state.scope,
      budget,
      memoryStore,
      memoryEnabled
    });

    const contextPack = retrieval.context_pack;
    const serializedBlock = serializeContextPack(contextPack);

    return {
      inject_context: contextPack.pack_items.length > 0,
      context_pack: contextPack,
      serialized_block: serializedBlock,
      decision_summary: {
        reason: contextPack.pack_items.length > 0 ? "context_pack_injected" : "empty_pack",
        audit_ref: contextPack.id
      },
      metrics: retrieval.metrics,
      telemetry: retrieval.telemetry
    };
  }

  consolidateSession({ state, memoryStore, disableLearning = false }) {
    return this.consolidator.consolidate({
      sessionState: state,
      memoryStore,
      disableLearning
    });
  }
}
