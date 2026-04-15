#!/usr/bin/env node
import path from "node:path";
import { evaluateQualityGates, loadBenchmarkReport } from "../src/quality-gates.mjs";

function parseArgs(argv) {
  const args = {
    benchmarkReportPath: null,
    storePath: null,
    json: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];

    if (flag === "--benchmark-report" && next) {
      args.benchmarkReportPath = path.resolve(next);
      index += 1;
      continue;
    }

    if (flag === "--store-path" && next) {
      args.storePath = path.resolve(next);
      index += 1;
      continue;
    }

    if (flag === "--json") {
      args.json = true;
    }
  }

  return args;
}

try {
  const args = parseArgs(process.argv);
  if (!args.benchmarkReportPath) {
    throw new Error("--benchmark-report is required");
  }
  if (!args.storePath) {
    throw new Error("--store-path is required");
  }

  const benchmarkReport = loadBenchmarkReport(args.benchmarkReportPath);
  const result = evaluateQualityGates({
    benchmarkReport,
    storePath: args.storePath
  });

  process.stdout.write(args.json ? `${JSON.stringify(result)}\n` : `${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    status: "error",
    reason: String(error)
  })}\n`);
  process.exitCode = 1;
}
