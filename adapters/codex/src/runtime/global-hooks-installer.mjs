import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const DEFAULT_PLUGIN_ROOT = "$HOME/.codex/plugins/codex-memory";
const HOOK_ENTRYPOINT_SUFFIX = "/adapters/codex/bin/codex-memory-hook.mjs";

function stableStringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function defaultGlobalHooksPath() {
  return path.resolve(homedir(), ".codex/hooks.json");
}

function defaultCodexConfigPath() {
  return path.resolve(homedir(), ".codex/config.toml");
}

function codexMemoryCommandMarker(pluginRoot = DEFAULT_PLUGIN_ROOT) {
  return `${pluginRoot}${HOOK_ENTRYPOINT_SUFFIX}`;
}

function codexMemoryCommand(pluginRoot, eventName) {
  return `node \"${pluginRoot}${HOOK_ENTRYPOINT_SUFFIX}\" ${eventName}`;
}

function codexMemoryGroups(pluginRoot = DEFAULT_PLUGIN_ROOT) {
  return {
    SessionStart: {
      matcher: ".*",
      hooks: [
        {
          type: "command",
          command: codexMemoryCommand(pluginRoot, "SessionStart"),
          timeout: 20
        }
      ]
    },
    UserPromptSubmit: {
      matcher: ".*",
      hooks: [
        {
          type: "command",
          command: codexMemoryCommand(pluginRoot, "UserPromptSubmit"),
          timeout: 20
        }
      ]
    },
    Stop: {
      hooks: [
        {
          type: "command",
          command: codexMemoryCommand(pluginRoot, "Stop"),
          timeout: 20
        }
      ]
    }
  };
}

function ensureHooksRoot(config) {
  if (!isObject(config)) {
    return { hooks: {} };
  }

  if (!isObject(config.hooks)) {
    return {
      ...config,
      hooks: {}
    };
  }

  return config;
}

function readHooksConfig(hooksPath) {
  if (!existsSync(hooksPath)) {
    return {
      hooks: {}
    };
  }

  const raw = readFileSync(hooksPath, "utf8");
  const parsed = JSON.parse(raw);
  return ensureHooksRoot(parsed);
}

function splitLines(content) {
  if (!content) {
    return [];
  }

  return String(content).split(/\r?\n/);
}

function joinLines(lines) {
  return `${lines.join("\n").replace(/\n*$/, "\n")}`;
}

function detectSections(lines) {
  const sections = [];
  let current = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^\s*\[([^\]]+)\]\s*(?:[#;].*)?$/);
    if (!match) {
      continue;
    }

    if (current) {
      current.end = index;
      sections.push(current);
    }

    current = {
      name: match[1].trim(),
      start: index,
      end: lines.length
    };
  }

  if (current) {
    sections.push(current);
  }

  return sections;
}

function codexHooksLine(rawLine) {
  const commentMatch = String(rawLine).match(/^(\s*)codex_hooks\s*=\s*(true|false)\s*(?:([#;].*))?$/i);
  if (!commentMatch) {
    return null;
  }

  return {
    indent: commentMatch[1] ?? "",
    value: commentMatch[2].toLowerCase() === "true",
    comment: commentMatch[3] ?? ""
  };
}

function withFeaturesSectionAppended(lines) {
  const normalized = [...lines];
  while (normalized.length > 0 && normalized[normalized.length - 1].trim().length === 0) {
    normalized.pop();
  }

  if (normalized.length > 0) {
    normalized.push("");
  }
  normalized.push("[features]");
  normalized.push("codex_hooks = true");

  return normalized;
}

export function ensureCodexHooksFeatureInToml(content) {
  const lines = splitLines(content);
  const sections = detectSections(lines);
  const featuresSections = sections.filter((section) => section.name === "features");
  const warnings = [];

  if (featuresSections.length > 1) {
    return {
      updated: false,
      status: "not_modified_ambiguous_features_section",
      warnings: ["config_toml_ambiguous_multiple_features_sections"],
      content: joinLines(lines)
    };
  }

  if (featuresSections.length === 0) {
    const nextLines = withFeaturesSectionAppended(lines);
    return {
      updated: true,
      status: "feature_flag_enabled",
      warnings,
      content: joinLines(nextLines)
    };
  }

  const featuresSection = featuresSections[0];
  const start = featuresSection.start + 1;
  const end = featuresSection.end;
  const keyHits = [];

  for (let index = start; index < end; index += 1) {
    const parsed = codexHooksLine(lines[index]);
    if (parsed) {
      keyHits.push({ index, parsed });
    }
  }

  if (keyHits.length > 1) {
    return {
      updated: false,
      status: "not_modified_ambiguous_codex_hooks_key",
      warnings: ["config_toml_ambiguous_multiple_codex_hooks_keys"],
      content: joinLines(lines)
    };
  }

  if (keyHits.length === 1) {
    const [{ index, parsed }] = keyHits;
    if (parsed.value) {
      return {
        updated: false,
        status: "feature_flag_already_enabled",
        warnings,
        content: joinLines(lines)
      };
    }

    lines[index] = `${parsed.indent}codex_hooks = true${parsed.comment ? ` ${parsed.comment}` : ""}`;
    return {
      updated: true,
      status: "feature_flag_enabled",
      warnings,
      content: joinLines(lines)
    };
  }

  let insertAt = end;
  while (insertAt > start && lines[insertAt - 1].trim().length === 0) {
    insertAt -= 1;
  }
  lines.splice(insertAt, 0, "codex_hooks = true");

  return {
    updated: true,
    status: "feature_flag_enabled",
    warnings,
    content: joinLines(lines)
  };
}

function readConfigToml(configPath) {
  if (!existsSync(configPath)) {
    return "";
  }

  return readFileSync(configPath, "utf8");
}

function stripCodexMemoryHooks(groups, marker) {
  const warnings = [];
  const keptGroups = [];
  let removedCount = 0;

  for (const group of Array.isArray(groups) ? groups : []) {
    if (!isObject(group)) {
      keptGroups.push(group);
      continue;
    }

    if (!Array.isArray(group.hooks)) {
      keptGroups.push(group);
      continue;
    }

    const nextHooks = [];
    for (const hook of group.hooks) {
      if (!isObject(hook)) {
        nextHooks.push(hook);
        continue;
      }

      const command = String(hook.command ?? "");
      if (command.includes(marker) || command.includes("codex-memory-hook.mjs")) {
        removedCount += 1;
        continue;
      }

      nextHooks.push(hook);
    }

    if (nextHooks.length === 0) {
      continue;
    }

    keptGroups.push({
      ...group,
      hooks: nextHooks
    });
  }

  if (removedCount > 0) {
    warnings.push(`removed_previous_codex_memory_hooks:${removedCount}`);
  }

  return {
    groups: keptGroups,
    warnings
  };
}

export function mergeGlobalHooksConfig(existingConfig, options = {}) {
  const pluginRoot = options.pluginRoot ?? DEFAULT_PLUGIN_ROOT;
  const marker = codexMemoryCommandMarker(pluginRoot);
  const base = ensureHooksRoot(clone(existingConfig));
  const desired = codexMemoryGroups(pluginRoot);

  const warnings = [];

  for (const eventName of ["SessionStart", "UserPromptSubmit", "Stop"]) {
    const stripped = stripCodexMemoryHooks(base.hooks[eventName] ?? [], marker);
    warnings.push(...stripped.warnings);

    base.hooks[eventName] = [...stripped.groups, desired[eventName]];
  }

  return {
    config: base,
    warnings
  };
}

export function installGlobalHooks(options = {}) {
  const hooksPath = path.resolve(options.hooksPath ?? defaultGlobalHooksPath());
  const configPath = path.resolve(options.configPath ?? defaultCodexConfigPath());
  const pluginRoot = options.pluginRoot ?? DEFAULT_PLUGIN_ROOT;
  const dryRun = Boolean(options.dryRun);

  const existing = readHooksConfig(hooksPath);
  const merged = mergeGlobalHooksConfig(existing, { pluginRoot });
  const existingConfigToml = readConfigToml(configPath);
  const configUpdate = ensureCodexHooksFeatureInToml(existingConfigToml);

  if (!dryRun) {
    mkdirSync(path.dirname(hooksPath), { recursive: true });
    writeFileSync(hooksPath, stableStringify(merged.config), "utf8");

    if (configUpdate.status !== "not_modified_ambiguous_features_section"
      && configUpdate.status !== "not_modified_ambiguous_codex_hooks_key") {
      mkdirSync(path.dirname(configPath), { recursive: true });
      writeFileSync(configPath, configUpdate.content, "utf8");
    }
  }

  return {
    hooks_path: hooksPath,
    config_path: configPath,
    plugin_root: pluginRoot,
    dry_run: dryRun,
    hooks_status: "hooks_installed_or_updated",
    feature_flag_status: configUpdate.status,
    warnings: [...merged.warnings, ...configUpdate.warnings],
    config: merged.config,
    codex_config_toml: configUpdate.content
  };
}
