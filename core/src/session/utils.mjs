import { createHash } from "node:crypto";
import {
  asArray,
  buildScopeKey,
  clampScore,
  normalizeScope,
  normalizeText,
  tokenize
} from "../retrieval/utils.mjs";

export function makeDeterministicId(prefix, parts = []) {
  const hash = createHash("sha1")
    .update(parts.map((part) => String(part ?? "")).join("||"))
    .digest("hex")
    .slice(0, 14);

  return `${prefix}_${hash}`;
}

export function nowIso(nowFn) {
  return (nowFn ?? (() => new Date().toISOString()))();
}

export function normalizeEventScope(normalizedEvent) {
  const scopeHints = normalizedEvent.scope_hints ?? {};

  if (scopeHints.branch) {
    return normalizeScope({
      level: "branch_or_workspace",
      repository_id: scopeHints.repo ?? "unknown-repo",
      branch_or_workspace_id: scopeHints.branch
    });
  }

  if (scopeHints.repo) {
    return normalizeScope({
      level: "repository",
      repository_id: scopeHints.repo
    });
  }

  return normalizeScope({
    level: "session",
    session_id: normalizedEvent.session_ref
  });
}

export function confidenceFromSignals(parts = []) {
  const total = parts.reduce((sum, part) => sum + Number(part ?? 0), 0);
  return clampScore(total);
}

export function dedupeBy(array, keyResolver) {
  const seen = new Set();
  const out = [];

  for (const item of asArray(array)) {
    const key = keyResolver(item);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(item);
  }

  return out;
}

export function lexicalSimilarity(left, right) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));

  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

export function signatureForCandidate(candidate) {
  const scopeKey = buildScopeKey(candidate.scope);
  return `${scopeKey}::${candidate.atom_type}::${normalizeText(candidate.content)}`;
}

export function safeString(value) {
  return String(value ?? "").trim();
}
