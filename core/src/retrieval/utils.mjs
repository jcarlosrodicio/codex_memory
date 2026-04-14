import { SCOPE_LEVELS } from "./constants.mjs";

const WORD_RE = /[a-z0-9_]+/g;

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value) {
  const normalized = normalizeText(value);
  const matches = normalized.match(WORD_RE);
  return matches ?? [];
}

export function tokenFrequency(tokens) {
  const frequency = new Map();
  for (const token of tokens) {
    frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }
  return frequency;
}

export function estimateTokens(value) {
  const tokens = tokenize(value);
  return tokens.length;
}

export function toIsoString(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function recencyScore(timestamp, nowIso) {
  const createdAt = toIsoString(timestamp);
  const now = toIsoString(nowIso) ?? new Date().toISOString();
  if (!createdAt) {
    return 0.35;
  }

  const createdMs = Date.parse(createdAt);
  const nowMs = Date.parse(now);
  const ageMs = Math.max(0, nowMs - createdMs);
  const oneDayMs = 24 * 60 * 60 * 1000;
  const ageDays = ageMs / oneDayMs;

  return 1 / (1 + ageDays / 7);
}

export function clampScore(value) {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

export function scopeToLevel(scope) {
  const normalized = normalizeScope(scope);
  return normalized.level;
}

export function scopeLevelRank(scopeLevel) {
  const index = SCOPE_LEVELS.indexOf(scopeLevel);
  return index >= 0 ? index : -1;
}

export function normalizeScope(scope) {
  if (typeof scope === "string") {
    return parseScopeKey(scope);
  }

  if (!scope || typeof scope !== "object") {
    return {
      level: "global",
      scope_key: "global"
    };
  }

  const level = scope.level ?? inferLevelFromFields(scope);
  const normalized = {
    ...scope,
    level: level ?? "global"
  };

  if (!normalized.scope_key) {
    normalized.scope_key = buildScopeKeyFromNormalized(normalized);
  }

  return normalized;
}

function inferLevelFromFields(scope) {
  if (scope.session_id) {
    return "session";
  }

  if (scope.branch_or_workspace_id) {
    return "branch_or_workspace";
  }

  if (scope.repository_id) {
    return "repository";
  }

  return "global";
}

export function buildScopeKey(scope) {
  const normalized = normalizeScope(scope);
  return buildScopeKeyFromNormalized(normalized);
}

function buildScopeKeyFromNormalized(normalized) {
  if (normalized.level === "global") {
    return "global";
  }

  if (normalized.level === "repository") {
    return `repo::${normalized.repository_id}`;
  }

  if (normalized.level === "branch_or_workspace") {
    return `repo::${normalized.repository_id}::branch_or_workspace::${normalized.branch_or_workspace_id}`;
  }

  if (normalized.level === "session") {
    return `session::${normalized.session_id}`;
  }

  return String(normalized.level);
}

export function parseScopeKey(scopeKey) {
  if (!scopeKey || scopeKey === "global") {
    return {
      level: "global",
      scope_key: "global"
    };
  }

  if (scopeKey.startsWith("repo::") && scopeKey.includes("::branch_or_workspace::")) {
    const parts = scopeKey.split("::");
    const repository_id = parts[1];
    const branch_or_workspace_id = parts[3];
    return {
      level: "branch_or_workspace",
      scope_key: scopeKey,
      repository_id,
      branch_or_workspace_id,
      raw_parts: parts
    };
  }

  if (scopeKey.startsWith("repo::")) {
    return {
      level: "repository",
      scope_key: scopeKey,
      repository_id: scopeKey.replace("repo::", "")
    };
  }

  if (scopeKey.startsWith("session::")) {
    return {
      level: "session",
      scope_key: scopeKey,
      session_id: scopeKey.replace("session::", "")
    };
  }

  return {
    level: "global",
    scope_key: "global"
  };
}

export function isScopeCompatible(itemScope, activeScope) {
  const item = normalizeScope(itemScope);
  const active = normalizeScope(activeScope);

  if (item.level === "global") {
    return true;
  }

  if (item.level === "repository") {
    return Boolean(active.repository_id && active.repository_id === item.repository_id);
  }

  if (item.level === "branch_or_workspace") {
    return (
      active.repository_id === item.repository_id
      && active.branch_or_workspace_id === item.branch_or_workspace_id
    );
  }

  if (item.level === "session") {
    return active.session_id === item.session_id;
  }

  return false;
}

export function lexicalOverlapScore(queryTokens, contentTokens) {
  if (!queryTokens.length || !contentTokens.length) {
    return 0;
  }

  const queryFrequency = tokenFrequency(queryTokens);
  const contentFrequency = tokenFrequency(contentTokens);

  let matched = 0;
  let total = 0;

  for (const [term, count] of queryFrequency.entries()) {
    total += count;
    matched += Math.min(count, contentFrequency.get(term) ?? 0);
  }

  if (total === 0) {
    return 0;
  }

  return matched / total;
}

export function scopeProximityScore(itemScope, activeScope) {
  const item = normalizeScope(itemScope);
  const active = normalizeScope(activeScope);

  if (!isScopeCompatible(item, active)) {
    return 0;
  }

  const itemRank = scopeLevelRank(item.level);
  const activeRank = scopeLevelRank(active.level);

  if (itemRank < 0 || activeRank < 0) {
    return 0;
  }

  const delta = Math.abs(activeRank - itemRank);
  if (delta === 0) {
    return 1;
  }

  if (delta === 1) {
    return 0.85;
  }

  if (delta === 2) {
    return 0.7;
  }

  return 0.55;
}

export function reuseScore(memoryObject) {
  const usageCount = Number(memoryObject?.reuse_count ?? memoryObject?.usage_count ?? 0);
  if (usageCount <= 0) {
    return 0;
  }

  return Math.min(1, Math.log10(usageCount + 1));
}

export function stableScoreSort(candidates) {
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    const aRank = scopeLevelRank(scopeToLevel(a.scope));
    const bRank = scopeLevelRank(scopeToLevel(b.scope));
    if (bRank !== aRank) {
      return bRank - aRank;
    }

    const aTime = Date.parse(toIsoString(a.updated_at ?? a.created_at) ?? "1970-01-01T00:00:00.000Z");
    const bTime = Date.parse(toIsoString(b.updated_at ?? b.created_at) ?? "1970-01-01T00:00:00.000Z");
    if (bTime !== aTime) {
      return bTime - aTime;
    }

    return String(a.memory_id).localeCompare(String(b.memory_id));
  });
}

export function resolveMemoryText(memoryObject) {
  if (memoryObject.summary) {
    return String(memoryObject.summary);
  }

  return String(memoryObject.content ?? "");
}
