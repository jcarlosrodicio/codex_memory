import { normalizeScope } from "../retrieval/utils.mjs";
import {
  makeDeterministicId,
  normalizeEventScope,
  nowIso
} from "./utils.mjs";

const SUPPORTED_EVENT_TYPES = new Set([
  "SESSION_STARTED",
  "BEFORE_PROMPT",
  "AFTER_RESPONSE",
  "SESSION_ENDED"
]);

export class SessionEventNormalizer {
  constructor(options = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  normalize(adapterEvent) {
    const eventType = adapterEvent?.event_type;
    if (!SUPPORTED_EVENT_TYPES.has(eventType)) {
      throw new Error(`Unsupported event_type: ${eventType}`);
    }

    const occurredAt = adapterEvent.occurred_at ?? nowIso(this.now);
    const scope = normalizeScope(adapterEvent.scope ?? normalizeEventScope(adapterEvent));

    const eventId = makeDeterministicId("evt", [
      adapterEvent.session_ref,
      eventType,
      adapterEvent.prompt_ref ?? "",
      occurredAt,
      adapterEvent.reason ?? ""
    ]);

    return {
      id: eventId,
      scope,
      provenance: {
        producer: "adapter",
        adapter: "codex",
        normalized_from_event_type: eventType,
        session_ref: adapterEvent.session_ref
      },
      event_type: eventType,
      occurred_at: occurredAt,
      captured_at: nowIso(this.now),
      payload: {
        prompt_ref: adapterEvent.prompt_ref ?? null,
        prompt_excerpt: adapterEvent.prompt_excerpt ?? null,
        response_excerpt: adapterEvent.response_excerpt ?? null,
        metrics: adapterEvent.metrics ?? null,
        budget_hint: adapterEvent.budget_hint ?? null,
        session_controls: adapterEvent.session_controls ?? null,
        reason: adapterEvent.reason ?? null
      },
      source_refs: [adapterEvent.prompt_ref ?? adapterEvent.session_ref].filter(Boolean)
    };
  }
}
