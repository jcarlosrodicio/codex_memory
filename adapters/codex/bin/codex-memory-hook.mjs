#!/usr/bin/env node
import { runHookRuntime } from "../src/runtime/runtime-hook-handler.mjs";

runHookRuntime().catch((error) => {
  const fallback = {
    status: "degraded",
    warnings: [`runtime_unhandled_error:${String(error)}`]
  };

  process.stdout.write(`${JSON.stringify(fallback)}\n`);
});
