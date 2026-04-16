import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SessionPipelineCore } from "../src/index.mjs";
import { assessMemoryQuality } from "../src/session/memory-quality-policy.mjs";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

async function loadJson(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

test("defines capture events, candidate schema, and bounded buffers", async () => {
  const contract = await loadJson("core/contracts/capture-signal-pipeline.v1.json");

  assert.equal(contract.spec_id, "SPEC-014");
  assert.ok(contract.source_events.includes("BEFORE_PROMPT"));
  assert.ok(contract.source_events.includes("AFTER_RESPONSE"));
  assert.ok(contract.candidate_signal_schema.required_fields.includes("confidence"));
  assert.equal(contract.buffering.overflow_behavior, "drop_oldest_and_record_warning");
});

test("captures normalized events and extracts deterministic candidate signals with provenance", () => {
  const pipeline = new SessionPipelineCore({
    event_options: {
      now: () => "2026-04-14T10:00:00.000Z"
    },
    signal_options: {
      maxSignalsPerEvent: 4,
      minConfidence: 0.4
    }
  });

  const session = pipeline.initSession({
    event_type: "SESSION_STARTED",
    session_ref: "s-014",
    occurred_at: "2026-04-14T10:00:00.000Z",
    scope_hints: {
      repo: "repo-a",
      branch: "feat-layer4"
    },
    session_controls: {
      disable_injection: false,
      disable_learning: false
    }
  });

  const captured = pipeline.capture(session.state, {
    event_type: "BEFORE_PROMPT",
    session_ref: "s-014",
    prompt_ref: "p-1",
    occurred_at: "2026-04-14T10:01:00.000Z",
    prompt_excerpt: "Please prefer deterministic tests. We must run node test before finishing."
  });

  assert.equal(captured.memory_event.event_type, "BEFORE_PROMPT");
  assert.equal(captured.memory_event.scope.repository_id, "repo-a");
  assert.ok(captured.extracted_signals.length >= 1);
  assert.ok(captured.extracted_signals.every((signal) => signal.confidence >= 0.4));
  assert.ok(captured.extracted_signals.every((signal) => signal.scope.repository_id === "repo-a"));
  assert.ok(
    captured.extracted_signals.every(
      (signal) => signal.provenance.source_event_id === captured.memory_event.id
    )
  );
});

test("keeps capture/session buffers bounded and drops oldest entries deterministically", () => {
  const pipeline = new SessionPipelineCore({
    maxEventBuffer: 2,
    maxSignalBuffer: 2,
    signal_options: {
      maxSignalsPerEvent: 2,
      minConfidence: 0.4
    }
  });

  const { state } = pipeline.initSession({
    event_type: "SESSION_STARTED",
    session_ref: "s-014-bounded",
    occurred_at: "2026-04-14T10:00:00.000Z",
    scope_hints: { repo: "repo-a", branch: "feat-layer4" },
    session_controls: {}
  });

  pipeline.capture(state, {
    event_type: "BEFORE_PROMPT",
    session_ref: "s-014-bounded",
    prompt_ref: "p-1",
    occurred_at: "2026-04-14T10:01:00.000Z",
    prompt_excerpt: "Please prefer deterministic output."
  });

  pipeline.capture(state, {
    event_type: "AFTER_RESPONSE",
    session_ref: "s-014-bounded",
    prompt_ref: "p-1",
    occurred_at: "2026-04-14T10:02:00.000Z",
    response_excerpt: "We will fix the failing test and run command again."
  });

  pipeline.capture(state, {
    event_type: "BEFORE_PROMPT",
    session_ref: "s-014-bounded",
    prompt_ref: "p-2",
    occurred_at: "2026-04-14T10:03:00.000Z",
    prompt_excerpt: "Must keep scope isolated and deterministic."
  });

  assert.equal(state.event_buffer.length, 2);
  assert.equal(state.signal_buffer.length, 2);
  assert.ok(state.warnings.some((warning) => warning.startsWith("event_buffer_trimmed:")));
  assert.ok(state.warnings.some((warning) => warning.startsWith("signal_buffer_trimmed:")));
});

test("durable-memory policy rejects review/meta chatter and keeps durable repo knowledge", () => {
  assert.deepEqual(
    assessMemoryQuality("No encontré findings nuevos en este fix", { atomType: "bugfix" }),
    { accepted: false, reason: "review_chatter" }
  );

  assert.deepEqual(
    assessMemoryQuality("El test nuevo en `/Users/juanca/project/adapters/codex/tests/runtime-hook-wiring-and-local-persistence-activation.test.mjs` cubre el fix", { atomType: "workflow" }),
    { accepted: false, reason: "path_reference_noise" }
  );

  assert.deepEqual(
    assessMemoryQuality("{\"title\":\"Revisa SPEC-026 API v1\"}", { atomType: "fact" }),
    { accepted: false, reason: "title_payload_noise" }
  );

  assert.deepEqual(
    assessMemoryQuality("If not blocked, summarize files edited so far and whether the test command has run", { atomType: "workflow" }),
    { accepted: false, reason: "process_reporting_noise" }
  );

  assert.deepEqual(
    assessMemoryQuality("El plan quedó cerrado en [2026-04-15-routine-builder-qa-fixes.md](/Users/juanca/project/docs/superpowers/plans/2026-04-15-routine-builder-qa-fixes.md:1) con Status: Completed on 2026-04-15", { atomType: "bugfix" }),
    { accepted: false, reason: "process_reporting_noise" }
  );

  assert.deepEqual(
    assessMemoryQuality("You are a helpful assistant", { atomType: "fact" }),
    { accepted: false, reason: "generic_system_scaffolding" }
  );

  assert.equal(
    assessMemoryQuality("Default store path is ~/.codex/plugins/codex-memory/data", { atomType: "fact" }).accepted,
    true
  );

  assert.equal(
    assessMemoryQuality("Always rebuild indexes after compact-store --apply", { atomType: "workflow" }).accepted,
    true
  );

  assert.equal(
    assessMemoryQuality("Default store path is ~/.codex/plugins/codex-memory/data and compact-store --apply rebuilds indexes after cleanup", { atomType: "fact" }).accepted,
    true
  );
});
