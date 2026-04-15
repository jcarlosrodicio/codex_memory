import { normalizeText, tokenize } from "../retrieval/utils.mjs";

const GENERIC_SYSTEM_PATTERNS = [
  /\byou are a helpful assistant\b/i,
  /\byour job is to\b/i,
  /\byou will be presented\b/i,
  /\bthe title you generate\b/i,
  /\bshown in the ui\b/i,
  /\bgenerate a concise\b/i,
  /\bshort title for a task\b/i,
  /\bfor example requests for bug fixes\b/i,
  /\bthe tasks typically have to do with coding-related tasks\b/i,
  /::code-comment/i,
  /\breview findings\b/i
];

const REVIEW_CHATTER_PATTERNS = [
  /\bno encontr[eé] findings nuevos\b/i,
  /\bno new findings\b/i,
  /\blgtm\b/i,
  /\blooks good to me\b/i,
  /\best[aá] bien plantead/i,
  /\best[aá] correcto\b/i,
  /\breview findings\b/i,
  /\bno findings\b/i
];

const CONVERSATIONAL_NOISE_PATTERNS = [
  /\bmi conclusi[oó]n es\b/i,
  /\bprometedor\b/i,
  /\bya puedo hacer una valoraci[oó]n\b/i,
  /\byo har[ií]a esto\b/i,
  /\bsiguiente paso razonable\b/i,
  /^\s*(s[ií]|vale|ok|okay)\s*[:,-]/i
];

const META_SCAFFOLDING_PATTERNS = [
  /^#+\s/,
  /^[-*]\s/,
  /^\[p\d+\]/i,
  /^\*\*\[p\d+\]/i
];

const DURABLE_DOMAIN_TOKENS = [
  "repo",
  "branch",
  "workflow",
  "constraint",
  "test",
  "hook",
  "memory",
  "semantic",
  "scope",
  "config",
  "store",
  "token",
  "budget",
  "inject",
  "prompt",
  "node",
  "spec",
  "codex",
  "runtime",
  "audit",
  "duplicate",
  "compact",
  "cleanup",
  "index",
  "persist",
  "capsule",
  "atom",
  "edge",
  "default",
  "path"
];

const ACTION_TOKENS = [
  "run",
  "keep",
  "use",
  "avoid",
  "rebuild",
  "compact",
  "dedupe",
  "persist",
  "install",
  "enable",
  "disable",
  "verify",
  "inspect",
  "update",
  "remove",
  "fix"
];

const OPEN_LOOP_TOKENS = [
  "todo",
  "follow up",
  "follow-up",
  "pending",
  "next release",
  "need to",
  "remaining",
  "must still"
];

const USEFUL_TOKEN_HINTS = [
  "repo",
  "branch",
  "workflow",
  "constraint",
  "test",
  "hook",
  "memory",
  "semantic",
  "scope",
  "config",
  "store",
  "token",
  "budget",
  "inject",
  "prompt",
  "node",
  "spec",
  "codex"
];

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "have", "i",
  "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "we", "with",
  "you", "your"
]);

function informativeTokenCount(text) {
  return tokenize(text).filter((token) => !STOPWORDS.has(token)).length;
}

function looksGeneric(text) {
  return GENERIC_SYSTEM_PATTERNS.some((pattern) => pattern.test(text));
}

function looksLikeMetaScaffolding(text) {
  return META_SCAFFOLDING_PATTERNS.some((pattern) => pattern.test(text));
}

function looksLikeReviewChatter(text) {
  return REVIEW_CHATTER_PATTERNS.some((pattern) => pattern.test(text));
}

function looksConversational(text) {
  return CONVERSATIONAL_NOISE_PATTERNS.some((pattern) => pattern.test(text));
}

function hasUsefulSpecificity(text) {
  if (/[`/\\_-]/.test(text) || /\d/.test(text)) {
    return true;
  }

  return USEFUL_TOKEN_HINTS.some((token) => normalizeText(text).includes(token));
}

function hasDurableDomainAnchor(text) {
  const normalized = normalizeText(text);
  return DURABLE_DOMAIN_TOKENS.some((token) => normalized.includes(token));
}

function hasActionAnchor(text) {
  const normalized = normalizeText(text);
  return ACTION_TOKENS.some((token) => normalized.includes(token));
}

function looksLikePathReferenceNoise(text) {
  const normalized = normalizeText(text);
  const hasAbsoluteUserPath = /\/users\/[^/\s]+\/.+/i.test(text);
  const hasLineReference = /:\d+(?:-\d+)?\b/.test(text);
  const hasPathHeavyMarkdown = /\[[^\]]+\]\([^)]*\/[^)]*\)/.test(text);
  const hasReviewContext = /\b(test nuevo|finding|review|fix)\b/i.test(text);

  if (!(hasAbsoluteUserPath || hasLineReference || hasPathHeavyMarkdown)) {
    return false;
  }

  if (normalized.includes("default store path") || normalized.includes("config path")) {
    return false;
  }

  return hasReviewContext || !hasDurableDomainAnchor(text);
}

function looksLikeOpenLoop(text) {
  const normalized = normalizeText(text);
  return OPEN_LOOP_TOKENS.some((token) => normalized.includes(token));
}

export function assessMemoryQuality(content, { atomType = null } = {}) {
  const raw = String(content ?? "").trim();
  const normalized = normalizeText(raw);
  const tokenCount = tokenize(raw).length;
  const informativeCount = informativeTokenCount(raw);

  if (!raw) {
    return { accepted: false, reason: "empty_content" };
  }

  if (looksGeneric(raw)) {
    return { accepted: false, reason: "generic_system_scaffolding" };
  }

  if (looksLikeMetaScaffolding(raw)) {
    return { accepted: false, reason: "meta_scaffolding" };
  }

  if (looksLikeReviewChatter(raw)) {
    return { accepted: false, reason: "review_chatter" };
  }

  if (looksConversational(raw) && !hasDurableDomainAnchor(raw)) {
    return { accepted: false, reason: "conversational_noise" };
  }

  if (looksLikePathReferenceNoise(raw)) {
    return { accepted: false, reason: "path_reference_noise" };
  }

  const allowsCompactRule = ["preference", "constraint", "decision"].includes(atomType);
  const minLength = allowsCompactRule ? 12 : 18;
  const minTokens = allowsCompactRule ? 3 : 4;
  const minInformative = allowsCompactRule ? 2 : 3;

  if (raw.endsWith(":") || raw.length < minLength || tokenCount < minTokens || informativeCount < minInformative) {
    return { accepted: false, reason: "too_trivial_for_durable_memory" };
  }

  if ((atomType === "fact" || atomType === "workflow") && !hasUsefulSpecificity(raw)) {
    return { accepted: false, reason: "insufficient_specificity" };
  }

  if (atomType === "workflow" && !hasActionAnchor(raw)) {
    return { accepted: false, reason: "missing_action_anchor" };
  }

  if (atomType === "open_loop" && (!looksLikeOpenLoop(raw) || !hasDurableDomainAnchor(raw))) {
    return { accepted: false, reason: "non_durable_open_loop" };
  }

  if (["fact", "bugfix", "decision"].includes(atomType) && !hasDurableDomainAnchor(raw)) {
    return { accepted: false, reason: "missing_durable_anchor" };
  }

  if (normalized === "you are a helpful assistant") {
    return { accepted: false, reason: "generic_system_scaffolding" };
  }

  return {
    accepted: true,
    reason: "durable_memory_candidate"
  };
}

export function isNoiseMemoryRecord(record) {
  if (!record || typeof record !== "object") {
    return false;
  }

  if (record.atom_type) {
    return !assessMemoryQuality(record.content, { atomType: record.atom_type }).accepted;
  }

  if (record.summary) {
    return !assessMemoryQuality(record.summary, { atomType: "capsule" }).accepted;
  }

  return false;
}
