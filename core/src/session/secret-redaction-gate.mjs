import { makeDeterministicId } from "./utils.mjs";

const REDACT_PATTERNS = [
  {
    code: "api_key",
    regex: /\b(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/g,
    replacement: "[REDACTED_API_KEY]"
  },
  {
    code: "token_paste",
    regex: /\b(token|access[_-]?token)\s*[:=]\s*['\"]?[A-Za-z0-9_\-.]{10,}['\"]?/gi,
    replacement: "$1=[REDACTED_TOKEN]"
  },
  {
    code: "credential_inline",
    regex: /\b(username|user|login)\s*[:=]\s*\S+\s+password\s*[:=]\s*\S+/gi,
    replacement: "[REDACTED_CREDENTIALS]"
  }
];

const BLOCK_PATTERNS = [
  {
    code: "private_key",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i
  },
  {
    code: "password_disclosure",
    regex: /\b(password|passphrase)\s*[:=]\s*\S+/i
  }
];

export class SecretRedactionGate {
  constructor(options = {}) {
    this.auditPrefix = options.auditPrefix ?? "redaction";
  }

  inspect(text, context = {}) {
    const original = String(text ?? "");
    const reasonCodes = [];

    for (const blocker of BLOCK_PATTERNS) {
      if (blocker.regex.test(original)) {
        reasonCodes.push(blocker.code);
      }
    }

    if (reasonCodes.length > 0) {
      return {
        outcome: "block",
        value: "",
        reason_codes: reasonCodes,
        transformation_summary: "blocked",
        audit_ref: makeDeterministicId(this.auditPrefix, ["block", context.id, ...reasonCodes])
      };
    }

    let transformed = original;
    for (const redactor of REDACT_PATTERNS) {
      if (redactor.regex.test(transformed)) {
        transformed = transformed.replace(redactor.regex, redactor.replacement);
        reasonCodes.push(redactor.code);
      }
    }

    if (reasonCodes.length > 0) {
      return {
        outcome: "redact",
        value: transformed,
        reason_codes: reasonCodes,
        transformation_summary: "masked_secret_tokens",
        audit_ref: makeDeterministicId(this.auditPrefix, ["redact", context.id, ...reasonCodes])
      };
    }

    return {
      outcome: "allow",
      value: original,
      reason_codes: [],
      transformation_summary: "unchanged",
      audit_ref: makeDeterministicId(this.auditPrefix, ["allow", context.id ?? "none"])
    };
  }
}
