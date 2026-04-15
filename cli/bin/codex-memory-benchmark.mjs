#!/usr/bin/env node
import path from "node:path";
import { runBenchmark } from "../src/benchmark-harness.mjs";

function parseArgs(argv) {
  const args = {
    fixturePath: null,
    json: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];

    if (flag === "--fixture" && next) {
      args.fixturePath = path.resolve(next);
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
  if (!args.fixturePath) {
    throw new Error("--fixture is required");
  }

  const report = await runBenchmark({
    fixturePath: args.fixturePath
  });

  process.stdout.write(args.json ? `${JSON.stringify(report)}\n` : `${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    status: "error",
    reason: String(error)
  })}\n`);
  process.exitCode = 1;
}
