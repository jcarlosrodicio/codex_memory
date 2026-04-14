import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ensureCodexHooksFeatureInToml,
  installGlobalHooks,
  mergeGlobalHooksConfig
} from "../src/runtime/global-hooks-installer.mjs";

function extractCommands(config, eventName) {
  const eventGroups = config.hooks?.[eventName] ?? [];
  return eventGroups.flatMap((group) =>
    Array.isArray(group?.hooks)
      ? group.hooks.map((hook) => String(hook.command ?? ""))
      : []
  );
}

test("SPEC-025 global activation creates ~/.codex/hooks-style config when missing", async () => {
  const workDir = await mkdtemp(path.join(tmpdir(), "codex-memory-global-hooks-create-"));
  const hooksPath = path.join(workDir, "hooks.json");
  const configPath = path.join(workDir, "config.toml");

  const result = installGlobalHooks({
    hooksPath,
    configPath,
    pluginRoot: "$HOME/.codex/plugins/codex-memory"
  });

  assert.equal(result.hooks_path, hooksPath);
  assert.equal(result.config_path, configPath);
  assert.equal(result.hooks_status, "hooks_installed_or_updated");
  assert.ok(result.config.hooks.SessionStart);
  assert.ok(result.config.hooks.UserPromptSubmit);
  assert.ok(result.config.hooks.Stop);

  const written = JSON.parse(await readFile(hooksPath, "utf8"));
  assert.ok(
    extractCommands(written, "SessionStart").some((command) => command.includes("codex-memory-hook.mjs\" SessionStart"))
  );
  assert.ok(
    extractCommands(written, "UserPromptSubmit").some((command) => command.includes("codex-memory-hook.mjs\" UserPromptSubmit"))
  );
  assert.ok(
    extractCommands(written, "Stop").some((command) => command.includes("codex-memory-hook.mjs\" Stop"))
  );

  const configToml = await readFile(configPath, "utf8");
  assert.match(configToml, /\[features\]/);
  assert.match(configToml, /codex_hooks\s*=\s*true/);
  assert.equal(result.feature_flag_status, "feature_flag_enabled");
});

test("SPEC-025 global activation merges safely and preserves non-codex-memory hooks", async () => {
  const workDir = await mkdtemp(path.join(tmpdir(), "codex-memory-global-hooks-merge-"));
  const hooksPath = path.join(workDir, "hooks.json");
  const configPath = path.join(workDir, "config.toml");

  const existing = {
    hooks: {
      SessionStart: [
        {
          matcher: "^safe$",
          hooks: [
            {
              type: "command",
              command: "echo external-session-start"
            }
          ]
        }
      ],
      UserPromptSubmit: [
        {
          matcher: "^safe$",
          hooks: [
            {
              type: "command",
              command: "echo external-user-submit"
            }
          ]
        }
      ],
      Notification: [
        {
          matcher: ".*",
          hooks: [
            {
              type: "command",
              command: "echo unrelated-event"
            }
          ]
        }
      ]
    }
  };

  await writeFile(hooksPath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
  await writeFile(configPath, "[profile]\nname = \"demo\"\n", "utf8");

  const result = installGlobalHooks({
    hooksPath,
    configPath,
    pluginRoot: "$HOME/.codex/plugins/codex-memory"
  });

  const merged = JSON.parse(await readFile(hooksPath, "utf8"));

  assert.ok(extractCommands(merged, "SessionStart").includes("echo external-session-start"));
  assert.ok(extractCommands(merged, "UserPromptSubmit").includes("echo external-user-submit"));
  assert.ok(extractCommands(merged, "Notification").includes("echo unrelated-event"));

  assert.ok(
    extractCommands(merged, "SessionStart").some((command) => command.includes("codex-memory-hook.mjs\" SessionStart"))
  );
  assert.ok(result.warnings.length >= 0);

  const configToml = await readFile(configPath, "utf8");
  assert.match(configToml, /\[profile\]/);
  assert.match(configToml, /name = "demo"/);
  assert.match(configToml, /\[features\]/);
  assert.match(configToml, /codex_hooks\s*=\s*true/);
});

test("SPEC-025 global activation removes stale codex-memory entries before appending canonical ones", () => {
  const existing = {
    hooks: {
      SessionStart: [
        {
          matcher: ".*",
          hooks: [
            {
              type: "command",
              command: "node \"$HOME/.codex/plugins/codex-memory/adapters/codex/bin/codex-memory-hook.mjs\" SessionStart"
            }
          ]
        }
      ]
    }
  };

  const { config, warnings } = mergeGlobalHooksConfig(existing, {
    pluginRoot: "$HOME/.codex/plugins/codex-memory"
  });

  const commands = extractCommands(config, "SessionStart").filter((command) => command.includes("codex-memory-hook.mjs"));

  assert.equal(commands.length, 1);
  assert.ok(commands[0].includes("SessionStart"));
  assert.ok(warnings.some((item) => item.startsWith("removed_previous_codex_memory_hooks:")));
});

test("SPEC-025 config updater enables codex_hooks when features section exists with false", () => {
  const input = [
    "[features]",
    "codex_hooks = false",
    "",
    "[another]",
    "x = 1"
  ].join("\n");

  const result = ensureCodexHooksFeatureInToml(input);
  assert.equal(result.status, "feature_flag_enabled");
  assert.match(result.content, /codex_hooks = true/);
  assert.match(result.content, /\[another\]/);
});

test("SPEC-025 config updater adds codex_hooks to existing features section when missing", () => {
  const input = [
    "[features]",
    "safe_mode = true",
    "",
    "[profile]",
    "name = \"x\""
  ].join("\n");

  const result = ensureCodexHooksFeatureInToml(input);
  assert.equal(result.status, "feature_flag_enabled");
  assert.match(result.content, /\[features\][\s\S]*safe_mode = true[\s\S]*codex_hooks = true/);
});

test("SPEC-025 config updater is idempotent when codex_hooks already true", () => {
  const input = [
    "[features]",
    "codex_hooks = true",
    "",
    "[profile]",
    "name = \"x\""
  ].join("\n");

  const first = ensureCodexHooksFeatureInToml(input);
  assert.equal(first.status, "feature_flag_already_enabled");

  const second = ensureCodexHooksFeatureInToml(first.content);
  assert.equal(second.status, "feature_flag_already_enabled");
  const codexHooksHits = second.content.match(/codex_hooks\s*=\s*true/g) ?? [];
  assert.equal(codexHooksHits.length, 1);
});

test("SPEC-025 config updater reports warning for ambiguous multiple features sections", () => {
  const input = [
    "[features]",
    "codex_hooks = true",
    "",
    "[features]",
    "other = true"
  ].join("\n");

  const result = ensureCodexHooksFeatureInToml(input);
  assert.equal(result.status, "not_modified_ambiguous_features_section");
  assert.ok(result.warnings.includes("config_toml_ambiguous_multiple_features_sections"));
});

test("SPEC-025 global installer keeps config file untouched on ambiguous config and returns warning", async () => {
  const workDir = await mkdtemp(path.join(tmpdir(), "codex-memory-global-hooks-ambiguous-config-"));
  const hooksPath = path.join(workDir, "hooks.json");
  const configPath = path.join(workDir, "config.toml");

  const ambiguous = [
    "[features]",
    "codex_hooks = true",
    "",
    "[features]",
    "safe_mode = true"
  ].join("\n");
  await writeFile(configPath, `${ambiguous}\n`, "utf8");

  const result = installGlobalHooks({
    hooksPath,
    configPath,
    pluginRoot: "$HOME/.codex/plugins/codex-memory"
  });

  const current = await readFile(configPath, "utf8");
  assert.equal(current, `${ambiguous}\n`);
  assert.equal(result.feature_flag_status, "not_modified_ambiguous_features_section");
  assert.ok(result.warnings.includes("config_toml_ambiguous_multiple_features_sections"));
});

test("SPEC-025 global installer is idempotent across repeated runs", async () => {
  const workDir = await mkdtemp(path.join(tmpdir(), "codex-memory-global-hooks-idempotent-"));
  const hooksPath = path.join(workDir, "hooks.json");
  const configPath = path.join(workDir, "config.toml");

  installGlobalHooks({
    hooksPath,
    configPath,
    pluginRoot: "$HOME/.codex/plugins/codex-memory"
  });
  installGlobalHooks({
    hooksPath,
    configPath,
    pluginRoot: "$HOME/.codex/plugins/codex-memory"
  });

  const hooksJson = JSON.parse(await readFile(hooksPath, "utf8"));
  const configToml = await readFile(configPath, "utf8");

  const codexCommands = ["SessionStart", "UserPromptSubmit", "Stop"].flatMap((eventName) =>
    extractCommands(hooksJson, eventName).filter((command) => command.includes("codex-memory-hook.mjs"))
  );
  assert.equal(codexCommands.length, 3);

  const codexHooksEnabledKeys = configToml.match(/codex_hooks\s*=\s*true/g) ?? [];
  assert.equal(codexHooksEnabledKeys.length, 1);
});
