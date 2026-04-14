import {
  LocalMemoryStore,
  SessionPipelineCore
} from "../../../core/src/index.mjs";

function promptExcerpt(text) {
  const value = String(text ?? "").trim();
  if (value.length <= 420) {
    return value;
  }

  return `${value.slice(0, 417)}...`;
}

function baseScopeHintsFromPayload(payload) {
  return {
    repo: payload.workspace?.repository ?? null,
    branch: payload.workspace?.branch ?? null
  };
}

function extractSessionControls(payload, fromBeforePrompt = false) {
  const controls = fromBeforePrompt
    ? payload.user_visible_controls
    : payload.controls;

  return {
    disable_injection: Boolean(controls?.disable_injection),
    disable_learning: Boolean(controls?.disable_learning)
  };
}

export class CodexMemoryAdapter {
  constructor(options = {}) {
    this.pipeline = options.pipeline ?? new SessionPipelineCore(options.pipeline_options);
    this.runtimeWarnings = [];

    const shouldAutoEnablePersistence = (
      options.enablePersistence !== false
      && (options.forcePersistence === true || !options.memoryStore)
    );

    this.persistence = options.persistence
      ?? (shouldAutoEnablePersistence
        ? new LocalMemoryStore(options.persistence_options ?? {
          rootDir: options.storePath
        })
        : null);

    this.memoryStore = options.memoryStore ?? this._loadInitialMemoryStore() ?? {
      events: [],
      atoms: [],
      edges: [],
      capsules: []
    };
    this.sessions = new Map();
  }

  onSessionStart(payload) {
    const persistenceWarnings = [];
    const normalizedEvent = {
      event_type: "SESSION_STARTED",
      session_ref: payload.session_id,
      occurred_at: payload.started_at,
      scope_hints: baseScopeHintsFromPayload(payload),
      session_controls: extractSessionControls(payload)
    };

    const { state, memory_event } = this.pipeline.initSession(normalizedEvent);
    this.sessions.set(payload.session_id, state);
    this._persistEvent(memory_event, persistenceWarnings);

    return {
      status: "ok",
      capabilities: ["capture", "retrieval", "learning", "audit"],
      warnings: [...this.runtimeWarnings, ...state.warnings, ...persistenceWarnings],
      normalized_event_id: memory_event.id,
      scope: state.scope,
      local_store_path: this.persistence?.getRootDir?.() ?? null
    };
  }

  async onBeforePrompt(payload) {
    const state = this.sessions.get(payload.session_id);
    if (!state) {
      return {
        inject_context: false,
        context_pack: null,
        decision_summary: {
          reason: "session_not_started",
          audit_ref: null
        }
      };
    }

    const sessionControls = {
      ...state.controls,
      ...extractSessionControls(payload, true)
    };
    state.controls = sessionControls;
    const persistenceWarnings = [];

    const capture = this.pipeline.capture(state, {
      event_type: "BEFORE_PROMPT",
      session_ref: payload.session_id,
      occurred_at: payload.occurred_at,
      prompt_ref: payload.prompt_id,
      prompt_excerpt: promptExcerpt(payload.prompt_text),
      scope: state.scope,
      budget_hint: payload.budget_hint,
      session_controls: sessionControls
    });
    this._persistEvent(capture.memory_event, persistenceWarnings);

    try {
      const injection = await this.pipeline.buildInjection({
        state,
        taskContext: {
          text: payload.prompt_text
        },
        budget: payload.budget_hint?.max_tokens_for_memory ?? null,
        memoryStore: this.memoryStore,
        disableInjection: sessionControls.disable_injection,
        memoryEnabled: true
      });

      if (!injection.inject_context || !injection.context_pack) {
        return {
          inject_context: false,
          context_pack: null,
          decision_summary: injection.decision_summary,
          injection_metadata: {
            disabled_by_control: sessionControls.disable_injection,
            token_estimate: 0,
            pack_item_count: 0,
            persistence_warnings: persistenceWarnings
          }
        };
      }

      return {
        inject_context: true,
        context_pack: {
          pack_id: injection.context_pack.id,
          content: injection.serialized_block,
          token_estimate: injection.context_pack.token_estimate
        },
        decision_summary: injection.decision_summary,
        injection_metadata: {
          disabled_by_control: false,
          token_estimate: injection.context_pack.token_estimate,
          pack_item_count: injection.context_pack.pack_items.length,
          pack_metrics: injection.metrics,
          persistence_warnings: persistenceWarnings
        }
      };
    } catch (error) {
      return {
        inject_context: false,
        context_pack: null,
        decision_summary: {
          reason: "pack_generation_failed",
          audit_ref: null
        },
        injection_metadata: {
          disabled_by_control: sessionControls.disable_injection,
          error: String(error),
          persistence_warnings: persistenceWarnings
        }
      };
    }
  }

  onAfterResponse(payload) {
    const persistenceWarnings = [];
    const state = this.sessions.get(payload.session_id);
    if (!state) {
      return {
        learning_enqueued: false,
        audit_ref: null,
        warnings: ["session_not_started"]
      };
    }

    const nextControls = {
      ...state.controls,
      disable_learning: Boolean(payload.controls?.disable_learning ?? state.controls.disable_learning)
    };
    state.controls = nextControls;

    const capture = this.pipeline.capture(state, {
      event_type: "AFTER_RESPONSE",
      session_ref: payload.session_id,
      occurred_at: payload.occurred_at,
      prompt_ref: payload.prompt_id,
      response_excerpt: promptExcerpt(payload.assistant_response),
      metrics: payload.response_stats,
      scope: state.scope,
      session_controls: nextControls
    });
    this._persistEvent(capture.memory_event, persistenceWarnings);

    return {
      learning_enqueued: capture.extracted_signals.length > 0,
      audit_ref: capture.memory_event.id,
      warnings: persistenceWarnings
    };
  }

  onSessionEnd(payload) {
    const persistenceWarnings = [];
    const state = this.sessions.get(payload.session_id);
    if (!state) {
      return {
        status: "degraded",
        audit_summary_ref: null,
        warnings: ["session_not_started"]
      };
    }

    const capture = this.pipeline.capture(state, {
      event_type: "SESSION_ENDED",
      session_ref: payload.session_id,
      occurred_at: payload.ended_at,
      reason: payload.reason,
      scope: state.scope,
      session_controls: state.controls
    });
    this._persistEvent(capture.memory_event, persistenceWarnings);

    try {
      const consolidation = this.pipeline.consolidateSession({
        state,
        memoryStore: this.memoryStore,
        disableLearning: state.controls.disable_learning
      });
      this._persistConsolidation(consolidation, persistenceWarnings);

      this.sessions.delete(payload.session_id);

      return {
        status: (consolidation.warnings.length > 0 || persistenceWarnings.length > 0) ? "degraded" : "ok",
        audit_summary_ref: `session_end_${payload.session_id}`,
        warnings: [...consolidation.warnings, ...persistenceWarnings],
        consolidation
      };
    } catch (error) {
      this.sessions.delete(payload.session_id);

      return {
        status: "degraded",
        audit_summary_ref: `session_end_${payload.session_id}`,
        warnings: [`session_consolidation_failed:${String(error)}`]
      };
    }
  }

  onStop(payload) {
    const persistenceWarnings = [];
    const state = this.sessions.get(payload.session_id);
    if (!state) {
      return {
        status: "degraded",
        warnings: ["session_not_started"]
      };
    }

    const nextControls = {
      ...state.controls,
      disable_learning: Boolean(payload.controls?.disable_learning ?? state.controls.disable_learning),
      disable_injection: Boolean(payload.controls?.disable_injection ?? state.controls.disable_injection)
    };
    state.controls = nextControls;

    let learningEnqueued = false;
    if (String(payload.assistant_response ?? "").trim().length > 0) {
      const capture = this.pipeline.capture(state, {
        event_type: "AFTER_RESPONSE",
        session_ref: payload.session_id,
        occurred_at: payload.occurred_at,
        prompt_ref: payload.prompt_id,
        response_excerpt: promptExcerpt(payload.assistant_response),
        metrics: payload.response_stats ?? null,
        scope: state.scope,
        session_controls: nextControls
      });
      this._persistEvent(capture.memory_event, persistenceWarnings);
      learningEnqueued = capture.extracted_signals.length > 0;
    }

    let consolidation;
    try {
      consolidation = this.pipeline.consolidateSession({
        state,
        memoryStore: this.memoryStore,
        disableLearning: state.controls.disable_learning
      });
      this._persistConsolidation(consolidation, persistenceWarnings);
      state.signal_buffer = [];
    } catch (error) {
      return {
        status: "degraded",
        warnings: [...persistenceWarnings, `stop_consolidation_failed:${String(error)}`]
      };
    }

    return {
      status: (consolidation.warnings.length > 0 || persistenceWarnings.length > 0) ? "degraded" : "ok",
      learning_enqueued: learningEnqueued,
      warnings: [...consolidation.warnings, ...persistenceWarnings],
      consolidation
    };
  }

  _loadInitialMemoryStore() {
    if (!this.persistence) {
      return null;
    }

    try {
      return this.persistence.loadMemoryStore();
    } catch (error) {
      this.runtimeWarnings.push(`memory_store_load_failed:${String(error)}`);
      this.persistence = null;
      return null;
    }
  }

  _persistEvent(memoryEvent, warnings) {
    if (!this.persistence || !memoryEvent) {
      return;
    }

    try {
      const result = this.persistence.persistEvent(memoryEvent, this.memoryStore);
      warnings.push(...(result.warnings ?? []));
    } catch (error) {
      warnings.push(`event_persistence_failed:${String(error)}`);
    }
  }

  _persistConsolidation(consolidation, warnings) {
    if (!this.persistence || !consolidation) {
      return;
    }

    try {
      const result = this.persistence.persistConsolidation(consolidation, this.memoryStore);
      warnings.push(...(result.warnings ?? []));
    } catch (error) {
      warnings.push(`consolidation_persistence_failed:${String(error)}`);
    }
  }
}
