#!/usr/bin/env node
import { installGlobalHooks } from "../src/runtime/global-hooks-installer.mjs";

function parseArgs(argv) {
  const args = {
    hooksPath: null,
    configPath: null,
    pluginRoot: null,
    dryRun: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];

    if (flag === "--hooks-path" && next) {
      args.hooksPath = next;
      index += 1;
      continue;
    }

    if (flag === "--plugin-root" && next) {
      args.pluginRoot = next;
      index += 1;
      continue;
    }

    if (flag === "--config-path" && next) {
      args.configPath = next;
      index += 1;
      continue;
    }

    if (flag === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

try {
  const args = parseArgs(process.argv);
  const result = installGlobalHooks(args);
  process.stdout.write(`${JSON.stringify({
    status: "ok",
    hooks_path: result.hooks_path,
    config_path: result.config_path,
    plugin_root: result.plugin_root,
    dry_run: result.dry_run,
    hooks_status: result.hooks_status,
    feature_flag_status: result.feature_flag_status,
    warnings: result.warnings
  })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    status: "error",
    reason: String(error)
  })}\n`);
  process.exitCode = 1;
}
