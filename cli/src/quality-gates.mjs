import { readFileSync } from "node:fs";
import { loadInspectionData } from "./inspection.mjs";

function hasNumericMetrics(modeReport) {
  const metrics = modeReport?.metrics ?? {};
  return [
    metrics.pack_tokens,
    metrics.retrieved_count,
    metrics.dropped_count,
    metrics.token_savings_estimate,
    metrics.scope_contamination_rate,
    metrics.contradiction_injection_rate,
    metrics.user_correction_rate
  ].every((value) => typeof value === "number" && Number.isFinite(value));
}

export function evaluateQualityGates({ benchmarkReport, storePath }) {
  const inspection = loadInspectionData({ storePath });

  const cheapFirst = (benchmarkReport.modes ?? []).find((item) => item.mode === "cheap-first");
  const zeroDependencyCoveragePass = Boolean(cheapFirst && cheapFirst.semantic_mode === "off");

  const benchmarkEvidencePass = Array.isArray(benchmarkReport.modes)
    && benchmarkReport.modes.length >= 3
    && benchmarkReport.modes.every(hasNumericMetrics);

  const explainabilityPass = inspection.audits.length > 0 && inspection.lastPack !== null;

  const safetyPass = Boolean(
    inspection.status
    && typeof inspection.status.safety?.warning_count === "number"
    && inspection.status.audit_last_updated_at
  );

  const gates = {
    zero_dependency_coverage: {
      pass: zeroDependencyCoveragePass,
      detail: zeroDependencyCoveragePass
        ? "cheap-first mode with semantic=off is present"
        : "missing cheap-first semantic=off evidence"
    },
    benchmark_evidence: {
      pass: benchmarkEvidencePass,
      detail: benchmarkEvidencePass
        ? "all required benchmark metric groups are present"
        : "benchmark report does not include required metric groups"
    },
    explainability_surface: {
      pass: explainabilityPass,
      detail: explainabilityPass
        ? "runtime audit + inspect-last-pack artifacts are available"
        : "missing runtime audit or last-pack artifacts"
    },
    safety_and_audit_coverage: {
      pass: safetyPass,
      detail: safetyPass
        ? "runtime status includes safety fields and audit timestamp"
        : "runtime status safety coverage is incomplete"
    }
  };

  return {
    spec_id: "SPEC-019",
    quality_gate_schema_version: "1",
    evaluated_at: new Date().toISOString(),
    release_ready: Object.values(gates).every((gate) => gate.pass),
    gates
  };
}

export function loadBenchmarkReport(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}
