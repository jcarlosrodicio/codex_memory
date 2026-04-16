#!/usr/bin/env node
import path from "node:path";
import { homedir } from "node:os";
import { buildDashboardReport, openDashboardFile, writeDashboardHtml } from "../src/dashboard.mjs";
import {
  buildAnalyzeStoreReport,
  buildCompactStoreReport,
  buildExplainAtomReport,
  buildInspectLastPackReport,
  buildInspectSessionReport,
  buildMetricsReport,
  buildStatusReport
} from "../src/inspection.mjs";

function defaultStorePath() {
  return path.resolve(homedir(), ".codex/plugins/codex-memory/data");
}

function parseArgs(argv) {
  const args = {
    command: argv[2] ?? "status",
    storePath: defaultStorePath(),
    json: false,
    sessionId: null,
    atomId: null,
    apply: false,
    outputPath: null
  };

  for (let index = 3; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];

    if (flag === "--store-path" && next) {
      args.storePath = path.resolve(next);
      index += 1;
      continue;
    }

    if (flag === "--session-id" && next) {
      args.sessionId = next;
      index += 1;
      continue;
    }

    if (flag === "--atom-id" && next) {
      args.atomId = next;
      index += 1;
      continue;
    }

    if (flag === "--json") {
      args.json = true;
    }

    if (flag === "--apply") {
      args.apply = true;
    }

    if (flag === "--output" && next) {
      args.outputPath = path.resolve(next);
      index += 1;
    }
  }

  return args;
}

function runCommand(args) {
  if (args.command === "status") {
    return buildStatusReport({ storePath: args.storePath });
  }

  if (args.command === "metrics") {
    return buildMetricsReport({ storePath: args.storePath });
  }

  if (args.command === "inspect-last-pack") {
    return buildInspectLastPackReport({ storePath: args.storePath });
  }

  if (args.command === "inspect-session") {
    if (!args.sessionId) {
      throw new Error("inspect-session requires --session-id");
    }

    return buildInspectSessionReport({
      storePath: args.storePath,
      sessionId: args.sessionId
    });
  }

  if (args.command === "explain-atom") {
    if (!args.atomId) {
      throw new Error("explain-atom requires --atom-id");
    }

    return buildExplainAtomReport({
      storePath: args.storePath,
      atomId: args.atomId
    });
  }

  if (args.command === "analyze-store") {
    return buildAnalyzeStoreReport({ storePath: args.storePath });
  }

  if (args.command === "compact-store") {
    return buildCompactStoreReport({
      storePath: args.storePath,
      apply: args.apply
    });
  }

  if (args.command === "dashboard" || args.command === "open-dashboard") {
    const outputPath = args.outputPath ?? path.join(args.storePath, "runtime", "dashboard.html");
    const report = buildDashboardReport({
      storePath: args.storePath,
      outputPath
    });

    writeDashboardHtml({
      report,
      outputPath
    });

    const openResult = args.command === "open-dashboard"
      ? openDashboardFile(outputPath)
      : { opened: false, command: null };

    return {
      ...report,
      generated: true,
      output_path: outputPath,
      open: openResult
    };
  }

  throw new Error(`Unsupported command: ${args.command}`);
}

try {
  const args = parseArgs(process.argv);
  const report = runCommand(args);

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    status: "error",
    reason: String(error)
  })}\n`);
  process.exitCode = 1;
}
